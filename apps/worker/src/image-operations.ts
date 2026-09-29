import { finalizeAssetStorage, releaseAssetStorage } from "@aiwa/assets";
import { LocalAssetStorage } from "@aiwa/assets/storage";
import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import { renderEditedImage } from "./image-render";

const storage = new LocalAssetStorage(parseServerEnv().ASSET_STORAGE_ROOT);

export async function processImageOperation(id: string): Promise<void> {
  const operation = await db.imageOperation.findUnique({
    where: { id },
    include: { sourceAsset: true, outputAsset: true },
  });
  if (
    !operation ||
    operation.status === "SUCCEEDED" ||
    operation.status === "FAILED"
  )
    return;
  if (operation.outputAsset.status !== "PENDING")
    throw new Error("Edited asset state is inconsistent.");
  await db.imageOperation.update({
    where: { id },
    data: { status: "PROCESSING", processingAt: new Date() },
  });
  const source = operation.sourceAsset;
  if (
    source.status !== "READY" ||
    source.mediaKind !== "IMAGE" ||
    source.storageProvider !== "LOCAL"
  )
    throw new Error("Source image is no longer available.");
  const payload = operation.requestPayload as {
    transform: { kind: string };
    format: string;
  };
  const bytes = await storage.read(source.objectKey);
  const result = await renderEditedImage(bytes, payload);
  const stored = await storage.put(
    operation.outputAsset.objectKey,
    result.data,
  );
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM ImageOperation WHERE id = ${id} FOR UPDATE`;
    const current = await tx.imageOperation.findUniqueOrThrow({
      where: { id },
      include: { outputAsset: true },
    });
    if (current.status === "SUCCEEDED") return;
    if (current.status === "FAILED" || current.outputAsset.status !== "PENDING")
      throw new Error("Edited asset state changed.");
    await finalizeAssetStorage(tx, {
      organizationId: current.organizationId,
      reservedBytes: current.outputAsset.byteSize,
      actualBytes: stored.byteSize,
    });
    await tx.asset.update({
      where: { id: current.outputAssetId },
      data: {
        status: "READY",
        byteSize: stored.byteSize,
        sha256: stored.sha256,
        width: result.info.width,
        height: result.info.height,
      },
    });
    await tx.imageOperation.update({
      where: { id },
      data: {
        status: "SUCCEEDED",
        completedAt: new Date(),
        errorMessage: null,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: current.createdById,
        organizationId: current.organizationId,
        action: "asset.image_edited",
        targetType: "Asset",
        targetId: current.outputAssetId,
        metadata: {
          sourceAssetId: current.sourceAssetId,
          operationId: id,
          transformKind: payload.transform.kind,
        },
      },
    });
  });
}

export async function failImageOperation(id: string): Promise<void> {
  const operation = await db.imageOperation.findUnique({
    where: { id },
    include: { outputAsset: true },
  });
  if (
    !operation ||
    operation.status === "SUCCEEDED" ||
    operation.status === "FAILED"
  )
    return;
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM ImageOperation WHERE id = ${id} FOR UPDATE`;
    const current = await tx.imageOperation.findUniqueOrThrow({
      where: { id },
      include: { outputAsset: true },
    });
    if (current.status === "SUCCEEDED" || current.status === "FAILED") return;
    if (current.outputAsset.status === "PENDING") {
      await releaseAssetStorage(tx, {
        organizationId: current.organizationId,
        reservedBytes: current.outputAsset.byteSize,
      });
      await tx.asset.update({
        where: { id: current.outputAssetId },
        data: {
          status: "DELETED",
          byteSize: 0n,
          deletedAt: new Date(),
          purgeAfter: new Date(),
        },
      });
    }
    await tx.imageOperation.update({
      where: { id },
      data: {
        status: "FAILED",
        errorMessage: "Image edit failed. Please retry with a new request.",
        completedAt: new Date(),
      },
    });
  });
  await storage.delete(operation.outputAsset.objectKey).catch(() => undefined);
}
