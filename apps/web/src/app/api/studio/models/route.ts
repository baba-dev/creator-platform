import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { STUDIO_TASKS } from "@aiwa/providers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getRequestSession } from "@/lib/request-auth";
import { getAvailableStudioModels } from "@/lib/studio-model-discovery";

const querySchema = z.object({
  organizationId: z.string().min(1).max(128),
  task: z.enum(STUDIO_TASKS),
});

export async function GET(request: Request): Promise<NextResponse> {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    organizationId: url.searchParams.get("organizationId"),
    task: url.searchParams.get("task"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid Studio model query." },
      { status: 400 },
    );
  }

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: parsed.data.organizationId,
        userId: session.user.id,
      },
    },
    include: {
      organization: {
        select: {
          status: true,
        },
      },
    },
  });

  if (!membership || membership.organization.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Organization not found or inactive." },
      { status: 404 },
    );
  }
  if (!hasOrganizationPermission(membership.role, "workspace:view")) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const result = await getAvailableStudioModels(parsed.data.task);
  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
    },
  });
}
