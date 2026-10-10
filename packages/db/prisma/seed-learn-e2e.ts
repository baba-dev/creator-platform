// Test-only seed: deliberately refuses remote databases and production.
import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
const url = new URL(process.env.DATABASE_URL ?? "mysql://invalid");
if (
  process.env.LEARN_E2E !== "true" ||
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  process.env.APP_ENV === "production"
)
  throw new Error(
    "Learn fixtures require an explicitly enabled local test database.",
  );
const db = new PrismaClient();
const userId = "learn-e2e-admin";
await db.user.upsert({
  where: { id: userId },
  create: {
    id: userId,
    email: "learn-e2e@example.invalid",
    name: "Learn test editor",
    emailVerified: true,
    twoFactorEnabled: true,
    platformRole: "PLATFORM_ADMIN",
  },
  update: {},
});
await db.organization.upsert({
  where: { id: "learn-e2e-org" },
  create: {
    id: "learn-e2e-org",
    slug: "learn-e2e",
    name: "Learn test workspace",
    ownerUserId: userId,
    memberships: { create: { userId, role: "ORGANIZATION_OWNER" } },
    wallet: { create: { balanceCache: 1000n } },
  },
  update: {},
});
const coverBytes = Buffer.from(
  "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAJABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABAf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdgKaS/9k=",
  "base64",
);
const coverObjectKey = "org/learn-e2e-org/assets/00/learn-e2e-cover-image.jpg";
const storageRoot = process.env.ASSET_STORAGE_ROOT;
if (!storageRoot)
  throw new Error("ASSET_STORAGE_ROOT is required for fixtures.");
const coverPath = join(storageRoot, coverObjectKey);
await mkdir(dirname(coverPath), { recursive: true });
await writeFile(coverPath, coverBytes, { mode: 0o600 });
await db.asset.upsert({
  where: { id: "learn-e2e-cover-asset" },
  create: {
    id: "learn-e2e-cover-asset",
    organizationId: "learn-e2e-org",
    storageOwnerUserId: userId,
    createdById: userId,
    uploadedById: userId,
    status: "READY",
    purpose: "REFERENCE_INPUT",
    mediaKind: "IMAGE",
    sourceType: "UPLOADED",
    storageProvider: "LOCAL",
    name: "Learn E2E cover",
    originalFilename: "learn-e2e-cover-image.jpg",
    objectKey: coverObjectKey,
    mimeType: "image/jpeg",
    byteSize: BigInt(coverBytes.length),
    sha256: createHash("sha256").update(coverBytes).digest("hex"),
    width: 16,
    height: 9,
  },
  update: {
    status: "READY",
    objectKey: coverObjectKey,
    byteSize: BigInt(coverBytes.length),
  },
});
await db.learnMedia.upsert({
  where: { id: "learn-e2e-cover" },
  create: {
    id: "learn-e2e-cover",
    assetId: "learn-e2e-cover-asset",
    alt: "Purple gradient cover for the image prompting guide",
    caption: "",
    credit: "Aiwa Creators",
  },
  update: {},
});
for (const token of [
  "learn-e2e-desktop-chromium",
  "learn-e2e-mobile-chromium",
]) {
  await db.session.upsert({
    where: { token },
    create: { token, userId, expiresAt: new Date(Date.now() + 3600000) },
    update: { expiresAt: new Date(Date.now() + 3600000) },
  });
}
const content = {
  title: "A little direction. A remarkable image.",
  slug: "learn-e2e-guide",
  excerpt:
    "Turn a loose idea into a clear visual brief, then make it your own in Image Studio.",
  html: "<h2>Start with the story</h2><p>Describe the subject, the setting, and the feeling you want the image to convey. A useful brief gives your creative choices a clear direction.</p><h2>Shape the light</h2><p>Choose soft daylight for a natural look, or stronger contrast for a more dramatic composition.</p><blockquote><p>Change one part of the prompt at a time so you can see what made the difference.</p></blockquote><h2>Make it your own</h2><p>Explore a few variations, compare the results, and keep the version that best fits your project.</p>",
  type: "Guide",
  topic: "images",
  tags: ["Prompting", "Getting started"],
  author: "Aiwa Creators",
  authorBio: "Practical notes from the Aiwa creative team.",
  coverId: "learn-e2e-cover",
  coverAlt: "Purple gradient cover for the image prompting guide",
  focalX: 50,
  focalY: 50,
  seoTitle: "",
  description: "",
  socialImageId: "learn-e2e-cover",
  noindex: true,
  locale: "en",
  translationKey: "learn-e2e-guide",
  tool: "image",
  ctaLabel: "Try Image Studio",
  prompt:
    "A quiet courtyard in warm morning light, natural textures, editorial photography.",
  featured: true,
};
await db.learnPost.upsert({
  where: { id: "learn-e2e-guide" },
  create: {
    id: "learn-e2e-guide",
    slug: content.slug,
    draft: content,
    published: content,
    title: content.title,
    excerpt: content.excerpt,
    searchText: "An image guide for creative prompts and lighting.",
    topic: "images",
    locale: "en",
    translationKey: content.translationKey,
    status: "PUBLISHED",
    authorId: userId,
    publishedAt: new Date(),
    modifiedAt: new Date(),
  },
  update: {
    draft: content,
    published: content,
    title: content.title,
    excerpt: content.excerpt,
    searchText: "An image guide for creative prompts and lighting.",
    topic: "images",
    status: "PUBLISHED",
    publishedAt: new Date(),
    modifiedAt: new Date(),
  },
});
await db.learnPostMedia.upsert({
  where: {
    postId_mediaId: {
      postId: "learn-e2e-guide",
      mediaId: "learn-e2e-cover",
    },
  },
  create: { postId: "learn-e2e-guide", mediaId: "learn-e2e-cover" },
  update: {},
});
await db.learnPost.upsert({
  where: { id: "learn-e2e-draft" },
  create: {
    id: "learn-e2e-draft",
    slug: "learn-e2e-draft",
    draft: {
      ...content,
      slug: "learn-e2e-draft",
      translationKey: randomUUID(),
    },
    title: "PRIVATE DRAFT",
    excerpt: "",
    searchText: "",
    topic: "images",
    locale: "en",
    translationKey: "learn-e2e-draft",
    authorId: userId,
  },
  update: {},
});
await db.$disconnect();
