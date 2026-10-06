import { db } from "@aiwa/db";
import { z } from "zod";
import type { AssistantTool, AssistantToolContext } from "./types";
import { accessibleAssets } from "../access";

const inputSchema = z.object({
  limit: z.number().int().min(1).max(10).default(5),
  query: z.string().trim().max(120).optional(),
  assetId: z.string().min(1).max(100).optional(),
  kind: z
    .enum(["IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "OTHER"])
    .nullable()
    .default(null),
});

export const getAssetsTool: AssistantTool<z.infer<typeof inputSchema>> = {
  description: "Get recent assets from the library",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>, ctx: AssistantToolContext) {
    const assets = await db.asset.findMany({
      where: {
        ...accessibleAssets(ctx),
        ...(input.query
          ? {
              AND: [
                {
                  OR: [
                    { name: { contains: input.query } },
                    { originalFilename: { contains: input.query } },
                  ],
                },
              ],
            }
          : {}),
        ...(input.assetId ? { id: input.assetId } : {}),
        ...(input.kind ? { mediaKind: input.kind } : {}),
        deletedAt: null,
        status: "READY",
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit,
      select: {
        id: true,
        name: true,
        mediaKind: true,
        mimeType: true,
        createdAt: true,
        variants: {
          where: { kind: { in: ["THUMBNAIL", "POSTER"] } },
          take: 1,
          select: { kind: true },
        },
      },
    });
    return {
      assets: assets.map((a) => ({
        id: a.id,
        name: a.name ?? "Untitled",
        kind: a.mediaKind,
        mimeType: a.mimeType,
        createdAt: a.createdAt.toISOString(),
        previewKind: a.variants[0]?.kind?.toLowerCase() ?? null,
      })),
      total: assets.length,
    };
  },
};
