import { z } from "zod";
import { creativeLocaleIntentSchema } from "@aiwa/generation/locale";
import { searchKnowledgebase } from "./kb/search";
import { executeAssistantTool } from "./tools/registry";
import type { AssistantToolContext, ToolCallResult } from "./tools/types";

export const pixelWorkspaceSchema = z
  .object({
    page: z
      .enum([
        "home",
        "image",
        "video",
        "speech",
        "assets",
        "history",
        "storage",
        "members",
        "chat",
        "projects",
        "templates",
        "director",
        "scripts",
        "brand-assistants",
        "story-planning",
        "spokesperson",
        "conversations",
      ])
      .optional(),
    selectedAssetIds: z.array(z.string().min(1).max(100)).max(4).default([]),
    conversationId: z.string().min(1).max(100).optional(),
    localeIntent: creativeLocaleIntentSchema.optional(),
  })
  .strict();

export function toolResultContent(result: ToolCallResult): string {
  if (result.error)
    return "I couldn't complete that action. Your account data was not inferred. Please retry or open the relevant page.";
  const output = result.output as Record<string, unknown>;
  if (result.tool === "app.getBalance")
    return `Your workspace balance is ${String(output.balanceDisplay)}.`;
  if (result.tool === "app.getJobStatus")
    return "Here are your recent jobs, with the recorded reservation and final charge. A delayed or manual-review job should not be resubmitted.";
  if (result.tool === "app.getAssets")
    return "Here are the matching accessible assets. Use an asset's Image or Video button to continue working with it.";
  if (result.tool === "app.getStorage")
    return `Storage accounting shows ${String(output.usedBytes)} bytes used and ${String(output.reservedBytes)} bytes reserved. Connection status is shown below.`;
  if (result.tool === "app.getMembers")
    return "Here are the members you have permission to view. Open Members to manage access.";
  if (result.tool === "app.getModels")
    return "Here is the current enabled model catalog. Review capabilities and a fresh quote before generation.";
  if (result.tool === "app.prepareWorkflow")
    return `Prepared “${String(output.title)}”. Review each step and its quote before approving. Nothing has been submitted yet.`;
  if (result.tool === "app.navigate")
    return "Open the requested page using the button below.";
  if (result.tool === "app.explainError")
    return `${String(output.explanation)} ${String(output.remediation)}`;
  if (result.tool === "app.setReminder") return "Your reminder is scheduled.";
  if (result.tool === "app.escalate")
    return `Support request ${String(output.ticketRef)} has been recorded.`;
  return "The requested information is shown below.";
}

export async function localPixelReply(
  message: string,
  ctx: AssistantToolContext,
) {
  const text = message
    .toLowerCase()
    .trim()
    .replace(/[?.!]+$/, "");
  let call: { tool: string; input: unknown } | undefined;
  if (
    /^(what is my (current )?(credit )?balance|my balance|show (me )?my balance)$/.test(
      text,
    )
  )
    call = { tool: "app.getBalance", input: {} };
  if (
    /^(show (me )?(my )?(recent )?(generation )?jobs|recent jobs|why did my generation job fail or time out)$/.test(
      text,
    )
  )
    call = { tool: "app.getJobStatus", input: {} };
  if (
    /^(show (me )?(my )?recent assets( in the library)?|my assets)$/.test(text)
  )
    call = { tool: "app.getAssets", input: {} };
  if (/^(show (me )?(my )?storage( usage| status)?|storage usage)$/.test(text))
    call = { tool: "app.getStorage", input: {} };
  if (/^(show (me )?(our |my )?(team )?members|team members)$/.test(text))
    call = { tool: "app.getMembers", input: {} };
  if (/^(what models are available|show (me )?(available )?models)$/.test(text))
    call = { tool: "app.getModels", input: {} };
  const destinations: Record<string, string> = {
    image: "IMAGE_STUDIO",
    video: "VIDEO_STUDIO",
    speech: "SPEECH",
    assets: "ASSETS",
    history: "HISTORY",
    storage: "STORAGE",
    members: "MEMBERS",
    chat: "CHAT",
    projects: "PROJECTS",
    templates: "TEMPLATES",
  };
  const navigation =
    /^(?:open|go to|take me to) (image|video|speech|assets|history|storage|members|chat|projects|templates)(?: studio| page)?$/.exec(
      text,
    );
  if (navigation?.[1])
    call = {
      tool: "app.navigate",
      input: { destination: destinations[navigation[1]] },
    };
  if (call) {
    const result = await executeAssistantTool(call.tool, call.input, ctx);
    return { content: toolResultContent(result), toolResults: [result] };
  }
  if (
    /^(how (do|can|to)|help (me )?(with|connect)|what is|explain)\b/.test(text)
  ) {
    const chunks = searchKnowledgebase(text, 2);
    if (chunks.length)
      return {
        content: chunks.map((c) => `**${c.title}**\n${c.content}`).join("\n\n"),
        toolResults: [],
        knowledge: chunks.map((c) => ({
          id: c.id,
          version: c.version,
          title: c.title,
        })),
      };
  }
  return null;
}
