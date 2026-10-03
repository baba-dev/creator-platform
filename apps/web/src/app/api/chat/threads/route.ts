import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { chatThreadCreateSchema } from "@aiwa/validation";
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
  name: true,
  avatarUrl: true,
  tag: true,
  description: true,
  systemPrompt: true,
  voiceKey: true,
  modelId: true,
  providerModelRecordId: true,
  isPreset: true,
} as const;

type PersonaSummary = {
  id: string;
  name: string;
  avatarUrl: string | null;
  tag: string | null;
  description: string | null;
  systemPrompt: string;
  voiceKey: string | null;
  modelId: string;
  providerModelRecordId: string | null;
  isPreset: boolean;
};

function serializePersona(
  persona: PersonaSummary | null,
  models: readonly PublicStudioModel[],
) {
  if (!persona) return null;
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

  const [threads, discovery] = await Promise.all([
    db.chatThread.findMany({
      where: {
        organizationId,
        createdById: session.user.id,
      },
      select: {
        id: true,
        title: true,
        modelId: true,
        providerModelRecordId: true,
        createdAt: true,
        updatedAt: true,
        persona: { select: personaSelect },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    getAvailableStudioModels("character-chat"),
  ]);

  return NextResponse.json(
    {
      threads: threads.map((thread) => ({
        ...thread,
        ...clientChatModelReference(thread, discovery.models),
        providerModelRecordId: undefined,
        persona: serializePersona(thread.persona, discovery.models),
      })),
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
    const input = chatThreadCreateSchema.parse(await request.json());
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

    if (input.projectId) {
      const project = await db.project.findFirst({
        where: {
          id: input.projectId,
          organizationId: input.organizationId,
          archivedAt: null,
        },
        select: { id: true },
      });
      if (!project) {
        return NextResponse.json(
          { error: "Project is unavailable in this workspace." },
          { status: 400 },
        );
      }
    }

    if (input.personaId) {
      const persona = await db.persona.findFirst({
        where: {
          id: input.personaId,
          organizationId: input.organizationId,
        },
        select: { id: true },
      });
      if (!persona) {
        return NextResponse.json(
          { error: "Persona is unavailable in this workspace." },
          { status: 400 },
        );
      }
    }

    const selectedModel = await resolveRequestedChatModel(input.modelId);
    const thread = await db.chatThread.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        createdById: session.user.id,
        personaId: input.personaId ?? null,
        title: input.title,
        modelId: selectedModel.providerModelId,
        providerModelRecordId: selectedModel.id,
        systemPrompt: input.systemPrompt ?? null,
      },
      select: {
        id: true,
        title: true,
        modelId: true,
        providerModelRecordId: true,
        createdAt: true,
        updatedAt: true,
        persona: { select: personaSelect },
      },
    });

    return NextResponse.json(
      {
        thread: {
          ...thread,
          modelId: selectedModel.id,
          modelAvailable: true,
          modelReference: "CANONICAL",
          providerModelRecordId: undefined,
          persona: serializePersona(thread.persona, [selectedModel]),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid thread parameters.", issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof StudioModelUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: "Failed to create chat thread." },
      { status: 500 },
    );
  }
}
