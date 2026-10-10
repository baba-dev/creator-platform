import { createHmac } from "node:crypto";
import { db } from "@aiwa/db";
export function learnVisitor(userId: string) {
  return createHmac("sha256", process.env.AUTH_SECRET!)
    .update(`learn:${userId}`)
    .digest("hex");
}
// First-touch, 30-day attribution; no cross-site tracking or IP collection.
export async function attributeLearn(
  userId: string,
  postId: string,
  signup = false,
) {
  const post = await db.learnPost.findFirst({
    where: { id: postId, publishedAt: { not: null } },
    select: { id: true },
  });
  if (!post) return;
  const visitor = learnVisitor(userId);
  const day = new Date().toISOString().slice(0, 10);
  const kind = signup ? "SIGNUP" : "TOOL_VISIT";
  await db.$transaction(async (tx) => {
    await tx.learnEvent.upsert({
      where: { postId_kind_visitor_day: { postId, kind, visitor, day } },
      create: { postId, kind, visitor, day },
      update: {},
    });
    await tx.learnAttribution.upsert({
      where: { userId },
      create: {
        userId,
        postId,
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
      update: {},
    });
  });
}
export async function reconcileLearnConversions() {
  const pending = await db.learnAttribution.findMany({
    where: { convertedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { checkedAt: "asc" },
    take: 50,
  });
  for (const a of pending) {
    const job = await db.generationJob.findFirst({
      where: {
        createdById: a.userId,
        status: "SUCCEEDED",
        createdAt: { gte: a.createdAt },
        assets: {
          some: {
            mediaKind: { in: ["IMAGE", "VIDEO", "AUDIO"] },
            status: "READY",
          },
        },
      },
      select: { id: true },
    });
    await db.$transaction(async (tx) => {
      await tx.learnAttribution.updateMany({
        where: { userId: a.userId, convertedAt: null },
        data: {
          checkedAt: new Date(),
          ...(job ? { convertedAt: new Date() } : {}),
        },
      });
      if (job) {
        const visitor = learnVisitor(a.userId);
        await tx.learnEvent.upsert({
          where: {
            postId_kind_visitor_day: {
              postId: a.postId,
              kind: "FIRST_GENERATION",
              visitor,
              day: "once",
            },
          },
          create: {
            postId: a.postId,
            kind: "FIRST_GENERATION",
            visitor,
            day: "once",
          },
          update: {},
        });
      }
    });
  }
}
