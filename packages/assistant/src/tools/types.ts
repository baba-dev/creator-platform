import type { ZodType } from "zod";

export interface AssistantToolContext {
  userId: string;
  organizationId: string;
  organizationSlug: string;
  threadId: string;
  idempotencyKey: string;
}

export interface AssistantTool<I = unknown, O = unknown> {
  description: string;
  inputSchema: ZodType<I>;
  execute(input: I, ctx: AssistantToolContext): Promise<O>;
}

export interface ToolCallResult {
  tool: string;
  input: unknown;
  output: unknown;
  error?: string;
}
