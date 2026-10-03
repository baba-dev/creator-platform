import { createHash } from "node:crypto";
import { db } from "@aiwa/db";
import { enqueueMail } from "@aiwa/mail";
import { z } from "zod";
import type { AssistantTool, AssistantToolContext } from "./types";

const inputSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(5).max(5000),
});

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function enqueueSupportMail(
  input: z.infer<typeof inputSchema>,
  ctx: AssistantToolContext,
  ticketRef: string,
) {
  const supportEmail =
    process.env.SUPPORT_EMAIL ||
    process.env.MAIL_ROUTINE_FROM_ADDRESS ||
    "support@aiwamediagroup.com";

  try {
    await enqueueMail({
      kind: "ROUTINE",
      template: "support-request",
      to: supportEmail,
      subject: `[${ticketRef}] ${input.subject}`,
      text: `Support escalation received from workspace ${ctx.organizationId} by user ${ctx.userId}:\n\n${input.body}`,
      html: `<h2>Support Escalation: ${escapeHtml(ticketRef)}</h2><p><strong>Subject:</strong> ${escapeHtml(input.subject)}</p><p><strong>Workspace:</strong> ${escapeHtml(ctx.organizationId)}</p><p><strong>User:</strong> ${escapeHtml(ctx.userId)}</p><hr/><p>${escapeHtml(input.body).replace(/\n/g, "<br/>")}</p>`,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      idempotencyKey: `support-${ctx.idempotencyKey}`,
    });
  } catch {
    // The durable SupportRequest remains authoritative and can be retried.
  }
}

export const escalateTool: AssistantTool<z.infer<typeof inputSchema>> = {
  description: "Escalate an explicitly requested issue to developer support",
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>, ctx: AssistantToolContext) {
    const ticketRef = `TICK-${new Date()
      .toISOString()
      .slice(0, 10)
      .replaceAll("-", "")}-${createHash("sha256")
      .update(ctx.idempotencyKey)
      .digest("hex")
      .slice(0, 6)
      .toUpperCase()}`;

    const existing = await db.supportRequest.findUnique({
      where: { idempotencyKey: ctx.idempotencyKey },
    });
    if (existing) {
      await enqueueSupportMail(input, ctx, existing.ticketRef);
      return {
        ticketRef: existing.ticketRef,
        subject: existing.subject,
        status: existing.status,
        message: `Support ticket ${existing.ticketRef} has been logged.`,
        created: false,
        replayed: true,
      };
    }

    const recentCount = await db.supportRequest.count({
      where: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recentCount >= 5) {
      throw new Error(
        "Support escalation limit reached. Please try again later.",
      );
    }

    const request = await db.supportRequest.upsert({
      where: { idempotencyKey: ctx.idempotencyKey },
      update: {},
      create: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        threadId: ctx.threadId,
        idempotencyKey: ctx.idempotencyKey,
        subject: input.subject,
        body: input.body,
        ticketRef,
        status: "OPEN",
      },
    });

    await enqueueSupportMail(input, ctx, request.ticketRef);

    await db.auditEvent
      .create({
        data: {
          actorUserId: ctx.userId,
          organizationId: ctx.organizationId,
          action: "assistant.support_escalated",
          targetType: "SupportRequest",
          targetId: request.id,
          metadata: { ticketRef: request.ticketRef },
        },
      })
      .catch(() => undefined);

    return {
      ticketRef: request.ticketRef,
      subject: request.subject,
      status: request.status,
      message: `Support ticket ${request.ticketRef} has been logged.`,
      created: true,
    };
  },
};
