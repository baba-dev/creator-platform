import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { BYTEPLUS_MEDIAKIT_TOOLS } from "@aiwa/providers/byteplus";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

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
  if (!hasPlatformPermission(session.user.platformRole, "models:manage")) {
    return NextResponse.json(
      { error: "You do not have permission to manage provider tools." },
      { status: 403 },
    );
  }

  try {
    await db.$transaction(async (tx) => {
      for (const tool of BYTEPLUS_MEDIAKIT_TOOLS) {
        await tx.providerTool.upsert({
          where: {
            provider_providerToolId: {
              provider: "BYTEPLUS",
              providerToolId: tool.id,
            },
          },
          update: {
            displayName: tool.displayName,
            description: tool.description,
            category: tool.category,
            executionMode: tool.executionMode.toUpperCase() as "ASYNC" | "SYNC",
            pricingMetric: tool.pricingMetric,
            capabilities: tool.capabilities,
          },
          create: {
            provider: "BYTEPLUS",
            providerToolId: tool.id,
            displayName: tool.displayName,
            description: tool.description,
            category: tool.category,
            executionMode: tool.executionMode.toUpperCase() as "ASYNC" | "SYNC",
            pricingMetric: tool.pricingMetric,
            capabilities: tool.capabilities,
            enabled: false,
          },
        });
      }
      await tx.auditEvent.create({
        data: {
          actorUserId: session.user.id,
          action: "provider_tools.synced",
          targetType: "Platform",
          metadata: {
            provider: "BYTEPLUS",
            count: BYTEPLUS_MEDIAKIT_TOOLS.length,
          },
        },
      });
    });
    revalidatePath("/admin/tools");
    return NextResponse.json({
      success: true,
      count: BYTEPLUS_MEDIAKIT_TOOLS.length,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to synchronize MediaKit tools." },
      { status: 500 },
    );
  }
}
