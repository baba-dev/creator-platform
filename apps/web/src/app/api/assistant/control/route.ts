import { db } from "@aiwa/db";
import {
  cancelPixelWorkflow,
  executePixelAction,
  getAssistantSettings,
  getPixelPreferences,
  listPixelWorkflows,
  quotePixelAction,
  savePixelPreferences,
  requirePixelAccess,
} from "@aiwa/assistant";
import { GenerationError } from "@aiwa/generation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestSession } from "@/lib/request-auth";
import { hasTrustedMutationOrigin } from "@/lib/request-security";
import { rateLimit } from "@/lib/rate-limit";

const id = z.string().min(1).max(100);
const schema = z.discriminatedUnion("operation", [
  z
    .object({
      threadId: id,
      operation: z.literal("quote"),
      actionId: id,
      selectedSourceId: id.optional(),
    })
    .strict(),
  z
    .object({
      threadId: id,
      operation: z.literal("execute"),
      actionId: id,
      quoteId: z.string().uuid(),
    })
    .strict(),
  z
    .object({ threadId: id, operation: z.literal("cancel"), workflowId: id })
    .strict(),
  z
    .object({
      threadId: id,
      operation: z.literal("preferences"),
      preferences: z.unknown(),
    })
    .strict(),
]);
const limiter = rateLimit({
  max: 30,
  windowMs: 60_000,
  prefix: "pixel-control",
});

async function context(request: Request, threadId: string) {
  const session = await getRequestSession(request.headers);
  if (!session) throw new GenerationError("Authentication required.", 401);
  const thread = await db.chatThread.findFirst({
    where: { id: threadId, createdById: session.user.id },
    select: {
      id: true,
      organizationId: true,
      organization: { select: { slug: true } },
    },
  });
  if (!thread) throw new GenerationError("Pixel thread not found.", 404);
  const ctx = {
    threadId: thread.id,
    userId: session.user.id,
    organizationId: thread.organizationId,
    organizationSlug: thread.organization.slug,
    idempotencyKey: crypto.randomUUID(),
  };
  await requirePixelAccess(ctx);
  if (!(await getAssistantSettings()).enabled)
    throw new GenerationError("Pixel is disabled.", 403);
  return ctx;
}

function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof GenerationError
          ? error.message
          : error instanceof z.ZodError
            ? "Invalid Pixel action."
            : "Pixel action could not be completed. Refresh its status before retrying.",
    },
    {
      status:
        error instanceof GenerationError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 500,
    },
  );
}

export async function GET(request: Request) {
  try {
    const ctx = await context(
      request,
      id.parse(new URL(request.url).searchParams.get("threadId")),
    );
    const [workflows, preferences, brands] = await Promise.all([
      listPixelWorkflows(ctx),
      getPixelPreferences(ctx),
      db.brandProfile.findMany({
        where: { organizationId: ctx.organizationId },
        take: 20,
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return NextResponse.json(
      { workflows, preferences, brands },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  try {
    const text = await request.text();
    if (text.length > 8000)
      return NextResponse.json(
        { error: "Request too large." },
        { status: 413 },
      );
    const input = schema.parse(JSON.parse(text));
    const ctx = await context(request, input.threadId);
    const limited = await limiter.check(ctx.userId);
    if (limited) return limited;
    const result =
      input.operation === "quote"
        ? await quotePixelAction(ctx, input.actionId, input.selectedSourceId)
        : input.operation === "execute"
          ? await executePixelAction(ctx, input.actionId, input.quoteId)
          : input.operation === "cancel"
            ? await cancelPixelWorkflow(ctx, input.workflowId)
            : await savePixelPreferences(ctx, input.preferences);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
