import { db } from "@aiwa/db";
import { z } from "zod";
import type { AssistantTool } from "./types";
import { getPixelModelCatalog, type PixelModelQuery } from "../model-knowledge";

export const getStorageTool: AssistantTool = {
  description: "Read workspace storage usage and safe connection status",
  inputSchema: z.object({}).strict(),
  async execute(_input, ctx) {
    const [usage, connections] = await Promise.all([
      db.assetStorageUsage.findUnique({
        where: { organizationId: ctx.organizationId },
        select: {
          usedBytes: true,
          reservedBytes: true,
          readyAssetCount: true,
          reconciledAt: true,
        },
      }),
      db.externalStorageConfig.findMany({
        where: { organizationId: ctx.organizationId },
        select: { provider: true, status: true },
      }),
    ]);
    return {
      usedBytes: (usage?.usedBytes ?? 0n).toString(),
      reservedBytes: (usage?.reservedBytes ?? 0n).toString(),
      assetCount: usage?.readyAssetCount ?? 0,
      reconciledAt: usage?.reconciledAt?.toISOString() ?? null,
      connections,
    };
  },
};

export const getMembersTool: AssistantTool = {
  description:
    "Read up to 10 workspace members; use the Members page for management",
  inputSchema: z.object({}).strict(),
  async execute(_input, ctx) {
    const members = await db.membership.findMany({
      where: { organizationId: ctx.organizationId },
      take: 10,
      select: { role: true, user: { select: { name: true } } },
    });
    return {
      members: members.map((m) => ({
        name: m.user.name ?? "Member",
        role: m.role,
      })),
    };
  },
};

export const getModelsTool: AssistantTool = {
  description:
    "Read live available models with detailed capabilities, tasks, provider and published customer pricing; filter/search/paginate or look up a canonical model ID",
  inputSchema: z
    .object({
      kind: z.enum(["IMAGE", "VIDEO", "VOICE", "TEXT"]).optional(),
      query: z.string().trim().max(100).optional(),
      modelId: z.string().min(1).max(191).optional(),
      page: z.number().int().min(1).max(1000).optional(),
      pageSize: z.number().int().min(1).max(20).optional(),
    })
    .strict(),
  async execute(input) {
    return getPixelModelCatalog(input as PixelModelQuery);
  },
};
