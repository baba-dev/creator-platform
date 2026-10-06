import { db } from "@aiwa/db";
import { z } from "zod";
import type { AssistantTool } from "./types";

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
    "Read current enabled, priced models; model IDs are needed for workflow drafts",
  inputSchema: z
    .object({ kind: z.enum(["IMAGE", "VIDEO", "VOICE", "TEXT"]).optional() })
    .strict(),
  async execute(input) {
    const { kind } = input as { kind?: "IMAGE" | "VIDEO" | "VOICE" | "TEXT" };
    const now = new Date();
    const models = await db.providerModel.findMany({
      where: {
        enabled: true,
        ...(kind ? { mediaKind: kind } : {}),
        priceVersions: {
          some: {
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
        },
      },
      orderBy: [{ mediaKind: "asc" }, { displayName: "asc" }],
      take: 30,
      select: {
        id: true,
        displayName: true,
        mediaKind: true,
        provider: true,
        capabilities: true,
      },
    });
    return { models };
  },
};
