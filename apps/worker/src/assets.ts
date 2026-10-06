import {
  assertMediaOwnership,
  completeMediaTask,
  MediaPermanentFailure,
  recordMediaOutput,
} from "./media-tasks";
import {
  MediaProbeValidationError,
  probeUploadedMedia,
} from "@aiwa/assets/media-probe";
import {
  claimExpiredAssetForPurge,
  commitAssetVariantStorage,
  completeAssetPurge,
} from "@aiwa/assets";
import {
  createAssetVariantObjectKey,
  LocalAssetStorage,
  resolveAssetStorageForAsset,
} from "@aiwa/assets/storage";
import { parseServerEnv, parseMediaEnv } from "@aiwa/config";
import { db, Prisma } from "@aiwa/db";
import sharp from "sharp";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mediaCommand } from "./video-media";
import { audioWaveform, videoStoryboard } from "./media-variants";

const env = parseServerEnv();
const storage = new LocalAssetStorage(env.ASSET_STORAGE_ROOT);

async function saveVariant(input: {
  assetId: string;
  organizationId: string;
  kind: "THUMBNAIL" | "PREVIEW" | "POSTER" | "STORYBOARD" | "WAVEFORM";
  bytes: Buffer;
  width: number;
  height: number;
}) {
  const objectKey = createAssetVariantObjectKey(input.organizationId, "webp");
  await recordMediaOutput(objectKey);
  const stored = await storage.put(objectKey, input.bytes);
  try {
    await db.$transaction(async (tx) => {
      await assertMediaOwnership(tx);
      await tx.$queryRaw`SELECT id FROM Asset WHERE id = ${input.assetId} FOR UPDATE`;
      const asset = await tx.asset.findUnique({ where: { id: input.assetId } });
      if (!asset || asset.status !== "READY")
        throw new Error("Asset is no longer available.");
      await commitAssetVariantStorage(tx, {
        organizationId: input.organizationId,
        userId: asset.storageOwnerUserId,
        byteSize: stored.byteSize,
      });
      await tx.assetVariant.create({
        data: {
          assetId: input.assetId,
          kind: input.kind,
          storageProvider: "LOCAL",
          objectKey,
          mimeType: "image/webp",
          byteSize: stored.byteSize,
          sha256: stored.sha256,
          width: input.width,
          height: input.height,
        },
      });
      await completeMediaTask(tx);
    });
  } catch (error) {
    await storage.delete(objectKey).catch(() => undefined);
    // A concurrent worker won the same variant. Preserve its object and row.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return;
    throw error;
  }
}

function metadataExtension(asset: {
  mediaKind: string;
  mimeType: string;
}): string {
  if (asset.mediaKind === "VIDEO") {
    return asset.mimeType === "video/quicktime" ? "mov" : "mp4";
  }
  if (asset.mimeType === "audio/wav" || asset.mimeType === "audio/x-wav") {
    return "wav";
  }
  if (asset.mimeType === "audio/ogg") return "ogg";
  return "mp3";
}

async function quarantineInvalidAsset(
  assetId: string,
  organizationId: string,
  reason: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await assertMediaOwnership(tx);
    await tx.$queryRaw`SELECT id FROM Asset WHERE id = ${assetId} FOR UPDATE`;
    const current = await tx.asset.findUnique({ where: { id: assetId } });
    if (!current || current.status !== "READY") return;
    await tx.asset.update({
      where: { id: assetId },
      data: { status: "QUARANTINED" },
    });
    await tx.auditEvent.create({
      data: {
        organizationId,
        action: "asset.media_validation_failed",
        targetType: "Asset",
        targetId: assetId,
        metadata: { reason },
      },
    });
  });
}

/**
 * Probe canonical media only on the media worker. Transient storage/tooling
 * failures remain retryable; permanently invalid media is quarantined so it
 * can never be consumed as a READY generation input.
 */
