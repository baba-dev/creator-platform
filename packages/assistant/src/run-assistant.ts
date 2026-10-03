import { db, type Prisma } from "@aiwa/db";
import { searchKnowledgebase } from "./kb/search";
import { ASSISTANT_TOOLS } from "./tools/registry";
import type { ToolCallResult } from "./tools/types";
import { getAssistantSettings, type AssistantConfig } from "./settings";
import { PIXEL_SYSTEM_PROMPT } from "./system-prompt";

export interface AssistantRunInput {
  organizationId: string;
  organizationSlug: string;
  userId: string;
  threadId: string;
  userMessage: string;
  idempotencyKey: string;
}

export interface AssistantRunResult {
  userMessageId: string;
  assistantMessageId: string;
  content: string;
  toolResults: ToolCallResult[];
  navigationRoute?: string;
  reminderId?: string;
  ticketRef?: string;
  jobId?: string;
  chargedCredits: number;
}

export interface AssistantProviderResult {
  content: string;
  providerRequestId?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

function parseToolCall(
  content: string,
): { tool: string; input: unknown } | null {
  const match = /```tool-call\s*\n?([\s\S]*?)\n?```/m.exec(content);
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1].trim()) as {
      tool?: string;
      input?: unknown;
    };
    return typeof parsed.tool === "string" && parsed.input !== undefined
      ? { tool: parsed.tool, input: parsed.input }
      : null;
  } catch {
    return null;
  }
}

function stripToolCall(content: string): string {
  return content.replace(/```tool-call[\s\S]*?```/gm, "").trim();
}

function systemInstructions(
  settings: AssistantConfig,
  userMessage: string,
): string {
  const kbChunks = searchKnowledgebase(userMessage, 3);
  const kbContext =
    kbChunks.length > 0
      ? `\n\nVerified Platform Knowledge:\n${kbChunks
          .map((chunk) => `- **${chunk.title}**: ${chunk.content}`)
          .join("\n")}`
      : "";
  const admin = settings.systemPromptOverride?.trim()
    ? `\n\nAdministrator instructions:\n${settings.systemPromptOverride.trim()}`
    : "";
  return PIXEL_SYSTEM_PROMPT + admin + kbContext;
}

export async function buildAssistantMessages(
  input: AssistantRunInput,
  settings?: AssistantConfig,
) {
  const resolvedSettings = settings ?? (await getAssistantSettings());
  const historyRaw = await db.chatMessage.findMany({
    where: {
      threadId: input.threadId,
      OR: [
        { clientRequestId: null },
        { clientRequestId: { not: input.idempotencyKey } },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 16,
    select: { role: true, content: true },
  });

  return [
    {
      role: "system" as const,
      content: systemInstructions(resolvedSettings, input.userMessage),
    },
    ...historyRaw
      .reverse()
      .filter(
        (message): message is { role: "user" | "assistant"; content: string } =>
          message.role === "user" || message.role === "assistant",
      ),
    { role: "user" as const, content: input.userMessage },
  ];
}

export async function completeAssistantResponse(
  input: AssistantRunInput & {
    rawContent: string;
    modelRecordId: string;
    chargedCredits: number;
    jobId?: string;
    providerRequestId?: string;
    usage?: AssistantProviderResult["usage"];
  },
): Promise<AssistantRunResult> {
  const ctx = {
    userId: input.userId,
    organizationId: input.organizationId,
    organizationSlug: input.organizationSlug,
    threadId: input.threadId,
    idempotencyKey: input.idempotencyKey,
  };

  const toolResults: ToolCallResult[] = [];
  let finalContent = input.rawContent;
  let navigationRoute: string | undefined;
  let reminderId: string | undefined;
  let ticketRef: string | undefined;

  const toolCall = parseToolCall(input.rawContent);
  if (toolCall) {
    const tool = ASSISTANT_TOOLS[toolCall.tool];
    if (tool) {
      try {
        const parsedInput = tool.inputSchema.parse(toolCall.input);
        const output = await tool.execute(parsedInput, ctx);
        toolResults.push({ tool: toolCall.tool, input: parsedInput, output });
        const outputObj = output as Record<string, unknown>;
        if (
          toolCall.tool === "app.navigate" &&
          typeof outputObj.route === "string"
        )
          navigationRoute = outputObj.route;
        if (
          toolCall.tool === "app.setReminder" &&
          typeof outputObj.reminderId === "string"
        )
          reminderId = outputObj.reminderId;
        if (
          toolCall.tool === "app.escalate" &&
          typeof outputObj.ticketRef === "string"
        )
          ticketRef = outputObj.ticketRef;
        finalContent = stripToolCall(input.rawContent) || "Done.";
      } catch (error) {
        toolResults.push({
          tool: toolCall.tool,
          input: toolCall.input,
          output: null,
          error:
            error instanceof Error ? error.message : "Tool execution failed",
        });
        finalContent = stripToolCall(input.rawContent);
      }
    }
  }

  const metadata = {
    modelRecordId: input.modelRecordId,
    chargedCredits: input.chargedCredits,
    jobId: input.jobId,
    providerRequestId: input.providerRequestId,
    usage: input.usage,
    toolResults: toolResults.length ? toolResults : undefined,
    navigationRoute,
    reminderId,
    ticketRef,
  } as unknown as Prisma.InputJsonValue;

  const userMsg = await db.chatMessage.upsert({
    where: {
      threadId_clientRequestId_role: {
        threadId: input.threadId,
        clientRequestId: input.idempotencyKey,
        role: "user",
      },
    },
    update: {},
    create: {
      threadId: input.threadId,
      clientRequestId: input.idempotencyKey,
      role: "user",
      content: input.userMessage,
      metadata: input.jobId ? { generationJobId: input.jobId } : undefined,
    },
  });

  const assistantMsg = await db.chatMessage.upsert({
    where: {
      threadId_clientRequestId_role: {
        threadId: input.threadId,
        clientRequestId: input.idempotencyKey,
        role: "assistant",
      },
    },
    update: { content: finalContent, metadata },
    create: {
      threadId: input.threadId,
      clientRequestId: input.idempotencyKey,
      role: "assistant",
      content: finalContent,
      tokensUsed: input.usage?.totalTokens,
      metadata,
    },
  });

  await db.chatThread.update({
    where: { id: input.threadId },
    data: { updatedAt: new Date() },
  });

  return {
    userMessageId: userMsg.id,
    assistantMessageId: assistantMsg.id,
    content: finalContent,
    toolResults,
    navigationRoute,
    reminderId,
    ticketRef,
    jobId: input.jobId,
    chargedCredits: input.chargedCredits,
  };
}

