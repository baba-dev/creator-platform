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

async function lockAssetRow(
  tx: Prisma.TransactionClient,
  input: { assetId: string; organizationId: string },
) {
  await tx.$queryRaw`
    SELECT id
    FROM Asset
    WHERE id = ${input.assetId}
      AND organizationId = ${input.organizationId}
    FOR UPDATE
  `;

  return tx.asset.findFirst({
    where: {
      id: input.assetId,
      organizationId: input.organizationId,
    },
  });
}

/**
 * Publish an uploaded asset and write its audit event in the caller's database
 * transaction. The asset row is locked before storage accounting so publish and
 * cleanup always acquire locks in the same order.
 */
export async function finalizeUploadedAsset(
  tx: Prisma.TransactionClient,
  input: {
    assetId: string;
    organizationId: string;
    actorUserId: string;
    actualBytes: bigint;
    sha256: string;
    width?: number | null;
    height?: number | null;
    durationMs?: number | null;
  },
) {
  const asset = await lockAssetRow(tx, input);
  if (!asset || asset.status !== "PENDING")
    throw new Error("Pending asset no longer exists.");

  const reservedBytes = asset.byteSize;
  await finalizeAssetStorage(tx, {
    organizationId: input.organizationId,
    reservedBytes,
    actualBytes: input.actualBytes,
  });

  const readyAsset = await tx.asset.update({
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

  await tx.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      organizationId: input.organizationId,
      action: "asset.uploaded",
      targetType: "Asset",
      targetId: readyAsset.id,
      metadata: {
        mediaKind: readyAsset.mediaKind,
        byteSize: readyAsset.byteSize.toString(),
      },
    },
  });

  return readyAsset;
}

/**
 * Cancel an upload only while its authoritative Asset row is still PENDING.
 *
 * Returns true only when this transaction owns and releases that asset's exact
 * reservation. Callers may delete the object only after a true result commits.
 */
export async function failPendingUpload(
  tx: Prisma.TransactionClient,
  input: {
    assetId: string;
    organizationId: string;
  },
): Promise<boolean> {
  const asset = await lockAssetRow(tx, input);
  if (!asset || asset.status !== "PENDING") return false;

  await releaseAssetStorage(tx, {
    organizationId: input.organizationId,
    reservedBytes: asset.byteSize,
  });
  await tx.asset.update({
    where: { id: input.assetId },
    data: {
      status: "DELETED",
      byteSize: 0n,
      deletedAt: new Date(),
      purgeAfter: new Date(),
    },
  });

  return true;
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

  let restored = 0;
  const assetIds = [...new Set(input.assetIds)].sort();
  for (const assetId of assetIds) {
    const asset = await lockAssetRow(tx, {
      assetId,
      organizationId: input.organizationId,
    });
    if (!asset || asset.status !== "DELETED") continue;

    await tx.asset.update({
      where: { id: asset.id },
      data: { status: "READY", deletedAt: null, purgeAfter: null },
    });
    restored += 1;
  }

  if (restored > 0) {
    await tx.assetStorageUsage.updateMany({
      where: { organizationId: input.organizationId },
      data: {
        readyAssetCount: { increment: restored },
        version: { increment: 1 },
      },
    });
  }
  return restored;
};

/**
 * Atomically claim expired trash before any bytes are deleted.
 *
 * PURGING is intentionally not restorable. A failed object deletion leaves the
 * row in PURGING so a later maintenance pass can safely retry idempotent
 * deletes without exposing a partially-deleted asset as READY.
 */
export async function claimExpiredAssetForPurge(
  tx: Prisma.TransactionClient,
  input: {
    assetId: string;
    organizationId: string;
    now?: Date;
  },
) {
  const asset = await lockAssetRow(tx, input);
  const now = input.now ?? new Date();
  if (
    !asset ||
    !asset.purgeAfter ||
    asset.purgeAfter.getTime() > now.getTime() ||
    (asset.status !== "DELETED" && asset.status !== "PURGING")
  ) {
    return null;
  }

  if (asset.status === "DELETED") {
    await tx.asset.update({
      where: { id: asset.id },
      data: { status: "PURGING" },
    });
  }

  const variants = await tx.assetVariant.findMany({
    where: { assetId: asset.id },
    select: { objectKey: true },
  });

  return {
    id: asset.id,
    organizationId: asset.organizationId,
    objectKey: asset.objectKey,
    byteSize: asset.byteSize,
    variants,
  };
}

/**
 * Finalize a purge only after every stored object has been deleted.
 */
export async function completeAssetPurge(
  tx: Prisma.TransactionClient,
  input: { assetId: string; organizationId: string },
): Promise<boolean> {
  const asset = await lockAssetRow(tx, input);
  if (!asset || asset.status !== "PURGING") return false;

  await tx.assetVariant.deleteMany({ where: { assetId: asset.id } });
  await tx.asset.update({
    where: { id: asset.id },
    data: {
      status: "PURGED",
      byteSize: 0n,
      sha256: null,
      purgeAfter: null,
    },
  });
  await tx.assetStorageUsage.updateMany({
    where: { organizationId: asset.organizationId },
    data: {
      usedBytes: { decrement: asset.byteSize },
      version: { increment: 1 },
    },
  });

  return true;
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
