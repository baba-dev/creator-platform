import { hasPlatformPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import {
  getAssistantSettings,
  updateAssistantSettings,
  assistantSettingUpdateSchema,
} from "@aiwa/assistant";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import { getAvailableStudioModels } from "@/lib/studio-model-discovery";

export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  if (!hasPlatformPermission(session.user.platformRole, "models:read"))
    return NextResponse.json({ error: "Access denied." }, { status: 403 });

  const [settings, discovery] = await Promise.all([
    getAssistantSettings(),
    getAvailableStudioModels("character-chat"),
  ]);
  return NextResponse.json(
    {
      settings: {
        id: settings.id,
        providerModelRecordId: settings.providerModelRecordId,
        modelDisplayName: settings.providerModel?.displayName ?? null,
        pricingMode: settings.pricingMode,
        systemPromptOverride: settings.systemPromptOverride,
        enabled: settings.enabled,
      },
      availableModels: discovery.models,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });

  const session = await getRequestSession(request.headers);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  if (!hasPlatformPermission(session.user.platformRole, "models:manage"))
    return NextResponse.json({ error: "Access denied." }, { status: 403 });

  try {
    const input = assistantSettingUpdateSchema.parse(await request.json());
    const updated = await updateAssistantSettings({
      ...input,
      updatedById: session.user.id,
    });

    await db.auditEvent.create({
      data: {
        actorUserId: session.user.id,
        action: "assistant.settings_updated",
        targetType: "AssistantSetting",
        targetId: updated.id,
        metadata: {
          providerModelRecordId: updated.providerModelRecordId,
          providerModelId: updated.providerModel?.providerModelId,
          provider: updated.providerModel?.provider,
          pricingMode: updated.pricingMode,
          enabled: updated.enabled,
        },
      },
    });

    return NextResponse.json({
      settings: {
        id: updated.id,
        providerModelRecordId: updated.providerModelRecordId,
        modelDisplayName: updated.providerModel?.displayName ?? null,
        pricingMode: updated.pricingMode,
        systemPromptOverride: updated.systemPromptOverride,
        enabled: updated.enabled,
      },
    });
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        { error: "Invalid configuration parameters.", issues: error.issues },
        { status: 400 },
      );
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update assistant settings.",
      },
      { status: 400 },
    );
  }
}
