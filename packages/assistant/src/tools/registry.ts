import { getBalanceTool } from "./get-balance";
import { getJobStatusTool } from "./get-job-status";
import { getAssetsTool } from "./get-assets";
import { explainErrorTool } from "./explain-error";
import { setReminderTool } from "./set-reminder";
import { navigateTool } from "./navigate";
import { escalateTool } from "./escalate";
import type { AssistantTool } from "./types";
import type { AssistantToolContext } from "./types";
import { requirePixelAccess } from "../access";
import { db } from "@aiwa/db";
import { createHash } from "node:crypto";
import { getStorageTool, getMembersTool, getModelsTool } from "./workspace";
import { pixelWorkflowSchema, preparePixelWorkflow } from "../workflows";
import { getPromptEnhancementModelTool, setPromptEnhancementModelTool } from "./prompt-enhancement-model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ASSISTANT_TOOLS: Record<string, AssistantTool<any, any>> = {
  "app.getBalance": getBalanceTool,
  "app.getJobStatus": getJobStatusTool,
  "app.getAssets": getAssetsTool,
  "app.explainError": explainErrorTool,
  "app.setReminder": setReminderTool,
  "app.navigate": navigateTool,
  "app.escalate": escalateTool,
  "app.getStorage": getStorageTool,
  "app.getMembers": getMembersTool,
  "app.getModels": getModelsTool,
  "app.getPromptEnhancementModel": getPromptEnhancementModelTool,
  "app.setPromptEnhancementModel": setPromptEnhancementModelTool,
  "app.prepareWorkflow": {
    description:
      "Prepare up to five immutable generation steps for user review; never submits or charges",
    inputSchema: pixelWorkflowSchema,
    execute: (input, ctx) => preparePixelWorkflow(ctx, input),
  },
};

export const TOOL_NAMES = Object.keys(ASSISTANT_TOOLS) as Array<
  keyof typeof ASSISTANT_TOOLS
>;

export async function executeAssistantTool(
  name: string,
  raw: unknown,
  ctx: AssistantToolContext,
) {
  const tool = ASSISTANT_TOOLS[name];
  if (!tool) throw new Error("Unsupported Pixel action.");
  const permission =
    name === "app.getAssets"
      ? "assets:read"
      : name === "app.getMembers"
        ? "members:read"
        : name === "app.prepareWorkflow"
          ? "generation:create"
          : "workspace:view";
  const membership = await requirePixelAccess(ctx, permission);
  if (
    name === "app.escalate" &&
    (!/^(?:please )?(?:i (?:need|want) to )?(?:open|create|send|submit|contact|escalate)\b/i.test(
      ctx.userMessage ?? "",
    ) ||
      !/\b(support|ticket)\b/i.test(ctx.userMessage ?? ""))
  )
    throw new Error(
      "Ask explicitly to contact support before creating a ticket.",
    );
  if (
    name === "app.setReminder" &&
    !/^(?:please )?(?:remind me|set (?:a |an )?reminder)\b/i.test(
      ctx.userMessage ?? "",
    )
  )
    throw new Error("Ask explicitly for a reminder before scheduling one.");
  if (name === "app.setPromptEnhancementModel" &&
    !/\b(?:set|use|change|switch|reset|restore)\b[\s\S]*\b(?:prompt enhance|prompt enhancement|enhance prompt)\b/i.test(ctx.userMessage ?? "")) {
    throw new Error("Ask explicitly to change the Prompt Enhance model.");
  }
  const input = tool.inputSchema.parse(raw);
  const output = await tool.execute(input, {
    ...ctx,
    idempotencyKey: createHash("sha256")
      .update(
        `${ctx.organizationId}:${ctx.userId}:${ctx.threadId}:${ctx.idempotencyKey}:${name}`,
      )
      .digest("hex"),
    organizationSlug: membership.organization.slug,
  });
  await db.auditEvent.create({
    data: {
      actorUserId: ctx.userId,
      organizationId: ctx.organizationId,
      action: `pixel.tool.${name}`,
      targetType: "ChatThread",
      targetId: ctx.threadId,
      requestId: ctx.idempotencyKey,
      metadata: { tool: name },
    },
  });
  return { tool: name, input, output };
}
