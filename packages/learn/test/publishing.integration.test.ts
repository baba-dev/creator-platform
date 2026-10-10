import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@aiwa/db";
import {
  emptyContent,
  savePost,
  publishedContent,
  publishScheduled,
} from "../src/index";
const key = `learn-${randomUUID()}`;
let id = "";
let version = 1;
const c = {
  ...emptyContent(key),
  title: "How to make a useful article",
  excerpt: "A practical guide to publishing.",
  coverId: key,
  coverAlt: "An editorial cover",
  html: "<h2>Start here</h2><p>This guide explains the complete workflow with clear steps, helpful examples, and practical advice for a useful result.</p>",
};
describe.skipIf(process.env.GENERATION_INTEGRATION_TEST !== "true")(
  "Learn publication transactions",
  () => {
    beforeAll(async () => {
      await db.user.create({
        data: {
          id: key,
          name: "Learn test",
          email: `${key}@example.invalid`,
          emailVerified: true,
        },
      });
      await db.organization.create({
        data: { id: key, slug: key, name: "Learn test", ownerUserId: key },
      });
      await db.asset.create({
        data: {
          id: key,
          organizationId: key,
          createdById: key,
          status: "READY",
          mediaKind: "IMAGE",
          sourceType: "UPLOADED",
          storageProvider: "LOCAL",
          objectKey: `org/${key}/test.webp`,
          mimeType: "image/webp",
          byteSize: 1n,
        },
      });
      await db.learnMedia.create({
        data: { id: key, assetId: key, alt: "Test", caption: "", credit: "" },
      });
    });
    afterAll(async () => {
      await db.learnPost.deleteMany({ where: { authorId: key } });
      await db.learnMedia.deleteMany({ where: { id: key } });
      await db.auditEvent.deleteMany({ where: { actorUserId: key } });
      await db.asset.deleteMany({ where: { id: key } });
      await db.organization.deleteMany({ where: { id: key } });
      await db.user.deleteMany({ where: { id: key } });
    });
    it("keeps drafts private and rejects concurrent stale saves", async () => {
      const post = await savePost(key, { content: c, action: "save" });
      id = post.id;
      version = post.version;
      expect(post.publishedAt).toBeNull();
      const results = await Promise.allSettled([
        savePost(key, { id, version, content: c, action: "save" }),
        savePost(key, { id, version, content: c, action: "save" }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      version++;
    });
    it("publishes atomically and protects the live snapshot during editing", async () => {
      const post = await savePost(key, {
        id,
        version,
        content: c,
        action: "publish",
      });
      version = post.version;
      const edited = await savePost(key, {
        id,
        version,
        content: { ...c, title: "Unpublished title" },
        action: "save",
      });
      version = edited.version;
      expect(edited.title).toBe(c.title);
      expect(publishedContent(edited.published).title).toBe(c.title);
      expect(publishedContent(edited.draft).title).toBe("Unpublished title");
    });
    it("reserves renamed slugs and unpublishes without leaking live text", async () => {
      const next = { ...c, slug: `renamed-${key}` };
      const post = await savePost(key, {
        id,
        version,
        content: next,
        action: "publish",
      });
      version = post.version;
      expect(
        (await db.learnRedirect.findUnique({ where: { slug: c.slug } }))
          ?.postId,
      ).toBe(id);
      const unpublished = await savePost(key, {
        id,
        version,
        content: next,
        action: "unpublish",
      });
      version = unpublished.version;
      expect(unpublished.publishedAt).toBeNull();
      expect(unpublished.published).toBeNull();
    });
    it("publishes due schedules once and leaves future schedules private", async () => {
      const scheduled = await savePost(key, {
        id,
        version,
        content: c,
        action: "schedule",
        scheduledAt: new Date(Date.now() + 120000).toISOString(),
      });
      version = scheduled.version;
      await publishScheduled();
      expect(
        (await db.learnPost.findUniqueOrThrow({ where: { id } })).publishedAt,
      ).toBeNull();
      await db.learnPost.update({
        where: { id },
        data: { scheduledAt: new Date(Date.now() - 1000) },
      });
      await Promise.all([publishScheduled(), publishScheduled()]);
      const live = await db.learnPost.findUniqueOrThrow({ where: { id } });
      expect(live.publishedAt).not.toBeNull();
      expect(live.version).toBe(version + 1);
    });
  },
);
