import { db, type Prisma } from "@aiwa/db";

export const MAX_ACTIVE_REASONING_JOBS_PER_USER = 3;
export const MAX_REASONING_JOBS_PER_HOUR = 60;

export class ReasoningAdmissionLimitError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
    this.name = "ReasoningAdmissionLimitError";
  }
}

export interface AdmitReasoningJobInput {
  organizationId: string;
  userId: string;
  providerModelId: string;
  idempotencyKey: string;
  userPrompt: string;
  targetMedia: "IMAGE" | "VIDEO";
  systemPrompt: string;
}

export async function admitReasoningJob(
  input: AdmitReasoningJobInput,
  txClient?: Prisma.TransactionClient,
) {
  const execute = async (tx: Prisma.TransactionClient) => {
    // 1. Serialize admission per user and organization
    await tx.$queryRaw`SELECT id FROM Membership WHERE organizationId = ${input.organizationId} AND userId = ${input.userId} FOR UPDATE`;

    // 2. Check idempotency within the locked transaction
    const existing = await tx.reasoningJob.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      const payload = existing.requestPayload as {
        task?: unknown;
        userPrompt?: unknown;
        targetMedia?: unknown;
      };
      if (
        existing.organizationId !== input.organizationId ||
        payload.task !== "prompt-enhancement" ||
        payload.userPrompt !== input.userPrompt ||
        payload.targetMedia !== input.targetMedia
      ) {
        throw new ReasoningAdmissionLimitError(
          "Idempotency key was already used for different inputs.",
          409,
          0,
        );
      }
      return { job: existing, isExisting: true };
    }

    // 3. Count active and recent jobs atomically
    const [activeJobs, recentJobs] = await Promise.all([
      tx.reasoningJob.count({
        where: {
          createdById: input.userId,
          organizationId: input.organizationId,
          status: { in: ["QUEUED", "PROCESSING"] },
        },
      }),
      tx.reasoningJob.count({
        where: {
          createdById: input.userId,
          organizationId: input.organizationId,
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
      }),
    ]);

    if (recentJobs >= MAX_REASONING_JOBS_PER_HOUR) {
      throw new ReasoningAdmissionLimitError(
        "Prompt enhancement hourly limit reached. Try again later.",
        429,
        60,
      );
    }

    if (activeJobs >= MAX_ACTIVE_REASONING_JOBS_PER_USER) {
      throw new ReasoningAdmissionLimitError(
        "Too many prompt enhancements are already running. Wait for one to finish.",
        429,
        5,
      );
    }

    // 4. Create ReasoningJob and AuditEvent
    const created = await tx.reasoningJob.create({
      data: {
        organizationId: input.organizationId,
        createdById: input.userId,
        providerModelId: input.providerModelId,
        status: "QUEUED",
        queuedAt: new Date(),
        idempotencyKey: input.idempotencyKey,
        requestPayload: {
          task: "prompt-enhancement",
          systemPrompt: input.systemPrompt,
          userPrompt: input.userPrompt,
          targetMedia: input.targetMedia,
          responseSchemaName: "prompt-enhancement-v1",
        },
      },
    });

    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.userId,
        action: "reasoning.queued",
        targetType: "ReasoningJob",
        targetId: created.id,
        metadata: { task: "prompt-enhancement" },
      },
    });

    return { job: created, isExisting: false };
  };

  if (txClient) {
    return execute(txClient);
  }
  return db.$transaction(execute);
}
