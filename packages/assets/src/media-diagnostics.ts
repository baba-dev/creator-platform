import { db } from "@aiwa/db";
export async function mediaDiagnostics() {
  const time = await db.$queryRaw<
    { now: Date }[]
  >`SELECT UTC_TIMESTAMP(3) AS now`;
  const now = time[0]!.now;
  const since = new Date(now.getTime() - 15 * 60_000);
  const [counts, oldest, completed, failedAttempts, capacity, attention] =
    await Promise.all([
      db.mediaTask.groupBy({ by: ["status"], _count: true }),
      db.mediaTask.findFirst({
        where: { status: { in: ["PENDING", "RETRY_WAIT"] } },
        orderBy: { updatedAt: "asc" },
        select: { updatedAt: true },
      }),
      db.mediaTaskAttempt.count({
        where: { finishedAt: { gte: since }, outcome: "SUCCEEDED" },
      }),
      db.mediaTaskAttempt.count({
        where: {
          finishedAt: { gte: since },
          outcome: { in: ["FAILED", "RETRY_WAIT", "REVIEW"] },
        },
      }),
      db.mediaCapacity.findUnique({
        where: { id: "native-media-v1" },
        select: { owner: true, leaseUntil: true },
      }),
      db.mediaTask.findMany({
        where: { status: { in: ["REVIEW", "FAILED", "PROCESSING"] } },
        orderBy: { updatedAt: "desc" },
        take: 50,
        select: {
          id: true,
          organizationId: true,
          targetId: true,
          kind: true,
          status: true,
          cycle: true,
          attemptCount: true,
          maxAttempts: true,
          nextAttemptAt: true,
          leaseUntil: true,
          errorCode: true,
          updatedAt: true,
        },
      }),
    ]);
  return {
    sampledAt: now.toISOString(),
    counts: Object.fromEntries(counts.map((row) => [row.status, row._count])),
    oldestQueueAgeSeconds: oldest
      ? Math.max(
          0,
          Math.round((now.getTime() - oldest.updatedAt.getTime()) / 1000),
        )
      : 0,
    completedLast15Minutes: completed,
    failedAttemptsLast15Minutes: failedAttempts,
    capacity: {
      occupied: Boolean(capacity?.owner),
      expired: Boolean(
        capacity?.owner && (!capacity.leaseUntil || capacity.leaseUntil <= now),
      ),
      leaseUntil: capacity?.leaseUntil?.toISOString() ?? null,
    },
    attention: attention.map((task) => ({
      ...task,
      nextAttemptAt: task.nextAttemptAt?.toISOString() ?? null,
      leaseUntil: task.leaseUntil?.toISOString() ?? null,
      updatedAt: task.updatedAt.toISOString(),
    })),
  };
}
