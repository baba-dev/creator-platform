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
  const stored = await storage.put(objectKey, input.bytes);
  try {
    await db.assetVariant.create({
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
export async function processAssetDerivatives(assetId: string): Promise<void> {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    include: { variants: true },
  });
  if (!asset || asset.status !== "READY" || asset.storageProvider !== "LOCAL") {
    return;
  }

  const kinds = new Set(asset.variants.map((variant) => variant.kind));
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
 * Permanently remove expired trash only after both the original and every
 * derivative have been deleted. A failed filesystem delete leaves database
 * state untouched so the next maintenance pass can retry safely.
 */
export async function purgeExpiredAssets(limit = 50): Promise<number> {
  const assets = await db.asset.findMany({
    where: { status: "DELETED", purgeAfter: { lte: new Date() } },
    include: { variants: true },
    orderBy: { purgeAfter: "asc" },
    take: limit,
  });
  let purged = 0;
  for (const asset of assets) {
    for (const variant of asset.variants) {
      await storage.delete(variant.objectKey);
    }
    await storage.delete(asset.objectKey);
    await db.$transaction(async (tx) => {
      const current = await tx.asset.findFirst({
        where: {
          id: asset.id,
          status: "DELETED",
          purgeAfter: { lte: new Date() },
        },
      });
      if (!current) return;
      await tx.assetVariant.deleteMany({ where: { assetId: current.id } });
      await tx.asset.update({
        where: { id: current.id },
        data: {
          status: "PURGED",
          byteSize: 0n,
          sha256: null,
          purgeAfter: null,
        },
      });
      await tx.assetStorageUsage.updateMany({
        where: { organizationId: current.organizationId },
        data: {
          usedBytes: { decrement: current.byteSize },
          version: { increment: 1 },
        },
      });
      purged += 1;
    });
  }
  return purged;
}
