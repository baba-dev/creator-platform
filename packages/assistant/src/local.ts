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
        "media-tools",
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
    return (
      "I found " +
      String(output.total ?? 0) +
      " currently available models matching your request. The live cards show provider, tasks, capabilities and published base-unit credits; request a fresh quote for the actual job."
    );
  if (result.tool === "app.getPromptEnhancementModel") {
    const selected = output.selected as {
      name: string;
      provider: string;
    } | null;
    const models = output.models as Array<{
      id: string;
      name: string;
      provider: string;
    }>;
    return selected
      ? `Your Prompt Enhance model is ${selected.name} (${selected.provider}). Available choices: ${models.map((model) => `${model.name} (${model.provider}, ID: ${model.id})`).join("; ")}.`
      : "No Prompt Enhance models are currently available. You can check model activation in the admin catalog.";
  }
  if (result.tool === "app.setPromptEnhancementModel") {
    const selected = output.selected as {
      name: string;
      provider: string;
    } | null;
    if (output.ambiguous) {
      const candidates = output.candidates as Array<{
        id: string;
        name: string;
        provider: string;
      }>;
      return `More than one Prompt Enhance model matches. Specify one of: ${candidates.map((model) => `${model.name} (${model.provider}, ID: ${model.id})`).join("; ")}.`;
    }
    if (output.unavailable)
      return "No eligible Prompt Enhance model matches that choice. Ask me to list available Prompt Enhance models.";
    return selected
      ? `Prompt Enhance now uses ${selected.name} (${selected.provider}) in this workspace.`
      : "The default Prompt Enhance model preference was restored. No eligible model is currently configured.";
  }
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
  const modelPage =
    /^(?:show|list|next) (?:(image|video|voice|text) )?(?:available )?models page (\d{1,3})(?: for (.+))?$/.exec(
      text,
    );
  const modelDetail = /^show model details for (.+)$/.exec(text);
  const modelHelp =
    /^(?:what is|tell me about|explain|details (?:on|for)|what can) (.+)$/.exec(
      text,
    );
  const isModelFamily =
    /\b(seedream|seedance|seed.?tts|seed.?audio|omnihuman|nemotron|llama|gemini|groq|cloudflare|dola|flux|whisper|gpt.?oss|qwen|model)\b/i;
  const modelList =
    /^(?:(?:what|which) (?:image |video |voice |text |speech |chat )?models (?:are available|can i use)|(?:show|list) (?:me )?(?:all |available |the )?(?:image |video |voice |text |speech |chat )?models|show more models)$/.test(
      text,
    );
  const modelKind = /\b(image|video|voice|speech|text|chat) models\b/.exec(
    text,
  )?.[1];
  const selectedKind = modelPage?.[1] ?? modelKind;
  const kind =
    selectedKind === "image"
      ? "IMAGE"
      : selectedKind === "video"
        ? "VIDEO"
        : ["speech", "voice"].includes(selectedKind ?? "")
          ? "VOICE"
          : ["text", "chat"].includes(selectedKind ?? "")
            ? "TEXT"
            : undefined;
  if (
    modelList ||
    modelPage ||
    modelDetail ||
    (modelHelp && isModelFamily.test(modelHelp[1] ?? ""))
  ) {
    const detail = modelDetail?.[1]?.trim();
    const search = modelHelp?.[1]
      ?.replace(/^(?:the )?/, "")
      .replace(/ (?:model|models)$/, "")
      .trim();
    call = {
      tool: "app.getModels",
      input: {
        ...(kind ? { kind } : {}),
        ...(modelPage ? { page: Number(modelPage[2]) } : {}),
        ...(detail ? { modelId: detail } : {}),
        ...(modelPage?.[3] ? { query: modelPage[3] } : {}),
        ...(!detail && !modelList && !modelPage && search
          ? { query: search }
          : {}),
      },
    };
  }
  const requestedEnhancementModel =
    /^(?:please )?(?:set|use|change|switch)(?: my| the)? (?:prompt enhance|prompt enhancement|enhance prompt)(?: model)? (?:to|using) (.+)$/.exec(
      text,
    );
  if (requestedEnhancementModel?.[1]) {
    call = {
      tool: "app.setPromptEnhancementModel",
      input: { model: requestedEnhancementModel[1] },
    };
  } else if (
    /^(?:what(?:'s| is)|show|list)(?: me)?(?: my| the| available)? (?:prompt enhance|prompt enhancement|enhance prompt)(?: model| models| model settings)?$/.test(
      text,
    )
  ) {
    call = { tool: "app.getPromptEnhancementModel", input: {} };
  }

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
    mediakit: "MEDIAKIT",
  };
  const navigation =
    /^(?:open|go to|take me to) (image|video|speech|assets|history|storage|members|chat|projects|templates|mediakit)(?: studio| page| tools)?$/.exec(
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
