import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAssetMembership, serializeAsset } from "@/lib/asset-api";
import { getRequestSession } from "@/lib/request-auth";

const querySchema = z.object({
  organizationId: z.string().min(1).max(100),
  q: z.string().trim().max(120).optional(),
  mediaKind: z
    .enum(["IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "OTHER"])
    .optional(),
  sourceType: z
    .enum(["GENERATED", "UPLOADED", "IMPORTED", "DERIVED", "EXTERNAL"])
    .optional(),
  projectId: z.string().max(100).optional(),
  folderId: z.string().max(100).optional(),
  tagId: z.string().max(100).optional(),
  favorite: z.enum(["true", "false"]).optional(),
  trash: z.enum(["true", "false"]).optional(),
  cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(12).max(100).default(36),
});

export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid asset query." },
      { status: 400 },
    );

  const input = parsed.data;
  const membership = await requireAssetMembership(
    session,
    input.organizationId,
    false,
  );
  if (!membership)
    return NextResponse.json(
      { error: "Workspace access denied." },
      { status: 403 },
    );

  const trash = input.trash === "true";
  const where = {
    organizationId: input.organizationId,
    status: trash ? ("DELETED" as const) : ("READY" as const),
    ...(input.mediaKind ? { mediaKind: input.mediaKind } : {}),
    ...(input.sourceType ? { sourceType: input.sourceType } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.folderId
      ? input.folderId === "unfiled"
        ? { folderId: null }
        : { folderId: input.folderId }
      : {}),
    ...(input.tagId
      ? { tagAssignments: { some: { tagId: input.tagId } } }
      : {}),
    ...(input.favorite === "true"
      ? { favorites: { some: { userId: session.user.id } } }
      : {}),
    ...(input.q
      ? {
          OR: [
            { name: { contains: input.q } },
            { originalFilename: { contains: input.q } },
            {
              tagAssignments: {
                some: { tag: { name: { contains: input.q } } },
              },
            },
          ],
        }
      : {}),
  };

  const rows = await db.asset.findMany({
    where,
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      name: true,
      originalFilename: true,
      mediaKind: true,
      sourceType: true,
      mimeType: true,
      byteSize: true,
      width: true,
      height: true,
      durationMs: true,
      status: true,
      projectId: true,
      folderId: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      purgeAfter: true,
      project: { select: { id: true, name: true } },
      folder: { select: { id: true, name: true } },
      variants: {
        where: { kind: { in: ["THUMBNAIL", "POSTER"] } },
        select: {
          id: true,
          kind: true,
          mimeType: true,
          width: true,
          height: true,
        },
      },
      tagAssignments: {
        select: { tag: { select: { id: true, name: true } } },
        orderBy: { tag: { name: "asc" } },
      },
      favorites: {
        where: { userId: session.user.id },
        select: { userId: true },
      },
    },
  });

  const hasMore = rows.length > input.limit;
  const page = rows.slice(0, input.limit);
  return NextResponse.json(
    {
      assets: page.map((row) => ({
        ...serializeAsset(row),
        favorite: row.favorites.length > 0,
        tags: row.tagAssignments.map(({ tag }) => tag),
        tagAssignments: undefined,
        favorites: undefined,
      })),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
