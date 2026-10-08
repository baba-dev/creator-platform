import { z } from "zod";
import type { OrchestrationTask } from "../contracts/index";

/**
 * 9 discrete user intents recognized by Orchestration v3.
 */
export const UserIntentSchema = z.enum([
  "ANSWER",
  "EXPLORE",
  "CLARIFY",
  "STATE_CHANGE",
  "SINGLE_ACTION",
  "MULTI_STEP",
  "TOOL_ACTION",
  "NAVIGATE",
  "REVIEW",
]);
export type UserIntent = z.infer<typeof UserIntentSchema>;

export interface IntentClassificationResult {
  intent: UserIntent;
  confidence: number;
  reasoning?: string;
  extractedTask?: OrchestrationTask;
  suggestedAction?: Record<string, unknown>;
}

/**
 * Stage A fast deterministic classifier for queries, questions, and immediate commands.
 */
export function classifyIntentDeterministically(
  text: string,
): IntentClassificationResult {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Read-only questions and answers
  if (
    /^(which model|what model|how much|how many credits|what is my (current )?balance|explain|why did)/i.test(
      lower,
    )
  ) {
    return {
      intent: "ANSWER",
      confidence: 0.95,
      reasoning: "Matched read-only inquiry pattern",
    };
  }

  // Navigation handoff requests
  if (
    /^(open|navigate to|go to|take me to)\s+(the\s+)?(video studio|image studio|studio|dashboard|settings|members)/i.test(
      lower,
    )
  ) {
    return {
      intent: "NAVIGATE",
      confidence: 0.95,
      reasoning: "Matched navigation intent pattern",
    };
  }

  // State changes
  if (
    /^(set ratio to|change ratio to|aspect ratio|make it 16:9|make it 9:16|switch to 1:1)/i.test(
      lower,
    )
  ) {
    return {
      intent: "STATE_CHANGE",
      confidence: 0.9,
      reasoning: "Matched state modification phrase",
    };
  }

  // Tool actions
  if (/^(transcribe|speech to text|extract audio subtitles)/i.test(lower)) {
    return {
      intent: "TOOL_ACTION",
      confidence: 0.9,
      extractedTask: "transcription",
      reasoning: "Specialist transcription action",
    };
  }

  // Multi-step complex campaigns
  if (
    /(and animate|and voiceover|then add subtitles|complete campaign|concept, animate and narration|full luxury perfume)/i.test(
      lower,
    ) ||
    (lower.includes("generate") &&
      lower.includes("and") &&
      (lower.includes("video") || lower.includes("voice")))
  ) {
    return {
      intent: "MULTI_STEP",
      confidence: 0.85,
      reasoning: "Multi-step pipeline detected across media modalities",
    };
  }

  // Creative exploration
  if (
    /^(suggest|brainstorm|give me concepts|give me ideas|recommend ideas)/i.test(
      lower,
    )
  ) {
    return {
      intent: "EXPLORE",
      confidence: 0.9,
      reasoning: "Creative consultation or brainstorming request",
    };
  }

  // Single action generation default
  if (
    /^(generate|create|render|draw|make an image|make a video)/i.test(lower)
  ) {
    return {
      intent: "SINGLE_ACTION",
      confidence: 0.85,
      extractedTask: lower.includes("video")
        ? "video-generation"
        : "image-generation",
      reasoning: "Direct single generation request",
    };
  }

  // Default to CLARIFY rather than unknown or unexpected paid job
  return {
    intent: "CLARIFY",
    confidence: 0.5,
    reasoning: "Ambiguous or unrecognized intent, requesting user confirmation",
  };
}

export * from "./compiler";
