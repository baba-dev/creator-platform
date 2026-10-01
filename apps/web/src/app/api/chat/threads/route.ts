import { db } from "@aiwa/db";
import { chatThreadCreateSchema } from "@aiwa/validation";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";

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

  const threads = await db.chatThread.findMany({
    where: {
      organizationId,
      createdById: session.user.id,
    },
    include: {
      persona: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          tag: true,
          description: true,
          modelId: true,
          voiceKey: true,
        },
      },
      _count: {
        select: { messages: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(
    { threads },
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
    const json = await request.json();
    const input = chatThreadCreateSchema.parse(json);

    const membership = await db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.organizationId,
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

    const thread = await db.chatThread.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        createdById: session.user.id,
        personaId: input.personaId ?? null,
        title: input.title,
        modelId: input.modelId ?? "doubao-seed-character-260628",
        systemPrompt: input.systemPrompt ?? null,
      },
      include: {
        persona: true,
      },
    });

    return NextResponse.json({ thread }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid thread parameters.", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Failed to create chat thread." },
      { status: 500 },
    );
  }
}
