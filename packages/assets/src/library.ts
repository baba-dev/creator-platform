import type { Prisma } from "@aiwa/db";
import {
  normalizeAssetName,
  normalizeOriginalFilename,
  type AssetMediaKind,
} from "./index";
import {
  finalizeAssetStorage,
  releaseAssetStorage,
  reserveAssetStorage,
} from "./service";

export const ASSET_TRASH_RETENTION_DAYS = 30;
export const MAX_ASSET_BULK_SELECTION = 100;
export const MAX_UPLOAD_BYTES = 104_857_600;

const uploadLimits: Record<AssetMediaKind, bigint> = {
  IMAGE: 25_000_000n,
  VIDEO: 100_000_000n,
  AUDIO: 50_000_000n,
  DOCUMENT: 25_000_000n,
  OTHER: 10_000_000n,
};

export type InspectedUpload = {
  mediaKind: AssetMediaKind;
  mimeType: string;
  extension: string;
};

function hasPrefix(bytes: Buffer, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Buffer, start: number, length: number): string {
  return bytes.subarray(start, start + length).toString("ascii");
}

/**
 * Validate an uploaded object using binary signatures rather than trusting
 * browser Content-Type metadata. Deliberately support a conservative media set
 * that can be previewed safely by the product.
 */
export function inspectAssetUpload(
  bytes: Buffer,
  originalFilename: string,
): InspectedUpload {
  if (bytes.byteLength === 0) throw new Error("Uploaded file is empty.");

  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mediaKind: "IMAGE", mimeType: "image/png", extension: "png" };
  }
  if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) {
    return { mediaKind: "IMAGE", mimeType: "image/jpeg", extension: "jpg" };
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return { mediaKind: "IMAGE", mimeType: "image/webp", extension: "webp" };
  }
  if (bytes.byteLength >= 12 && ascii(bytes, 4, 4) === "ftyp") {
    return { mediaKind: "VIDEO", mimeType: "video/mp4", extension: "mp4" };
  }
  if (
    ascii(bytes, 0, 3) === "ID3" ||
    (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
  ) {
    return { mediaKind: "AUDIO", mimeType: "audio/mpeg", extension: "mp3" };
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") {
    return { mediaKind: "AUDIO", mimeType: "audio/wav", extension: "wav" };
  }
  if (ascii(bytes, 0, 5) === "%PDF-") {
    return {
      mediaKind: "DOCUMENT",
      mimeType: "application/pdf",
      extension: "pdf",
    };
  }

  throw new Error(
    `Unsupported file type for "${normalizeOriginalFilename(originalFilename) ?? "upload"}".`,
  );
}

export function assertUploadSize(
  mediaKind: AssetMediaKind,
  byteSize: bigint,
): void {
  const limit = uploadLimits[mediaKind];
  if (byteSize > limit) {
    throw new Error(
      `${mediaKind.toLowerCase()} upload exceeds the ${Number(limit / 1_000_000n)} MB limit.`,
    );
  }
}

export async function createPendingUpload(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    userId: string;
    projectId?: string | null;
    folderId?: string | null;
    objectKey: string;
    mediaKind: AssetMediaKind;
    mimeType: string;
    byteSize: bigint;
    originalFilename: string;
    name?: string | null;
  },
) {
  await reserveAssetStorage(tx, {
    organizationId: input.organizationId,
    userId: input.userId,
    proposedBytes: input.byteSize,
  });

  return tx.asset.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      folderId: input.folderId ?? null,
      storageOwnerUserId: input.userId,
      createdById: input.userId,
      uploadedById: input.userId,
      status: "PENDING",
      mediaKind: input.mediaKind,
      sourceType: "UPLOADED",
      storageProvider: "LOCAL",
      name: normalizeAssetName(input.name, input.originalFilename),
      originalFilename: normalizeOriginalFilename(input.originalFilename),
      objectKey: input.objectKey,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
    },
  });
}

