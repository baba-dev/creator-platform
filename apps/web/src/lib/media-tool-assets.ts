import type { Prisma } from "@aiwa/db";

// Project only display metadata and bounded derivative identities. Never expose storage keys.
export const mediaToolAssetSelect = {
  id: true,
  name: true,
  originalFilename: true,
  mediaKind: true,
  mimeType: true,
  width: true,
  height: true,
  durationMs: true,
  byteSize: true,
  variants: {
    where: { kind: { in: ["THUMBNAIL", "PREVIEW", "POSTER", "WAVEFORM"] } },
    select: { kind: true },
  },
} satisfies Prisma.AssetSelect;

export function serializeMediaToolAsset(asset: {
  id: string;
  name: string | null;
  originalFilename: string | null;
  mediaKind: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  byteSize: bigint;
  variants: { kind: string }[];
}) {
  return {
    ...asset,
    name: asset.name ?? asset.originalFilename ?? "Untitled asset",
    byteSize: asset.byteSize.toString(),
  };
}