export async function processAssetMetadata(assetId: string): Promise<void> {
  const asset = await db.asset.findUnique({ where: { id: assetId } });
  if (!asset || asset.status !== "READY") return;
  if (!["IMAGE", "VIDEO", "AUDIO"].includes(asset.mediaKind)) return;

  const sourceStorage = await resolveAssetStorageForAsset(db, asset, {
    storageRoot: env.ASSET_STORAGE_ROOT,
    encryptionKey: env.STORAGE_ENCRYPTION_KEY,
    googleClientId: env.GOOGLE_DRIVE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
    onedriveClientId: env.ONEDRIVE_CLIENT_ID,
    onedriveClientSecret: env.ONEDRIVE_CLIENT_SECRET,
  });
  const original = await sourceStorage.read(
    asset.objectKey,
    asset.externalFileId ?? undefined,
  );

  let width: number | null = null;
  let height: number | null = null;
  let durationMs: number | null = null;

  if (asset.mediaKind === "IMAGE") {
    try {
      const metadata = await sharp(original, { failOn: "error" })
        .rotate()
        .metadata();
      width = metadata.width ?? null;
      height = metadata.height ?? null;
      if (!width || !height) {
        throw new Error("Image metadata is unavailable.");
      }
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Invalid image payload.";
      await quarantineInvalidAsset(assetId, asset.organizationId, reason);
      throw new MediaPermanentFailure(reason);
    }
  } else {
    const work = await mkdtemp(join(tmpdir(), "aiwa-asset-metadata-"));
    try {
      const sourcePath = join(work, `source.${metadataExtension(asset)}`);
      await writeFile(sourcePath, original, { mode: 0o600 });
      try {
        const probed = await probeUploadedMedia(
          sourcePath,
          asset.mediaKind as "VIDEO" | "AUDIO",
        );
        width = probed.width;
        height = probed.height;
        durationMs = probed.durationMs;
      } catch (error) {
        if (error instanceof MediaProbeValidationError) {
          await quarantineInvalidAsset(
            assetId,
            asset.organizationId,
            error.message,
          );
          throw new MediaPermanentFailure(error.message);
        }
        throw error;
      }
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  await db.$transaction(async (tx) => {
    await assertMediaOwnership(tx);
    await tx.$queryRaw`SELECT id FROM Asset WHERE id = ${assetId} FOR UPDATE`;
    const current = await tx.asset.findUnique({ where: { id: assetId } });
    if (!current || current.status !== "READY") return;
    await tx.asset.update({
      where: { id: assetId },
      data: { width, height, durationMs },
    });
  });
}

/**
 * Produce bounded media used by library grids and inspectors. Originals stay
 * private and are never fetched merely to paint a card.
 */
export async function processAssetDerivatives(
  assetId: string,
  onlyKind?: string,
): Promise<void> {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    include: { variants: true },
  });
  if (!asset || asset.status !== "READY") return;

  const sourceStorage = await resolveAssetStorageForAsset(db, asset, {
    storageRoot: env.ASSET_STORAGE_ROOT,
    encryptionKey: env.STORAGE_ENCRYPTION_KEY,
    googleClientId: env.GOOGLE_DRIVE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
    onedriveClientId: env.ONEDRIVE_CLIENT_ID,
    onedriveClientSecret: env.ONEDRIVE_CLIENT_SECRET,
  });

  const kinds = new Set<string>(asset.variants.map((variant) => variant.kind));
  if (onlyKind) {
    for (const kind of [
      "THUMBNAIL",
      "PREVIEW",
      "POSTER",
      "STORYBOARD",
      "WAVEFORM",
    ]) {
      if (kind !== onlyKind) kinds.add(kind);
    }
  }

  if (asset.mediaKind === "IMAGE") {
    const original = await sourceStorage.read(
      asset.objectKey,
      asset.externalFileId ?? undefined,
    );
    if (!kinds.has("THUMBNAIL")) {
      const image = sharp(original, { failOn: "error" }).rotate();
      const bytes = await image
        .clone()
        .resize(560, 560, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 78, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      await saveVariant({
        assetId,
        organizationId: asset.organizationId,
        kind: "THUMBNAIL",
        bytes: bytes.data,
        width: bytes.info.width,
        height: bytes.info.height,
      });
    }
    if (!kinds.has("PREVIEW")) {
      const preview = await sharp(original, { failOn: "error" })
        .rotate()
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 86, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      await saveVariant({
        assetId,
        organizationId: asset.organizationId,
        kind: "PREVIEW",
        bytes: preview.data,
        width: preview.info.width,
        height: preview.info.height,
      });
    }
    return;
  }

  const work = await mkdtemp(join(tmpdir(), "aiwa-asset-derivative-"));
  const extension =
    asset.mediaKind === "VIDEO"
      ? "mp4"
      : asset.mimeType === "audio/wav"
        ? "wav"
        : "mp3";
  const tempKey = `source.${extension}`;
  try {
    const sourcePath = join(work, tempKey);
    if (asset.storageProvider === "LOCAL") {
      const original = await storage.read(asset.objectKey);
      await writeFile(sourcePath, original, { mode: 0o600 });
    } else {
      const original = await sourceStorage.read(
        asset.objectKey,
        asset.externalFileId ?? undefined,
      );
      await writeFile(sourcePath, original, { mode: 0o600 });
    }

    if (asset.mediaKind === "VIDEO" && !kinds.has("POSTER")) {
      const frame = await mediaCommand(
        "ffmpeg",
        [
          "-nostdin",
          "-v",
          "error",
          "-ss",
          "0.1",
          "-i",
          sourcePath,
          "-frames:v",
          "1",
          "-vf",
          "scale=960:-2:force_original_aspect_ratio=decrease",
          "-f",
          "image2pipe",
          "-vcodec",
          "mjpeg",
          "pipe:1",
        ],
        parseMediaEnv().MEDIA_DERIVATIVE_TIMEOUT_MS,
      );
      const poster = await sharp(frame)
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      await saveVariant({
        assetId,
        organizationId: asset.organizationId,
        kind: "POSTER",
        bytes: poster.data,
        width: poster.info.width,
        height: poster.info.height,
      });
    }

    if (asset.mediaKind === "VIDEO" && !kinds.has("STORYBOARD")) {
      const storyboard = await videoStoryboard(
        work,
        tempKey,
        asset.durationMs ?? 120_000,
      );
      await saveVariant({
        assetId,
        organizationId: asset.organizationId,
        kind: "STORYBOARD",
        bytes: storyboard.data,
        width: storyboard.info.width,
        height: storyboard.info.height,
      });
    }

    if (asset.mediaKind === "AUDIO" && !kinds.has("WAVEFORM")) {
      const waveform = await audioWaveform(work, tempKey);
      await saveVariant({
        assetId,
        organizationId: asset.organizationId,
        kind: "WAVEFORM",
        bytes: waveform.data,
        width: waveform.info.width,
        height: waveform.info.height,
      });
    }
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Permanently remove expired trash only after atomically claiming PURGING.
 *
 * Restore and purge contend on the same locked Asset row. Once PURGING is
 * committed, the asset is no longer restorable and filesystem deletion may
 * begin. Failed deletes leave PURGING + purgeAfter intact so a later pass can
 * retry safely; LocalAssetStorage.delete is idempotent.
 */
export async function purgeExpiredAssets(limit = 50): Promise<number> {
  const now = new Date();
  const candidates = await db.asset.findMany({
    where: {
      status: { in: ["DELETED", "PURGING"] },
      purgeAfter: { lte: now },
    },
    select: { id: true, organizationId: true },
    orderBy: { purgeAfter: "asc" },
    take: limit,
  });

  let purged = 0;
  for (const candidate of candidates) {
    let claimed: Awaited<ReturnType<typeof claimExpiredAssetForPurge>> = null;
    try {
      claimed = await db.$transaction((tx) =>
        claimExpiredAssetForPurge(tx, {
          assetId: candidate.id,
          organizationId: candidate.organizationId,
          now,
        }),
      );
    } catch (claimError) {
      console.error("Failed to claim asset for purge; applying backoff.", {
        assetId: candidate.id,
        error: claimError,
      });
      await db.asset
        .updateMany({
          where: {
            id: candidate.id,
            status: { in: ["DELETED", "PURGING"] },
          },
          data: { purgeAfter: new Date(Date.now() + 15 * 60_000) },
        })
        .catch(() => undefined);
      continue;
    }
    if (!claimed) continue;

    try {
      for (const variant of claimed.variants) {
        await storage.delete(variant.objectKey);
      }
      const canonicalStorage = await resolveAssetStorageForAsset(db, claimed, {
        storageRoot: env.ASSET_STORAGE_ROOT,
        encryptionKey: env.STORAGE_ENCRYPTION_KEY,
        googleClientId: env.GOOGLE_DRIVE_CLIENT_ID,
        googleClientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
        onedriveClientId: env.ONEDRIVE_CLIENT_ID,
        onedriveClientSecret: env.ONEDRIVE_CLIENT_SECRET,
      });
      await canonicalStorage.delete(
        claimed.objectKey,
        claimed.externalFileId ?? undefined,
      );
    } catch (deleteError) {
      // Record failure with bounded retry / backoff so this item does not block others every cycle
      console.error("Asset purge deletion failed; applying retry backoff.", {
        assetId: claimed.id,
        error: deleteError,
      });
      await db.asset
        .updateMany({
          where: { id: claimed.id, status: "PURGING" },
          data: { purgeAfter: new Date(Date.now() + 15 * 60_000) },
        })
        .catch(() => undefined);
      continue;
    }

    try {
      const completed = await db.$transaction((tx) =>
        completeAssetPurge(tx, {
          assetId: claimed.id,
          organizationId: claimed.organizationId,
        }),
      );
      if (completed) purged += 1;
    } catch (completeError) {
      console.error("Failed to complete asset purge; applying backoff.", {
        assetId: claimed.id,
        error: completeError,
      });
      await db.asset
        .updateMany({
          where: { id: claimed.id, status: "PURGING" },
          data: { purgeAfter: new Date(Date.now() + 15 * 60_000) },
        })
        .catch(() => undefined);
    }
  }

  return purged;
}

/** Never reclaim an active/review output; inspect canonical rows before deleting. */
export async function purgeMediaAttemptOutputs(limit = 50): Promise<void> {
  const attempts = await db.mediaTaskAttempt.findMany({
    where: {
      outputObjectKey: { not: null },
      outcome: { in: ["FAILED", "ABANDONED", "REVOKED"] },
    },
    orderBy: { startedAt: "asc" },
    take: limit,
  });
  for (const attempt of attempts) {
    const objectKey = attempt.outputObjectKey!;
    try {
      const [asset, variant] = await Promise.all([
        db.asset.findUnique({ where: { objectKey } }),
        db.assetVariant.findUnique({ where: { objectKey } }),
      ]);
      if (!asset && !variant) await storage.delete(objectKey);
      await db.mediaTaskAttempt.updateMany({
        where: { id: attempt.id, outputObjectKey: objectKey },
        data: { outputObjectKey: null },
      });
    } catch (error) {
      // Keep the output key attached so a later maintenance pass can retry.
      console.error("Media attempt output cleanup failed; retry retained.", {
        attemptId: attempt.id,
        error,
      });
    }
  }
}
