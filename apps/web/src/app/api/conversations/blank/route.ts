import { hasOrganizationPermission } from "@aiwa/authz";
import { db } from "@aiwa/db";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import { rateLimit } from "@/lib/rate-limit";
import type { ConversationState } from "@/lib/conversations/types";

export const runtime = "nodejs";

const startSchema = z.object({
  organizationId: z.string().trim().min(1).max(100),
}).strict();

const startLimiter = rateLimit({
  max: 10,
  windowMs: 60_000,
  prefix: "creative-conversation-start",
});

/** Creates an empty conversation: never admits a job or reserves credits. */
export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }
  const session = await getRequestSession(request.headers);
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const limited = await startLimiter.check(session.user.id);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = startSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid conversation parameters." }, { status: 400 });
  }
  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: parsed.data.organizationId,
        userId: session.user.id,
      },
    },
    include: { organization: true },
  });
  if (!membership || membership.organization.status !== "ACTIVE" ||
      !hasOrganizationPermission(membership.role, "generation:create")) {
    return NextResponse.json({ error: "Workspace access denied." }, { status: 403 });
  }
  const initialState: ConversationState = {
    activeModality: "IMAGE",
    currentModelId: null,
    currentProvider: null,
    activeOutputs: [],
    settings: {},
    revision: 0,
  };
  const thread = await db.chatThread.create({
    data: {
      organizationId: membership.organizationId,
      createdById: session.user.id,
      threadType: "CREATIVE",
      title: "New conversation",
      state: initialState,
    },
    select: { id: true, title: true },
  });
  return NextResponse.json({
    conversationId: thread.id, title: thread.title,
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
