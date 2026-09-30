import { db } from "@aiwa/db";
import {
  assetPreviewStatuses,
  expectedDerivatives,
} from "@aiwa/assets/media-status";
export async function loadAssetPreviewStatuses(
  organizationId: string,
  assets: {
    id: string;
    mediaKind: string;
    status: string;
    storageProvider: string;
    variants: { kind: string }[];
  }[],
) {
  const keys = assets.flatMap((asset) =>
    expectedDerivatives(asset.mediaKind).map(
      (kind) => `${asset.id}:${kind}:v1`,
    ),
  );
  const tasks = keys.length
    ? await db.mediaTask.findMany({
        where: { organizationId, taskKey: { in: keys } },
        select: {
          id: true,
          targetId: true,
          kind: true,
          status: true,
          cycle: true,
          attemptCount: true,
          maxAttempts: true,
          nextAttemptAt: true,
        },
      })
    : [];
  return new Map(
    assets.map((asset) => [
      asset.id,
      assetPreviewStatuses(
        asset,
        tasks.filter((task) => task.targetId === asset.id),
      ),
    ]),
  );
}
