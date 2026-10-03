import { db } from "@aiwa/db";
import { z } from "zod";
import type { AssistantTool, AssistantToolContext } from "./types";

const inputSchema = z.object({
  limit: z.number().int().min(1).max(10).default(5),
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
        organizationId: ctx.organizationId,
        ...(input.kind ? { mediaKind: input.kind } : {}),
        deletedAt: null,
        status: "READY",
      },
      orderBy: { createdAt: "desc" },
      take: input.limit,
      select: {
        id: true,
        name: true,
        mediaKind: true,
        mimeType: true,
        createdAt: true,
      },
    });
    return {
      assets: assets.map((a) => ({
        id: a.id,
        name: a.name ?? "Untitled",
        kind: a.mediaKind,
        mimeType: a.mimeType,
        createdAt: a.createdAt.toISOString(),
      })),
      total: assets.length,
    };
  },
};
