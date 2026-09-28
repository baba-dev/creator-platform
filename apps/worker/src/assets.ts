import {
  createAssetVariantObjectKey,
  LocalAssetStorage,
} from "@aiwa/assets/storage";
import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import sharp from "sharp";

const env = parseServerEnv();
const storage = new LocalAssetStorage(env.ASSET_STORAGE_ROOT);

async function saveVariant(input: {
  assetId: string;
  organizationId: string;
  kind: "THUMBNAIL" | "PREVIEW" | "POSTER";
  bytes: Buffer;
  width: number;
  height: number;
}) {
  const objectKey = createAssetVariantObjectKey(input.organizationId, "webp");
  const stored = await storage.put(objectKey, input.bytes);
  try {
    await db.assetVariant.upsert({
      where: { assetId_kind: { assetId: input.assetId, kind: input.kind } },
      create: {
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
      update: {
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
    // libvips does not decode arbitrary MP4 frames. Generate a safe bounded
    // poster immediately; the video itself remains available in the inspector.
    // A future ffmpeg-backed extractor can replace this variant in place.
    const svg = Buffer.from(
      '<svg width="960" height="540" xmlns="http://www.w3.org/2000/svg"><rect width="960" height="540" fill="#18181b"/><circle cx="480" cy="270" r="72" fill="#ffffff" fill-opacity=".12"/><path d="M458 224 L458 316 L536 270 Z" fill="#ffffff" fill-opacity=".9"/><text x="480" y="410" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#ffffff" fill-opacity=".72">VIDEO PREVIEW</text></svg>',
    );
    const poster = await sharp(svg)
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
