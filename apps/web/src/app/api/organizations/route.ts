import { db, Prisma } from "@aiwa/db";
import { organizationOnboardingSchema } from "@aiwa/validation";
import { NextResponse } from "next/server";

import { getRequestSession } from "@/lib/request-auth";
import { createOrganizationSlug } from "@/lib/organizations";
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
  const parsed = organizationOnboardingSchema.safeParse(input);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter an organization name between 2 and 80 characters." },
      { status: 400 },
    );
  }

  const existingMembership = await db.membership.findFirst({
    where: {
      userId: session.user.id,
      organization: { status: "ACTIVE" },
    },
    select: { organization: { select: { slug: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (existingMembership) {
    return NextResponse.json(
      {
        error: "Your account already has an organization.",
        workspacePath: `/app/${existingMembership.organization.slug}`,
      },
      { status: 409 },
    );
  }

  try {
    const organization = await db.$transaction(async (transaction) => {
      const created = await transaction.organization.create({
        data: {
          name: parsed.data.name,
          slug: createOrganizationSlug(parsed.data.name),
          selfServeCreatorUserId: session.user.id,
          wallet: { create: {} },
          memberships: {
            create: {
              userId: session.user.id,
              role: "ORGANIZATION_OWNER",
            },
          },
        },
        select: { id: true, name: true, slug: true },
      });

      await transaction.session.update({
        where: { id: session.session.id },
        data: { activeOrganizationId: created.id },
      });

      await transaction.auditEvent.create({
        data: {
          actorUserId: session.user.id,
          organizationId: created.id,
          action: "organization.self_service_created",
          targetType: "Organization",
          targetId: created.id,
          metadata: { signupFlow: "email_password" },
        },
      });

      return created;
    });

    return NextResponse.json(
      {
        organization,
        workspacePath: `/app/${organization.slug}`,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Your account already completed organization setup." },
        { status: 409 },
      );
    }

    throw error;
  }
}
