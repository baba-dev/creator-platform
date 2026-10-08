import {
  WORKSPACE_TOOLS,
  type WorkspaceToolDefinition,
} from "@/lib/workspace-tools";

/**
 * Explicit expert-task requests are routed to existing specialist workbenches.
 * This registry is a navigational contract, not an alternate job dispatcher.
 */
const ROUTES: ReadonlyArray<{ intent: RegExp; toolId: string }> = [
  {
    intent: /\\b(?:transcri(?:be|ption)|subtitles?|captions?|srt|vtt)\\b/i,
    toolId: "transcription",
  },
  {
    intent: /\\b(?:seed audio|dola audio|audio director|voice matching)\\b/i,
    toolId: "audio-generation",
  },
  {
    intent: /\\b(?:omnihuman|spokesperson|talking avatar|presenter)\\b/i,
    toolId: "spokesperson",
  },
  {
    intent: /\\b(?:voice cast(?:ing)?|audition voices?|pick a voice)\\b/i,
    toolId: "voice-casting",
  },
  {
    intent:
      /\\b(?:video edit(?:ing|or)?|trim video|split video|add subtitles to video)\\b/i,
    toolId: "video-editor",
  },
  {
    intent:
      /\\b(?:crop image|image editor|precision image|inpaint|remove background|image compression)\\b/i,
    toolId: "precision-image",
  },
  {
    intent: /\\b(?:scriptwriter|write a script|screenplay)\\b/i,
    toolId: "scriptwriter",
  },
  {
    intent: /\\b(?:creative director|storyboard|campaign plan)\\b/i,
    toolId: "creative-director",
  },
  {
    intent: /\\b(?:brand assistant|brand strategy|story planning)\\b/i,
    toolId: "brand-story",
  },
  {
    intent: /\\b(?:character chat|talk to a character|persona chat)\\b/i,
    toolId: "character-chat",
  },
];

export function resolveCreativeToolHandoff(
  text: string,
): WorkspaceToolDefinition | null {
  // Don't interpret a visual prompt that merely mentions an actor or a script
  // as an instruction to leave the generation workflow.
  const explicitTask =
    /^(?:please\\s+)?(?:open|take me to|go to|launch|start|use|help me (?:with|to|write)|i want to|i need to|transcribe|write|create subtitles|edit video|trim video|crop image|remove background)\\b/i.test(
      text.trim(),
    );
  if (!explicitTask) return null;
  const found = ROUTES.find(({ intent }) => intent.test(text));
  return found
    ? (WORKSPACE_TOOLS.find((tool) => tool.id === found.toolId) ?? null)
    : null;
}

export function describeCreativeHandoff(tool: WorkspaceToolDefinition): string {
  return `For this workflow, open ${tool.title}. ${tool.description}. The specialized controls will validate inputs, capabilities, and costs before any generation.`;
}
