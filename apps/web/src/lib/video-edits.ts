import {
  videoEditAssetIds,
  type VideoEditDocument,
} from "@aiwa/assets/video-edit";
import { db, type Prisma } from "@aiwa/db";

export async function validateVideoSources(
  organizationId: string,
  userId: string,
  document: VideoEditDocument,
  client: Prisma.TransactionClient = db,
) {
  const ids = videoEditAssetIds(document);
  const rows = await client.asset.findMany({
    where: {
      id: { in: ids },
      organizationId,
      status: "READY",
      storageProvider: "LOCAL",
    },
    select: {
      id: true,
      mediaKind: true,
      purpose: true,
      storageOwnerUserId: true,
    },
  });
  if (rows.length !== ids.length)
    throw new Error("Source media is unavailable.");
  for (const clip of document.clips) {
    if (rows.find((row) => row.id === clip.assetId)?.mediaKind !== "VIDEO")
      throw new Error("Choose a video asset for each clip.");
  }
  for (const audio of [document.voiceover, document.soundtrack]) {
    if (
      audio &&
      rows.find((row) => row.id === audio.assetId)?.mediaKind !== "AUDIO"
    )
      throw new Error("Choose an audio asset for each audio track.");
  }
  if (
    rows.some(
      (row) =>
        row.purpose === "REFERENCE_INPUT" && row.storageOwnerUserId !== userId,
    )
  )
    throw new Error("Source media is unavailable.");
  return rows;
}
