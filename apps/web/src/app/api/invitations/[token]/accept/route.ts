import { db } from "@aiwa/db";
import { acceptOrganizationInvitation } from "@aiwa/organizations";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { organizationError } from "@/lib/organization-api";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

const invitationTokenSchema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{48}$/, "Invalid invitation token format.");

const invitationLimiter = rateLimit({
  max: 10,
  windowMs: 60_000,
  prefix: "invitation-accept",
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
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

  const rateLimited = invitationLimiter.check(session.user.id);
  if (rateLimited) return rateLimited;

  const { token } = await params;
  const parsed = invitationTokenSchema.safeParse(token);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invitation token is invalid or malformed." },
      { status: 400 },
    );
  }

  try {
    const result = await acceptOrganizationInvitation({
      actorUserId: session.user.id,
      token,
    });

    await db.session.updateMany({
      where: { userId: session.user.id },
      data: { activeOrganizationId: result.organization.id },
    });

    revalidatePath("/app", "layout");

    return NextResponse.json({
      ok: true,
      organizationSlug: result.organization.slug,
    });
  } catch (error) {
    return organizationError(error);
  }
}
