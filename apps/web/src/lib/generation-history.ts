import { hasOrganizationPermission } from "@aiwa/authz";
import { db, type Prisma } from "@aiwa/db";
import { z } from "zod";

const cursorSchema = z.object({
  at: z.iso.datetime(),
  id: z.string().min(1).max(100),
});

export const historyQuerySchema = z.object({
  organizationId: z.string().min(1).max(100),
  cursor: z.string().max(500).optional(),
  status: z
    .enum([
      "QUEUED",
      "SUBMITTED",
      "PROCESSING",
      "SUCCEEDED",
      "FAILED",
      "CANCELLED",
      "MANUAL_REVIEW",
    ])
    .optional(),
  kind: z.enum(["IMAGE", "VIDEO", "VOICE"]).optional(),
  projectId: z.string().max(100).optional(),
  creatorId: z.string().max(100).optional(),
  search: z.string().trim().max(100).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function historyScope(organizationId: string, userId: string) {
  const member = await db.membership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: true, user: true },
  });
  if (
    !member ||
    member.user.disabledAt ||
    !member.user.emailVerified ||
    member.organization.status !== "ACTIVE" ||
    !hasOrganizationPermission(member.role, "workspace:view")
  )
    return null;
  return {
    organizationId,
    ownOnly: member.role !== "ORGANIZATION_OWNER",
    canCancel: hasOrganizationPermission(member.role, "generation:cancel"),
  };
}

export async function listGenerationHistory(
  input: z.infer<typeof historyQuerySchema>,
  userId: string,
) {
  const scope = await historyScope(input.organizationId, userId);
  if (!scope) return null;
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (input.cursor) {
    try {
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")),
      );
    } catch {
      throw new Error("Invalid history cursor.");
    }
  }
  const where: Prisma.GenerationJobWhereInput = {
    organizationId: input.organizationId,
    ...(scope.ownOnly
      ? { createdById: userId }
      : input.creatorId
        ? { createdById: input.creatorId }
        : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.kind ? { providerModel: { mediaKind: input.kind } } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.from || input.to || cursor
      ? {
          AND: [
            ...(input.from || input.to
              ? [
                  {
                    createdAt: {
                      ...(input.from
                        ? { gte: new Date(`${input.from}T00:00:00+04:00`) }
                        : {}),
                      ...(input.to
                        ? {
                            lt: new Date(
                              Date.parse(`${input.to}T00:00:00+04:00`) +
                                86400000,
                            ),
                          }
                        : {}),
                    },
                  },
                ]
              : []),
            ...(cursor
              ? [
                  {
                    OR: [
                      { createdAt: { lt: new Date(cursor.at) } },
                      { createdAt: new Date(cursor.at), id: { lt: cursor.id } },
                    ],
                  },
                ]
              : []),
          ],
        }
      : {}),
    ...(input.search
      ? {
          OR: [
            { id: { startsWith: input.search } },
            {
              requestPayload: {
                path: "$.prompt",
                string_contains: input.search,
              },
            },
            {
              requestPayload: { path: "$.text", string_contains: input.search },
            },
          ],
        }
      : {}),
  };
  const jobs = await db.generationJob.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    select: {
      id: true,
      status: true,
      createdAt: true,
      completedAt: true,
      createdBy: { select: { id: true, name: true } },
      providerModel: {
        select: { displayName: true, mediaKind: true, provider: true },
      },
      project: { select: { id: true, name: true } },
      reservedCredits: true,
      chargedCredits: true,
      assets: {
        where: { status: "READY" },
        select: { id: true, mimeType: true },
        take: 1,
      },
    },
  });
  const page = jobs.slice(0, input.limit);
  const last = page.at(-1);
  return {
    jobs: page.map((job) => ({
      ...job,
      reservedCredits: job.reservedCredits.toString(),
      chargedCredits: job.chargedCredits.toString(),
    })),
    nextCursor:
      jobs.length > input.limit && last
        ? Buffer.from(
            JSON.stringify({ at: last.createdAt.toISOString(), id: last.id }),
          ).toString("base64url")
        : null,
  };
}

export async function getCustomerJob(
  jobId: string,
  organizationId: string,
  userId: string,
) {
  const scope = await historyScope(organizationId, userId);
  if (!scope) return null;
  const job = await db.generationJob.findFirst({
    where: {
      id: jobId,
      organizationId,
      ...(scope.ownOnly ? { createdById: userId } : {}),
    },
    include: {
      providerModel: {
        select: { displayName: true, mediaKind: true, provider: true },
      },
      project: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      assets: {
        select: {
          id: true,
          status: true,
          mimeType: true,
          byteSize: true,
          width: true,
          height: true,
          durationMs: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!job) return null;
  const [entries, events] = await Promise.all([
    db.ledgerEntry.findMany({
      where: {
        referenceType: "GENERATION_JOB",
        referenceId: job.id,
        wallet: { organizationId },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, type: true, amountCredits: true, createdAt: true },
    }),
    db.auditEvent.findMany({
      where: { targetType: "GenerationJob", targetId: job.id, organizationId },
      select: { action: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return {
    id: job.id,
    status: job.status,
    model: job.providerModel.displayName,
    kind: job.providerModel.mediaKind,
    project: job.project,
    creator: job.createdBy,
    request: job.requestPayload,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    quotedAt: job.quotedAt,
    queuedAt: job.queuedAt,
    submittedAt: job.submittedAt,
    completedAt: job.completedAt,
    reservedCredits: job.reservedCredits.toString(),
    chargedCredits: job.chargedCredits.toString(),
    quotedUnits: job.quotedUnits,
    actualUnits: job.actualUnits,
    billableQuantity: job.billableQuantity,
    entries: entries.map((entry) => ({
      ...entry,
      amountCredits: entry.amountCredits.toString(),
    })),
    events: events
      .filter((event) => event.action.startsWith("generation."))
      .map((event) => ({ action: event.action, at: event.createdAt })),
    assets: job.assets.map((asset) => ({
      ...asset,
      byteSize: asset.byteSize.toString(),
    })),
    canCancel:
      scope.canCancel &&
      job.status === "QUEUED" &&
      (job.createdById === userId || !scope.ownOnly),
  };
}
