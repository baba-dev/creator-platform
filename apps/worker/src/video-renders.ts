import { finalizeAssetStorage, releaseAssetStorage } from "@aiwa/assets";
import {
  videoEditDocumentSchema,
  videoEditAssetIds,
} from "@aiwa/assets/video-edit";
import { LocalAssetStorage, resolveLocalAssetPath } from "@aiwa/assets/storage";
import { parseServerEnv } from "@aiwa/config";
import { db } from "@aiwa/db";
import { renderVideo } from "./video-media";

const root = parseServerEnv().ASSET_STORAGE_ROOT;
const storage = new LocalAssetStorage(root);

export async function processVideoRender(id: string): Promise<void> {
  const job = await db.videoRender.findUnique({
    where: { id },
    include: { outputAsset: true, inputs: { include: { asset: true } } },
  });
  if (!job || ["SUCCEEDED", "FAILED"].includes(job.status)) return;
  if (job.outputAsset.status !== "PENDING")
    throw new Error("Render output state changed.");
  const document = videoEditDocumentSchema.parse(job.document);
  const ids = videoEditAssetIds(document);
  if (
    ids.length !== job.inputs.length ||
    ids.some((assetId) => !job.inputs.some((item) => item.assetId === assetId))
  )
    throw new Error("Render inputs changed.");
  const paths = new Map<string, string>();
  for (const input of job.inputs) {
    const asset = input.asset;
    if (
      asset.organizationId !== job.organizationId ||
      asset.status !== "READY" ||
      asset.storageProvider !== "LOCAL"
    )
      throw new Error("Render source unavailable.");
    paths.set(asset.id, resolveLocalAssetPath(root, asset.objectKey));
  }
  await db.videoRender.update({
    where: { id },
    data: { status: "PROCESSING", processingAt: new Date() },
  });
  const output = await renderVideo(document, paths);
  const stored = await storage.put(job.outputAsset.objectKey, output.bytes);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM VideoRender WHERE id = ${id} FOR UPDATE`;
    const current = await tx.videoRender.findUniqueOrThrow({
      where: { id },
      include: { outputAsset: true },
    });
    if (current.status === "SUCCEEDED") return;
    if (current.status === "FAILED" || current.outputAsset.status !== "PENDING")
      throw new Error("Render output state changed.");
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
        width: output.width,
        height: output.height,
        durationMs: output.durationMs,
      },
    });
    await tx.videoRender.update({
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
        action: "asset.video_rendered",
        targetType: "Asset",
        targetId: current.outputAssetId,
        metadata: { editId: current.editId, revision: current.revision },
      },
    });
  });
}

export async function failVideoRender(id: string): Promise<void> {
  const render = await db.videoRender.findUnique({
    where: { id },
    include: { outputAsset: true },
  });
  if (!render || ["SUCCEEDED", "FAILED"].includes(render.status)) return;
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM VideoRender WHERE id = ${id} FOR UPDATE`;
    const current = await tx.videoRender.findUniqueOrThrow({
      where: { id },
      include: { outputAsset: true },
    });
    if (["SUCCEEDED", "FAILED"].includes(current.status)) return;
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
    await tx.videoRender.update({
      where: { id },
      data: {
        status: "FAILED",
        errorMessage: "Video render failed. Save the edit and try again.",
        completedAt: new Date(),
      },
    });
  });
  await storage.delete(render.outputAsset.objectKey).catch(() => undefined);
}
