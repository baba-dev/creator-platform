import { db, Prisma } from "@aiwa/db";
import { contentSchema, type LearnContent } from "./content";
import { cleanHtml, mediaIds, plainText, publishIssues } from "./sanitize";
export * from "./content";
export * from "./sanitize";
export class LearnError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const json = (c: LearnContent) => c as unknown as Prisma.InputJsonValue;
export function publishedContent(value: unknown): LearnContent {
  return contentSchema.parse(value);
}

export async function savePost(
  actorId: string,
  input: {
    id?: string;
    version?: number;
    content: unknown;
    action: "save" | "review" | "publish" | "schedule" | "unpublish";
    scheduledAt?: string;
    reviewAt?: string;
  },
) {
  const content = contentSchema.parse(input.content);
  content.html = cleanHtml(content.html);
  if (["publish", "schedule"].includes(input.action)) {
    const issues = publishIssues(content);
    if (issues.length) throw new LearnError(issues.join(" "));
  }
  const scheduledAt =
    input.action === "schedule" ? new Date(input.scheduledAt ?? "") : null;
  if (
    scheduledAt &&
    (!Number.isFinite(scheduledAt.getTime()) ||
      scheduledAt.getTime() < Date.now() + 60000)
  )
    throw new LearnError("Schedule at least one minute in the future.");
  const reviewAt = input.reviewAt ? new Date(input.reviewAt) : null;
  if (reviewAt && !Number.isFinite(reviewAt.getTime()))
    throw new LearnError("Invalid review date.");
  return db.$transaction(async (tx) => {
    if (input.id)
      await tx.$queryRaw`SELECT id FROM LearnPost WHERE id=${input.id} FOR UPDATE`;
    const old = input.id
      ? await tx.learnPost.findUnique({ where: { id: input.id } })
      : null;
    if (input.id && !old) throw new LearnError("Article not found.", 404);
    if (old && old.version !== input.version)
      throw new LearnError(
        "A newer revision exists. Reload before editing; your unsaved text is still in this editor.",
        409,
      );
    const publishing = input.action === "publish";
    const unpublishing = input.action === "unpublish";
    const ids = mediaIds(content);
    if (ids.length > 80)
      throw new LearnError("Use at most 80 media items per article.");
    const available = await tx.learnMedia.findMany({
      where: {
        id: { in: ids },
        asset: { status: "READY", storageProvider: "LOCAL" },
      },
      include: { asset: { select: { mediaKind: true } } },
    });
    if (available.length !== ids.length)
      throw new LearnError("One or more media items are unavailable.");
    if (
      content.coverId &&
      !available.some(
        (m) => m.id === content.coverId && m.asset.mediaKind === "IMAGE",
      )
    )
      throw new LearnError("Cover must be an image.");
    if (
      content.socialImageId &&
      !available.some(
        (m) => m.id === content.socialImageId && m.asset.mediaKind === "IMAGE",
      )
    )
      throw new LearnError("Social image must be an image.");
    const liveSlug = publishing || !old?.publishedAt ? content.slug : old.slug;
    const reserved = await tx.learnRedirect.findUnique({
      where: { slug: liveSlug },
    });
    if (reserved && reserved.postId !== old?.id)
      throw new LearnError(
        "This slug is reserved by an existing redirect.",
        409,
      );
    if (publishing && old?.publishedAt && old.slug !== liveSlug)
      await tx.learnRedirect.upsert({
        where: { slug: old.slug },
        create: { slug: old.slug, postId: old.id },
        update: {},
      });
    const live = publishing
      ? content
      : old?.published
        ? publishedContent(old.published)
        : content;
    const now = new Date();
    const data = {
      draft: json(content),
      slug: liveSlug,
      title: live.title,
      excerpt: live.excerpt,
      searchText: plainText(live.html),
      topic: live.topic,
      locale: live.locale,
      translationKey: live.translationKey,
      status: publishing
        ? "PUBLISHED"
        : unpublishing
          ? "DRAFT"
          : input.action === "review"
            ? "REVIEW"
            : scheduledAt
              ? "SCHEDULED"
              : old?.status === "SCHEDULED"
                ? "DRAFT"
                : (old?.status ?? "DRAFT"),
      scheduledAt,
      scheduleError: null,
      reviewAt,
      ...(publishing
        ? {
            published: json(content),
            publishedAt: old?.publishedAt ?? now,
            modifiedAt: now,
          }
        : unpublishing
          ? { published: Prisma.DbNull, publishedAt: null, modifiedAt: null }
          : {}),
    };
    const post = old
      ? await tx.learnPost.update({
          where: { id: old.id },
          data: { ...data, version: { increment: 1 } },
        })
      : await tx.learnPost.create({ data: { ...data, authorId: actorId } });
    await tx.learnRevision.create({
      data: { postId: post.id, content: json(content), actorId },
    });
    // Retain media links for drafts/revisions, but public delivery checks only the live snapshot.
    if (ids.length)
      await tx.learnPostMedia.createMany({
        data: ids.map((mediaId) => ({ postId: post.id, mediaId })),
        skipDuplicates: true,
      });
    await tx.auditEvent.create({
      data: {
        actorUserId: actorId,
        action: `learn.${input.action}`,
        targetType: "LearnPost",
        targetId: post.id,
        metadata: { version: post.version },
      },
    });
    return post;
  });
}
export async function publishScheduled() {
  const due = await db.learnPost.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: new Date() },
      OR: [
        { scheduleError: null },
        { updatedAt: { lte: new Date(Date.now() - 300000) } },
      ],
    },
    take: 10,
    orderBy: { scheduledAt: "asc" },
  });
  for (const post of due) {
    try {
      await savePost(post.authorId, {
        id: post.id,
        version: post.version,
        content: post.draft,
        action: "publish",
        reviewAt: post.reviewAt?.toISOString(),
      });
    } catch (error) {
      // Fence stale scheduler failures; an editor may already have changed the schedule.
      await db.learnPost.updateMany({
        where: { id: post.id, version: post.version, status: "SCHEDULED" },
        data: {
          scheduleError:
            error instanceof LearnError
              ? error.message.slice(0, 240)
              : "Scheduled publication failed; inspect media and retry publication.",
        },
      });
    }
  }
}
export async function searchLearn(query: string, limit = 3) {
  const words = query
    .slice(0, 200)
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 6);
  if (!words.length) return [];
  const posts = await db.learnPost.findMany({
    where: {
      publishedAt: { not: null },
      OR: words.flatMap((word) => [
        { title: { contains: word } },
        { searchText: { contains: word } },
      ]),
    },
    orderBy: { modifiedAt: "desc" },
    select: { title: true, slug: true, searchText: true },
    take: Math.max(1, Math.min(limit, 6)),
  });
  return posts.map((p) => ({
    title: p.title,
    url: `/learn/${p.slug}`,
    content: p.searchText.slice(0, 1600),
  }));
}

export * from "./attribution";
