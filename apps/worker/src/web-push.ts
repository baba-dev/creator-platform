import { db } from "@aiwa/db";
import { deliverWebPush } from "@aiwa/core/web-push";

const terminal = ["SUCCEEDED", "FAILED"] as const;
const privateKey = () => process.env.PWA_VAPID_PRIVATE_KEY?.trim() || "";
const subject = () =>
  process.env.PWA_VAPID_SUBJECT?.trim() ||
  "mailto:creator-tool@aiwamediagroup.com";

export async function enqueueTerminalPush(jobId: string): Promise<void> {
  if (!privateKey()) return;
  const job = await db.generationJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      updatedAt: true,
      createdById: true,
      providerModel: { select: { mediaKind: true } },
      createdBy: {
        select: {
          disabledAt: true,
          notificationPreference: {
            select: { generationCompleted: true, generationFailed: true },
          },
        },
      },
    },
  });
  if (
    !job ||
    !terminal.some((status) => status === job.status) ||
    !["IMAGE", "VIDEO", "VOICE"].includes(job.providerModel.mediaKind) ||
    job.createdBy.disabledAt
  )
    return;
  const allowed =
    job.status === "SUCCEEDED"
      ? job.createdBy.notificationPreference?.generationCompleted !== false
      : job.createdBy.notificationPreference?.generationFailed !== false;
  if (!allowed) return;
  const subscriptions = await db.webPushSubscription.findMany({
    where: { userId: job.createdById, createdAt: { lte: job.updatedAt } },
    select: { id: true },
  });
  if (!subscriptions.length) return;
  await db.webPushDelivery.createMany({
    data: subscriptions.map(({ id }) => ({
      subscriptionId: id,
      jobId: job.id,
    })),
    skipDuplicates: true,
  });
}

export async function dispatchPendingPush(): Promise<void> {
  if (!privateKey()) return;
  const stale = new Date(Date.now() - 5 * 60_000);
  const pending = await db.webPushDelivery.findMany({
    where: {
      attempts: { lt: 5 },
      OR: [
        { status: "PENDING" },
        { status: "SENDING", lastAttemptAt: { lt: stale } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 15,
    include: {
      subscription: {
        select: {
          id: true,
          userId: true,
          endpoint: true,
          p256dh: true,
          auth: true,
        },
      },
    },
  });
  for (const delivery of pending) {
    const claim = await db.webPushDelivery.updateMany({
      where: {
        id: delivery.id,
        attempts: { lt: 5 },
        OR: [
          { status: "PENDING" },
          { status: "SENDING", lastAttemptAt: { lt: stale } },
        ],
      },
      data: {
        status: "SENDING",
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });
    if (!claim.count) continue;
    const job = await db.generationJob.findUnique({
      where: { id: delivery.jobId },
      select: {
        id: true,
        status: true,
        createdById: true,
        organizationId: true,
        organization: { select: { slug: true, status: true } },
        createdBy: {
          select: {
            disabledAt: true,
            notificationPreference: {
              select: { generationCompleted: true, generationFailed: true },
            },
          },
        },
      },
    });
    const allowed =
      job &&
      job.createdById === delivery.subscription.userId &&
      job.organization.status === "ACTIVE" &&
      !job.createdBy.disabledAt &&
      (job.status === "SUCCEEDED"
        ? job.createdBy.notificationPreference?.generationCompleted !== false
        : job.status === "FAILED"
          ? job.createdBy.notificationPreference?.generationFailed !== false
          : false);
    const membership = allowed
      ? await db.membership.findFirst({
          where: {
            organizationId: job.organizationId,
            userId: job.createdById,
          },
          select: { id: true },
        })
      : null;
    if (!job || !allowed || !membership) {
      await db.webPushDelivery.update({
        where: { id: delivery.id },
        data: { status: "SKIPPED" },
      });
      continue;
    }
    const kind = job.status === "SUCCEEDED" ? "ready" : "failed";
    const message = JSON.stringify({
      kind,
      id: job.id,
      path: "/app/" + job.organization.slug + "/history/" + job.id,
    });
    try {
      const result = await deliverWebPush({
        endpoint: delivery.subscription.endpoint,
        keys: {
          p256dh: delivery.subscription.p256dh,
          auth: delivery.subscription.auth,
        },
        vapidPrivateKey: privateKey(),
        vapidSubject: subject(),
        payload: message,
      });
      if (result === "gone") {
        await db.webPushSubscription.deleteMany({
          where: { id: delivery.subscription.id },
        });
      } else {
        await db.webPushDelivery.update({
          where: { id: delivery.id },
          data: { status: "SENT", sentAt: new Date() },
        });
      }
    } catch {
      // Endpoint URLs and encryption keys must never be logged.
      await db.webPushDelivery.update({
        where: { id: delivery.id },
        data: { status: delivery.attempts + 1 >= 5 ? "EXHAUSTED" : "PENDING" },
      });
    }
  }
}

export async function reconcileTerminalPush(): Promise<void> {
  if (!privateKey()) return;
  const jobs = await db.generationJob.findMany({
    where: {
      status: { in: ["SUCCEEDED", "FAILED"] },
      updatedAt: { gte: new Date(Date.now() - 24 * 3600_000) },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true },
  });
  for (const job of jobs) await enqueueTerminalPush(job.id);
  await dispatchPendingPush();
}
