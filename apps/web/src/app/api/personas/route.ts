import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { personaCreateSchema } from "@aiwa/validation";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  clientChatModelReference,
  resolveRequestedChatModel,
} from "@/lib/chat-model-selection";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import {
  getAvailableStudioModels,
  StudioModelUnavailableError,
  type PublicStudioModel,
} from "@/lib/studio-model-discovery";

const personaSelect = {
  id: true,
  organizationId: true,
  name: true,
  avatarUrl: true,
  tag: true,
  description: true,
  systemPrompt: true,
  voiceKey: true,
  modelId: true,
  providerModelRecordId: true,
  isPreset: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const;

type PersonaRow = {
  id: string;
  organizationId: string;
  name: string;
  avatarUrl: string | null;
  tag: string | null;
  description: string | null;
  systemPrompt: string;
  voiceKey: string | null;
  modelId: string;
  providerModelRecordId: string | null;
  isPreset: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
};

function serializePersona(
  persona: PersonaRow,
  models: readonly PublicStudioModel[],
) {
  return {
    ...persona,
    ...clientChatModelReference(persona, models),
    providerModelRecordId: undefined,
  };
}

export async function GET(request: Request) {
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId is required." },
      { status: 400 },
    );
  }

  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId: session.user.id,
      },
    },
    include: { organization: true },
  });
  if (!membership || membership.organization.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Workspace access denied." },
      { status: 403 },
    );
  }

  const [personas, discovery] = await Promise.all([
    db.persona.findMany({
      where: { organizationId },
      select: personaSelect,
      orderBy: [{ isPreset: "desc" }, { createdAt: "asc" }],
      take: 100,
    }),
    getAvailableStudioModels("character-chat"),
  ]);

  return NextResponse.json(
    {
      personas: personas.map((persona) =>
        serializePersona(persona, discovery.models),
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
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

  try {
    const input = personaCreateSchema.parse(await request.json());
    const membership = await db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.organizationId,
          userId: session.user.id,
        },
      },
      include: { organization: true },
    });
    if (
      !membership ||
      membership.organization.status !== "ACTIVE" ||
      !hasOrganizationPermission(membership.role, "generation:create")
    ) {
      return NextResponse.json(
        { error: "Workspace access denied." },
        { status: 403 },
      );
    }

    const selectedModel = await resolveRequestedChatModel(input.modelId);
    const persona = await db.persona.create({
      data: {
        organizationId: input.organizationId,
        createdById: session.user.id,
        name: input.name,
        avatarUrl: input.avatarUrl ?? null,
        tag: input.tag ?? null,
        description: input.description ?? null,
        systemPrompt: input.systemPrompt,
        voiceKey: input.voiceKey ?? null,
        modelId: selectedModel.providerModelId,
        providerModelRecordId: selectedModel.id,
        isPreset: false,
      },
      select: personaSelect,
    });

    return NextResponse.json(
      {
        persona: {
          ...serializePersona(persona, [selectedModel]),
          modelAvailable: true,
          modelReference: "CANONICAL",
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid persona parameters.", issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof StudioModelUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: "Failed to create persona." },
      { status: 500 },
    );
  }
}
