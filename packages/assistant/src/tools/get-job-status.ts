import { db } from "@aiwa/db";
import { z } from "zod";
import type { AssistantTool, AssistantToolContext } from "./types";

const inputSchema = z.object({
  limit: z.number().int().min(1).max(10).default(5),
});

export const getJobStatusTool: AssistantTool<z.infer<typeof inputSchema>> = {
  description: "Get recent generation jobs and their status",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>, ctx: AssistantToolContext) {
    const jobs = await db.generationJob.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      take: input.limit,
      select: {
        id: true,
        status: true,
        errorMessage: true,
        createdAt: true,
        providerModel: { select: { displayName: true, mediaKind: true } },
      },
    });
    return {
      jobs: jobs.map((j) => ({
        id: j.id,
        status: j.status,
        mediaKind: j.providerModel.mediaKind,
        model: j.providerModel.displayName,
        createdAt: j.createdAt.toISOString(),
        errorMessage: j.errorMessage,
      })),
      total: jobs.length,
    };
  },
};
