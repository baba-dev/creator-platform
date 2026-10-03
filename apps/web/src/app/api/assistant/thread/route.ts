import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { getOrCreateAssistantThread } from "@aiwa/assistant";
import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/request-auth";

export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  const organizationId = new URL(request.url).searchParams.get(
    "organizationId",
  );
  if (!organizationId)
    return NextResponse.json(
      { error: "organizationId is required." },
      { status: 400 },
    );

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: { organizationId, userId: session.user.id },
    },
    include: { organization: true },
  });
  if (
    !membership ||
    membership.organization.status !== "ACTIVE" ||
    !hasOrganizationPermission(membership.role, "generation:create")
  )
    return NextResponse.json(
      { error: "Workspace access denied." },
      { status: 403 },
    );

  try {
    const { thread, persona, settings } = await getOrCreateAssistantThread(
      organizationId,
      session.user.id,
    );
    if (!settings.enabled)
      return NextResponse.json(
        { error: "The AI Assistant is currently disabled." },
        { status: 403 },
      );
    return NextResponse.json(
      {
        thread,
        persona,
        settings: {
          enabled: settings.enabled,
          pricingMode: settings.pricingMode,
          modelDisplayName: settings.providerModel?.displayName ?? null,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to initialise assistant." },
      { status: 500 },
    );
  }
}
