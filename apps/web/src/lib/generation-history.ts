import { hasOrganizationPermission } from "@aiwa/authz";
import { db, type Prisma } from "@aiwa/db";
import { z } from "zod";


type SeedAudioTimedItem = {
  startMs: number;
  endMs: number;
  text: string;
};

function seedAudioTimedItems(value: unknown): SeedAudioTimedItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const startMs = Number(row.startMs);
    const endMs = Number(row.endMs);
    const text = typeof row.text === "string" ? row.text : "";
    return Number.isSafeInteger(startMs) &&
      Number.isSafeInteger(endMs) &&
      startMs >= 0 &&
      endMs >= startMs &&
      text
      ? [{ startMs, endMs, text }]
      : [];
  });
}

function seedAudioResult(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const output = value as Record<string, unknown>;
  const subtitle =
    output.subtitle &&
    typeof output.subtitle === "object" &&
    !Array.isArray(output.subtitle)
      ? (output.subtitle as Record<string, unknown>)
      : null;
  const longForm =
    output.longForm &&
    typeof output.longForm === "object" &&
    !Array.isArray(output.longForm)
      ? (output.longForm as Record<string, unknown>)
      : null;
  const originalDurationSeconds =
    typeof output.originalDurationSeconds === "number" &&
    Number.isFinite(output.originalDurationSeconds) &&
    output.originalDurationSeconds > 0
      ? output.originalDurationSeconds
      : null;
  const playbackDurationSeconds =
    typeof output.playbackDurationSeconds === "number" &&
    Number.isFinite(output.playbackDurationSeconds) &&
    output.playbackDurationSeconds > 0
      ? output.playbackDurationSeconds
      : originalDurationSeconds;
  const segmentDurationsSeconds = Array.isArray(
    longForm?.segmentDurationsSeconds,
  )
    ? longForm.segmentDurationsSeconds.filter(
        (duration): duration is number =>
          typeof duration === "number" &&
          Number.isFinite(duration) &&
          duration > 0 &&
          duration <= 120,
      )
    : [];
  const segmentCount =
    typeof longForm?.segmentCount === "number" &&
    Number.isSafeInteger(longForm.segmentCount) &&
    longForm.segmentCount >= 1 &&
    longForm.segmentCount <= 3
      ? longForm.segmentCount
      : segmentDurationsSeconds.length || 1;
  const crossfadeMs =
    typeof longForm?.crossfadeMs === "number" &&
    Number.isSafeInteger(longForm.crossfadeMs) &&
    longForm.crossfadeMs >= 0 &&
    longForm.crossfadeMs <= 1_000
      ? longForm.crossfadeMs
      : 0;
  return {
    originalDurationSeconds,
    playbackDurationSeconds,
    subtitle: subtitle
      ? {
          text: typeof subtitle.text === "string" ? subtitle.text : "",
          sentences: seedAudioTimedItems(subtitle.sentences),
          words: seedAudioTimedItems(subtitle.words),
        }
      : null,
    longForm: longForm
      ? { segmentCount, segmentDurationsSeconds, crossfadeMs }
      : null,
  };
}

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
            {
              requestPayload: {
                path: "$.sourceText",
                string_contains: input.search,
              },
            },
            {
              requestPayload: {
                path: "$.textPrompt",
                string_contains: input.search,
              },
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
      requestPayload: true,
      completedAt: true,
      createdBy: { select: { id: true, name: true } },
      providerModel: {
        select: { displayName: true, mediaKind: true, provider: true },
      },
      project: { select: { id: true, name: true } },
      reservedCredits: true,
      chargedCredits: true,
      errorCode: true,
      errorMessage: true,
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
    jobs: page.map((job) => {
      const payload =
        job.requestPayload &&
        typeof job.requestPayload === "object" &&
        !Array.isArray(job.requestPayload)
          ? (job.requestPayload as Record<string, unknown>)
          : {};
      return {
        ...job,
        task: payload.task === "transcription" ? "transcription" : null,
        requestPayload: undefined,
        reservedCredits: job.reservedCredits.toString(),
        chargedCredits: job.chargedCredits.toString(),
      };
    }),
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
      priceVersion: {
        select: { pricingDimension: true, creditsPerBaisa: true },
      },
      providerModel: {
        select: {
          id: true,
          displayName: true,
          mediaKind: true,
          provider: true,
          providerModelId: true,
        },
      },
      project: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      assets: {
        select: {
          id: true,
          name: true,
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
  const request =
    job.requestPayload &&
    typeof job.requestPayload === "object" &&
    !Array.isArray(job.requestPayload)
      ? (job.requestPayload as Record<string, unknown>)
      : {};
  const isSeedAudio =
    job.providerModel.providerModelId === "seed-audio-1.0" &&
    request.task === "seed-audio";
  const takeRootId = job.parentGenerationId ?? job.id;
  const [entries, events, takes] = await Promise.all([
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
    isSeedAudio
      ? db.generationJob.findMany({
          where: {
            organizationId,
            createdById: job.createdById,
            providerModel: { providerModelId: "seed-audio-1.0" },
            OR: [{ id: takeRootId }, { parentGenerationId: takeRootId }],
          },
          orderBy: { createdAt: "asc" },
          take: 8,
          select: {
            id: true,
            status: true,
            createdAt: true,
            completedAt: true,
            parentGenerationId: true,
            requestPayload: true,
            assets: {
              where: { status: "READY", mediaKind: "AUDIO" },
              orderBy: { createdAt: "asc" },
              take: 1,
              select: {
                id: true,
                name: true,
                mimeType: true,
                durationMs: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);
  return {
    id: job.id,
    status: job.status,
    model: job.providerModel.displayName,
    providerModelId: job.providerModel.id,
    providerModelKey: job.providerModel.providerModelId,
    kind: job.providerModel.mediaKind,
    project: job.project,
    creator: job.createdBy,
    chatThreadId: job.chatThreadId,
    parentGenerationId: job.parentGenerationId,
    request: job.requestPayload,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    quotedAt: job.quotedAt,
    queuedAt: job.queuedAt,
    submittedAt: job.submittedAt,
    completedAt: job.completedAt,
    reservedCredits: job.reservedCredits.toString(),
    chargedCredits: job.chargedCredits.toString(),
    pricingDimension: job.priceVersion.pricingDimension,
    chargedPriceBaisa: (
      (job.chargedCredits + job.priceVersion.creditsPerBaisa - 1n) /
      job.priceVersion.creditsPerBaisa
    ).toString(),
    actualCompletionTokens:
      job.outputPayload &&
      typeof job.outputPayload === "object" &&
      !Array.isArray(job.outputPayload) &&
      job.outputPayload.providerUsage &&
      typeof job.outputPayload.providerUsage === "object" &&
      !Array.isArray(job.outputPayload.providerUsage) &&
      typeof job.outputPayload.providerUsage.completionTokens === "number"
        ? job.outputPayload.providerUsage.completionTokens
        : null,
    quotedUnits: job.quotedUnits,
    actualUnits: job.actualUnits,
    billableQuantity: job.billableQuantity,
    audioResult: isSeedAudio ? seedAudioResult(job.outputPayload) : null,
    takes: takes.map((take) => {
      const payload =
        take.requestPayload &&
        typeof take.requestPayload === "object" &&
        !Array.isArray(take.requestPayload)
          ? (take.requestPayload as Record<string, unknown>)
          : {};
      return {
        id: take.id,
        status: take.status,
        createdAt: take.createdAt,
        completedAt: take.completedAt,
        parentGenerationId: take.parentGenerationId,
        workflow:
          typeof payload.workflow === "string" ? payload.workflow : "CREATE",
        asset: take.assets[0] ?? null,
      };
    }),
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
