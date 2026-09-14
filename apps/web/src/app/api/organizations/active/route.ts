import { activateOrganizationSchema } from "@aiwa/validation";
import { NextResponse } from "next/server";

import { db } from "@aiwa/db";

import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

export async function POST(request: Request): Promise<NextResponse> {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }

  const session = await getRequestSession(request.headers);

  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const input = await request.json().catch(() => null);
  const parsed = activateOrganizationSchema.safeParse(input);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid organization." },
      { status: 400 },
    );
  }

  const membership = await db.membership.findFirst({
    where: {
      userId: session.user.id,
      organizationId: parsed.data.organizationId,
      organization: { status: "ACTIVE" },
    },
    select: {
      organization: { select: { id: true, slug: true } },
    },
  });

  if (!membership) {
    return NextResponse.json(
      { error: "Organization not found." },
      { status: 404 },
    );
  }

  await db.$transaction([
    db.session.update({
      where: { id: session.session.id },
      data: { activeOrganizationId: membership.organization.id },
    }),
    db.auditEvent.create({
      data: {
        actorUserId: session.user.id,
        organizationId: membership.organization.id,
        action: "organization.session_activated",
        targetType: "Session",
        targetId: session.session.id,
      },
    }),
  ]);

  return NextResponse.json({
    workspacePath: `/app/${membership.organization.slug}`,
  });
}
