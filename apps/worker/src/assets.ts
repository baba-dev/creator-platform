import {
  assertMediaOwnership,
  completeMediaTask,
  recordMediaOutput,
} from "./media-tasks";
import { claimExpiredAssetForPurge, completeAssetPurge } from "@aiwa/assets";
import {
  createAssetVariantObjectKey,
  LocalAssetStorage,
} from "@aiwa/assets/storage";
import { parseServerEnv, parseMediaEnv } from "@aiwa/config";
import { db, Prisma } from "@aiwa/db";
import sharp from "sharp";
import { mediaCommand } from "./video-media";
import { resolveLocalAssetPath } from "@aiwa/assets/storage";
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
  if (!asset || asset.status !== "READY" || asset.storageProvider !== "LOCAL") {
    return;
  }

  const kinds = new Set<string>(asset.variants.map((variant) => variant.kind));
  if (onlyKind)
    for (const kind of [
      "THUMBNAIL",
      "PREVIEW",
      "POSTER",
      "STORYBOARD",
      "WAVEFORM",
    ])
      if (kind !== onlyKind) kinds.add(kind);
  if (asset.mediaKind === "IMAGE") {
    const original = await storage.read(asset.objectKey);
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
        resolveLocalAssetPath(env.ASSET_STORAGE_ROOT, asset.objectKey),
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
      env.ASSET_STORAGE_ROOT,
      asset.objectKey,
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
    const waveform = await audioWaveform(
      env.ASSET_STORAGE_ROOT,
      asset.objectKey,
    );
    await saveVariant({
      assetId,
      organizationId: asset.organizationId,
      kind: "WAVEFORM",
      bytes: waveform.data,
      width: waveform.info.width,
      height: waveform.info.height,
    });
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
    const claimed = await db.$transaction((tx) =>
      claimExpiredAssetForPurge(tx, {
        assetId: candidate.id,
        organizationId: candidate.organizationId,
        now,
      }),
    );
    if (!claimed) continue;

    try {
      for (const variant of claimed.variants) {
        await storage.delete(variant.objectKey);
      }
      await storage.delete(claimed.objectKey);
    } catch {
      // Keep PURGING so a later maintenance pass can retry idempotent deletes.
      console.error("Asset purge deletion failed; retry remains eligible.", {
        assetId: claimed.id,
      });
      continue;
    }

    const completed = await db.$transaction((tx) =>
      completeAssetPurge(tx, {
        assetId: claimed.id,
        organizationId: claimed.organizationId,
      }),
    );
    if (completed) purged += 1;
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
    const [asset, variant] = await Promise.all([
      db.asset.findUnique({ where: { objectKey } }),
      db.assetVariant.findUnique({ where: { objectKey } }),
    ]);
    if (!asset && !variant) await storage.delete(objectKey);
    await db.mediaTaskAttempt.updateMany({
      where: { id: attempt.id, outputObjectKey: objectKey },
      data: { outputObjectKey: null },
    });
  }
}
