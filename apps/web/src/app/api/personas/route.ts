import { db } from "@aiwa/db";
import { personaCreateSchema } from "@aiwa/validation";
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

  const personas = await db.persona.findMany({
    where: {
      OR: [{ organizationId }, { isPreset: true }],
    },
    orderBy: [{ isPreset: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(
    { personas },
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
    const input = personaCreateSchema.parse(json);

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
        modelId: input.modelId ?? "doubao-seed-character-260628",
        isPreset: false,
      },
    });

    return NextResponse.json({ persona }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid persona parameters.", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Failed to create persona." },
      { status: 500 },
    );
  }
}
