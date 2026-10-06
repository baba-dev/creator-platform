import { db } from "@aiwa/db";
import { z } from "zod";
import type { AssistantTool, AssistantToolContext } from "./types";

const inputSchema = z.object({
  limit: z.number().int().min(1).max(10).default(5),
  jobId: z.string().min(1).max(100).optional(),
});

export const getJobStatusTool: AssistantTool<z.infer<typeof inputSchema>> = {
  description: "Get recent generation jobs and their status",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>, ctx: AssistantToolContext) {
    const jobs = await db.generationJob.findMany({
      where: {
        organizationId: ctx.organizationId,
        createdById: ctx.userId,
        ...(input.jobId ? { id: input.jobId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: input.limit,
      select: {
        id: true,
        status: true,
        errorCode: true,
        reservedCredits: true,
        chargedCredits: true,
        createdAt: true,
        providerModel: { select: { displayName: true, mediaKind: true } },
      },
    });
    const entries = jobs.length
      ? await db.ledgerEntry.findMany({
          where: {
            wallet: { organizationId: ctx.organizationId },
            referenceType: "GENERATION_JOB",
            referenceId: { in: jobs.map((job) => job.id) },
          },
          orderBy: { createdAt: "desc" },
          take: 40,
          select: {
            referenceId: true,
            type: true,
            amountCredits: true,
            createdAt: true,
          },
        })
      : [];
    return {
      jobs: jobs.map((j) => ({
        id: j.id,
        status: j.status,
        mediaKind: j.providerModel.mediaKind,
        model: j.providerModel.displayName,
        createdAt: j.createdAt.toISOString(),
        errorCode: j.errorCode,
        reservedCredits: j.reservedCredits.toString(),
        chargedCredits: j.chargedCredits.toString(),
        walletEntries: entries
          .filter((entry) => entry.referenceId === j.id)
          .map((entry) => ({
            type: entry.type,
            amount: entry.amountCredits.toString(),
            createdAt: entry.createdAt.toISOString(),
          })),
      })),
      total: jobs.length,
    };
  },
};
