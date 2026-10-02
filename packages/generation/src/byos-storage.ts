import {
  createAssetVariantObjectKey,
  LocalAssetStorage,
  resolveOrganizationStorage,
} from "@aiwa/assets/storage";
import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import sharp from "sharp";

export async function storeGeneratedMedia(input: {
  organizationId: string;
  assetId: string;
  objectKey: string;
  bytes: Buffer;
  mimeType: string;
  mediaKind: "IMAGE" | "VIDEO" | "AUDIO";
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}): Promise<{
  byteSize: bigint;
  sha256: string;
  storageProvider: "LOCAL" | "S3" | "GOOGLE_DRIVE" | "ONEDRIVE";
  externalFileId?: string | null;
  width?: number | null;
  height?: number | null;
}> {
  const env = parseServerEnv();
  const targetStorage = await resolveOrganizationStorage(
    db,
    input.organizationId,
    {
      storageRoot: env.ASSET_STORAGE_ROOT,
      encryptionKey: env.STORAGE_ENCRYPTION_KEY,
      googleClientId: env.GOOGLE_DRIVE_CLIENT_ID,
      googleClientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
      onedriveClientId: env.ONEDRIVE_CLIENT_ID,
      onedriveClientSecret: env.ONEDRIVE_CLIENT_SECRET,
    },
  );

  const localPlatformStorage = new LocalAssetStorage(env.ASSET_STORAGE_ROOT);

  if (targetStorage.provider === "LOCAL") {
    const stored = await localPlatformStorage.put(input.objectKey, input.bytes);
    return {
      byteSize: stored.byteSize,
      sha256: stored.sha256,
      storageProvider: "LOCAL",
      externalFileId: null,
      width: input.width,
      height: input.height,
    };
  }

  // Hybrid Approach C: Generate lightweight derivatives locally on platform storage
  let calculatedWidth = input.width;
  let calculatedHeight = input.height;

  if (input.mediaKind === "IMAGE") {
    try {
      const img = sharp(input.bytes, { failOn: "error" }).rotate();
      const meta = await img.metadata();
      calculatedWidth = meta.width ?? calculatedWidth;
      calculatedHeight = meta.height ?? calculatedHeight;

      const thumb = await img
        .clone()
        .resize(560, 560, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true });

      const thumbKey = createAssetVariantObjectKey(
        input.organizationId,
        "webp",
      );
      const storedThumb = await localPlatformStorage.put(thumbKey, thumb.data);

      await db.assetVariant
        .create({
          data: {
            assetId: input.assetId,
            kind: "THUMBNAIL",
            storageProvider: "LOCAL",
            objectKey: thumbKey,
            mimeType: "image/webp",
            byteSize: storedThumb.byteSize,
            sha256: storedThumb.sha256,
            width: thumb.info.width,
            height: thumb.info.height,
          },
        })
        .catch(() => undefined);
    } catch {
      // Derivative generation non-fatal
    }
  }

  // Stream heavy canonical original directly to User's BYOS (Google Drive / OneDrive Creators-Data folder)
  const stored = await targetStorage.put(
    input.objectKey,
    input.bytes,
    input.mimeType,
  );

  return {
    byteSize: stored.byteSize,
    sha256: stored.sha256,
    storageProvider: targetStorage.provider,
    externalFileId: stored.externalFileId ?? null,
    width: calculatedWidth,
    height: calculatedHeight,
  };
}
