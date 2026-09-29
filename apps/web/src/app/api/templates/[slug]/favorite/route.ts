import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";

async function requestContext(request: Request, slug: string) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return {
      error: NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      ),
    } as const;
  }

  const body = (await request.json().catch(() => null)) as {
    organizationId?: string;
  } | null;
  if (!body?.organizationId) {
    return {
      error: NextResponse.json(
        { error: "Organization is required." },
        { status: 400 },
      ),
    } as const;
  }

  const [membership, template] = await Promise.all([
    db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: body.organizationId,
          userId: session.user.id,
        },
      },
      select: { id: true },
    }),
    db.generationTemplate.findFirst({
      where: { slug, status: "PUBLISHED" },
      select: { id: true },
    }),
  ]);

  if (!membership) {
    return {
      error: NextResponse.json(
        { error: "Workspace access denied." },
        { status: 403 },
      ),
    } as const;
  }
  if (!template) {
    return {
      error: NextResponse.json(
        { error: "Template not found." },
        { status: 404 },
      ),
    } as const;
  }
  return { session, template } as const;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const result = await requestContext(request, slug);
  if ("error" in result) return result.error;

  await db.templateFavorite.upsert({
    where: {
      userId_templateId: {
        userId: result.session.user.id,
        templateId: result.template.id,
      },
    },
    update: {},
    create: {
      userId: result.session.user.id,
      templateId: result.template.id,
    },
  });
  return NextResponse.json({ favorite: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const result = await requestContext(request, slug);
  if ("error" in result) return result.error;

  await db.templateFavorite.deleteMany({
    where: {
      userId: result.session.user.id,
      templateId: result.template.id,
    },
  });
  return NextResponse.json({ favorite: false });
}
