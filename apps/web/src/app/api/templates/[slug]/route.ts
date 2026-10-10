import { db } from "@aiwa/db";
import { templateListQuerySchema } from "@aiwa/validation";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";
import { parseTemplateVariables } from "@/lib/templates";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const input = templateListQuerySchema.safeParse({
    organizationId:
      new URL(request.url).searchParams.get("organizationId") ?? "",
  });
  if (!input.success)
    return NextResponse.json({ error: "Invalid workspace." }, { status: 400 });
  const { slug } = await params;
  const [membership, template] = await Promise.all([
    db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.data.organizationId,
          userId: session.user.id,
        },
      },
      select: { id: true },
    }),
    db.generationTemplate.findFirst({
      where: {
        slug,
        status: "PUBLISHED",
        mediaKind: { in: ["IMAGE", "VIDEO", "VOICE"] },
      },
      select: { slug: true, name: true, mediaKind: true, variables: true },
    }),
  ]);
  if (!membership)
    return NextResponse.json(
      { error: "Workspace access denied." },
      { status: 403 },
    );
  if (!template)
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  try {
    return NextResponse.json(
      {
        template: {
          slug: template.slug,
          name: template.name,
          mediaKind: template.mediaKind,
          variables: parseTemplateVariables(template.variables),
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Template setup is invalid. Contact an administrator." },
      { status: 409 },
    );
  }
}
