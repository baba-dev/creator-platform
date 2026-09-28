import { db } from "@aiwa/db";
import { templateListQuerySchema } from "@aiwa/validation";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";

export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const url = new URL(request.url);
  const parsed = templateListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid template filters." }, { status: 400 });
  const input = parsed.data;

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: session.user.id,
      },
    },
    select: { id: true },
  });
  if (!membership) return NextResponse.json({ error: "Workspace access denied." }, { status: 403 });

  const templates = await db.generationTemplate.findMany({
    where: {
      status: "PUBLISHED",
      ...(input.mediaKind ? { mediaKind: input.mediaKind } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.q ? {
        OR: [
          { name: { contains: input.q } },
          { description: { contains: input.q } },
          { category: { contains: input.q } },
        ],
      } : {}),
      ...(input.favorites ? {
        favorites: { some: { userId: session.user.id } },
      } : {}),
    },
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      category: true,
      mediaKind: true,
      featured: true,
      defaultInput: true,
      thumbnailAssetId: true,
      favorites: {
        where: { userId: session.user.id },
        select: { userId: true },
      },
      _count: { select: { generationJobs: true } },
    },
  });

  return NextResponse.json({
    templates: templates.map(({ favorites, _count, ...template }) => ({
      ...template,
      favorite: favorites.length > 0,
      usageCount: _count.generationJobs,
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
