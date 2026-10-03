import { getBalanceTool } from "./get-balance";
import { getJobStatusTool } from "./get-job-status";
import { getAssetsTool } from "./get-assets";
import { explainErrorTool } from "./explain-error";
import { setReminderTool } from "./set-reminder";
import { navigateTool } from "./navigate";
import { escalateTool } from "./escalate";
import type { AssistantTool } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ASSISTANT_TOOLS: Record<string, AssistantTool<any, any>> = {
  "app.getBalance": getBalanceTool,
  "app.getJobStatus": getJobStatusTool,
  "app.getAssets": getAssetsTool,
  "app.explainError": explainErrorTool,
  "app.setReminder": setReminderTool,
  "app.navigate": navigateTool,
  "app.escalate": escalateTool,
};

export const TOOL_NAMES = Object.keys(ASSISTANT_TOOLS) as Array<
  keyof typeof ASSISTANT_TOOLS
>;