export async function finalizeUploadedAsset(
  tx: Prisma.TransactionClient,
  input: {
    assetId: string;
    organizationId: string;
    reservedBytes: bigint;
    actualBytes: bigint;
    sha256: string;
    width?: number | null;
    height?: number | null;
    durationMs?: number | null;
  },
) {
  const asset = await tx.asset.findFirst({
    where: {
      id: input.assetId,
      organizationId: input.organizationId,
      status: "PENDING",
    },
  });
  if (!asset) throw new Error("Pending asset no longer exists.");

  await finalizeAssetStorage(tx, {
    organizationId: input.organizationId,
    reservedBytes: input.reservedBytes,
    actualBytes: input.actualBytes,
  });

  return tx.asset.update({
    where: { id: input.assetId },
    data: {
      status: "READY",
      byteSize: input.actualBytes,
      sha256: input.sha256,
      width: input.width ?? null,
      height: input.height ?? null,
      durationMs: input.durationMs ?? null,
    },
  });
}

export async function failPendingUpload(
  tx: Prisma.TransactionClient,
  input: {
    assetId: string;
    organizationId: string;
    reservedBytes: bigint;
  },
): Promise<void> {
  await releaseAssetStorage(tx, {
    organizationId: input.organizationId,
    reservedBytes: input.reservedBytes,
  });
  await tx.asset.updateMany({
    where: {
      id: input.assetId,
      organizationId: input.organizationId,
      status: "PENDING",
    },
    data: {
      status: "DELETED",
      byteSize: 0n,
      deletedAt: new Date(),
      purgeAfter: new Date(),
    },
  });
}

function purgeDate(now = new Date()): Date {
  return new Date(
    now.getTime() + ASSET_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
}

export async function trashAssets(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; assetIds: string[] },
): Promise<number> {
  if (input.assetIds.length > MAX_ASSET_BULK_SELECTION)
    throw new Error("Too many assets selected.");
  const now = new Date();
  const result = await tx.asset.updateMany({
    where: {
      id: { in: input.assetIds },
      organizationId: input.organizationId,
      status: "READY",
    },
    data: {
      status: "DELETED",
      deletedAt: now,
      purgeAfter: purgeDate(now),
    },
  });
  if (result.count > 0) {
    await tx.assetStorageUsage.updateMany({
      where: { organizationId: input.organizationId },
      data: {
        readyAssetCount: { decrement: result.count },
        version: { increment: 1 },
      },
    });
  }
  return result.count;
}

export async function restoreAssets(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; assetIds: string[] },
): Promise<number> {
  if (input.assetIds.length > MAX_ASSET_BULK_SELECTION)
    throw new Error("Too many assets selected.");
  const result = await tx.asset.updateMany({
    where: {
      id: { in: input.assetIds },
      organizationId: input.organizationId,
      status: "DELETED",
    },
    data: { status: "READY", deletedAt: null, purgeAfter: null },
  });
  if (result.count > 0) {
    await tx.assetStorageUsage.updateMany({
      where: { organizationId: input.organizationId },
      data: {
        readyAssetCount: { increment: result.count },
        version: { increment: 1 },
      },
    });
  }
  return result.count;
}

export async function assignAssets(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    assetIds: string[];
    projectId?: string | null;
    folderId?: string | null;
  },
): Promise<number> {
  if (input.assetIds.length > MAX_ASSET_BULK_SELECTION)
    throw new Error("Too many assets selected.");
  if (input.projectId) {
    const project = await tx.project.findFirst({
      where: {
        id: input.projectId,
        organizationId: input.organizationId,
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!project) throw new Error("Project is unavailable.");
  }
  if (input.folderId) {
    const folder = await tx.assetFolder.findFirst({
      where: { id: input.folderId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!folder) throw new Error("Folder is unavailable.");
  }
  const data = {
    ...("projectId" in input ? { projectId: input.projectId ?? null } : {}),
    ...("folderId" in input ? { folderId: input.folderId ?? null } : {}),
  };
  const result = await tx.asset.updateMany({
    where: {
      id: { in: input.assetIds },
      organizationId: input.organizationId,
      status: { in: ["READY", "DELETED"] },
    },
    data,
  });
  return result.count;
}

export function normalizeTagName(value: string): {
  name: string;
  normalizedName: string;
} {
  const name = normalizeAssetName(value, "").slice(0, 48);
  if (!name) throw new Error("Tag name is required.");
  return {
    name,
    normalizedName: name.normalize("NFKC").toLocaleLowerCase("en-US"),
  };
}
