import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import { getAvailableStudioModels } from "@/lib/studio-model-discovery";

const querySchema = z.object({ organizationId: z.string().min(1).max(191) });
const updateSchema = querySchema.extend({
  modelId: z.string().min(1).max(191).nullable(),
}).strict();

async function authenticate(request: Request, organizationId: string) {
  const session = await getRequestSession(request.headers);
  if (!session) return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  const membership = await db.membership.findUnique({
    where: { organizationId_userId: { organizationId, userId: session.user.id } },
    include: { organization: { select: { status: true } } },
  });
  if (!membership || membership.organization.status !== "ACTIVE") {
    return { error: NextResponse.json({ error: "Workspace not found or inactive." }, { status: 404 }) };
  }
  if (!hasOrganizationPermission(membership.role, "workspace:view")) {
    return { error: NextResponse.json({ error: "Access denied." }, { status: 403 }) };
  }
  return { userId: session.user.id };
}

const noStore = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: Request) {
  const parsed = querySchema.safeParse({ organizationId: new URL(request.url).searchParams.get("organizationId") });
  if (!parsed.success) return NextResponse.json({ error: "Invalid workspace." }, { status: 400 });
  const auth = await authenticate(request, parsed.data.organizationId);
  if (auth.error) return auth.error;

  const [available, saved] = await Promise.all([
    getAvailableStudioModels("prompt-enhancement"),
    db.promptEnhancementPreference.findUnique({
      where: { organizationId_userId: { organizationId: parsed.data.organizationId, userId: auth.userId! } },
      select: { modelId: true },
    }),
  ]);
  const valid = saved && available.models.some((model) => model.id === saved.modelId);
  return NextResponse.json({
    models: available.models,
    defaultModelId: available.defaultModelId,
    modelId: valid ? saved.modelId : available.defaultModelId,
    savedModelUnavailable: Boolean(saved && !valid),
  }, { headers: noStore });
}

export async function PATCH(request: Request) {
  if (!hasTrustedMutationOrigin(request)) return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 2048) return NextResponse.json({ error: "Request too large." }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid model preference." }, { status: 400 }); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid model preference." }, { status: 400 });
  const { organizationId, modelId } = parsed.data;
  const auth = await authenticate(request, organizationId);
  if (auth.error) return auth.error;
  const available = await getAvailableStudioModels("prompt-enhancement");
  if (modelId !== null && !available.models.some((model) => model.id === modelId)) {
    return NextResponse.json({ error: "This Prompt Enhance model is not currently available." }, { status: 400 });
  }
  const key = { organizationId_userId: { organizationId, userId: auth.userId! } };
  if (modelId === null) {
    await db.promptEnhancementPreference.deleteMany({ where: { organizationId, userId: auth.userId! } });
  } else {
    await db.promptEnhancementPreference.upsert({
      where: key,
      create: { organizationId, userId: auth.userId!, modelId },
      update: { modelId },
    });
  }
  await db.auditEvent.create({
    data: {
      actorUserId: auth.userId!,
      organizationId,
      action: "user.prompt_enhancement_model_updated",
      targetType: "User",
      targetId: auth.userId!,
      metadata: { modelId },
    },
  });
  return NextResponse.json({ modelId: modelId ?? available.defaultModelId }, { headers: noStore });
}
