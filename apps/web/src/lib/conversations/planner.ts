import type { ConversationPlannerContext } from "./context-builder";
import {
  parseOutputIndex,
  resolveAssetReference,
  type ReferenceResolutionResult,
} from "./reference-resolver";
import type { ConversationAction, TurnPlan } from "./action-protocol";
import { ACTION_PROTOCOL_VERSION } from "./action-protocol";
import { resolveCreativeToolHandoff } from "./tool-handoff";
import { classifyIntentDeterministically } from "@aiwa/orchestration";

/**
 * Normalizes aspect ratio synonyms into canonical values.
 */
export function normalizeAspectRatioPhrase(
  text: string,
): "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3" | "21:9" | null {
  const lower = text.toLowerCase();
  if (
    lower.includes("9:16") ||
    lower.includes("9 by 16") ||
    lower.includes("vertical") ||
    lower.includes("portrait") ||
    lower.includes("reels") ||
    lower.includes("tiktok") ||
    lower.includes("story")
  ) {
    return "9:16";
  }
  if (
    lower.includes("16:9") ||
    lower.includes("16 by 9") ||
    lower.includes("horizontal") ||
    lower.includes("landscape") ||
    lower.includes("widescreen")
  ) {
    return "16:9";
  }
  if (
    lower.includes("1:1") ||
    lower.includes("1 by 1") ||
    lower.includes("square") ||
    lower.includes("instagram post")
  ) {
    return "1:1";
  }
  if (lower.includes("4:3") || lower.includes("4 by 3")) {
    return "4:3";
  }
  if (lower.includes("3:4") || lower.includes("3 by 4")) {
    return "3:4";
  }
  if (lower.includes("3:2") || lower.includes("3 by 2")) {
    return "3:2";
  }
  if (lower.includes("2:3") || lower.includes("2 by 3")) {
    return "2:3";
  }
  if (
    lower.includes("21:9") ||
    lower.includes("21 by 9") ||
    lower.includes("ultrawide")
  ) {
    return "21:9";
  }
  return null;
}

/**
 * Plans actions for a user's conversational turn.
 */
export async function planConversationTurn(params: {
  userMessage: string;
  organizationId: string;
  context: ConversationPlannerContext;
  explicitAssetId?: string | null;
}): Promise<TurnPlan> {
  const { userMessage, organizationId, context, explicitAssetId } = params;
  const text = userMessage.trim();
  const lower = text.toLowerCase();
  const actions: ConversationAction[] = [];

  const handoff = resolveCreativeToolHandoff(text);
  if (handoff) {
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions: [
        {
          type: "open_tool",
          toolId: handoff.id as
            | "transcription"
            | "audio-generation"
            | "spokesperson"
            | "voice-casting"
            | "video-editor"
            | "precision-image"
            | "scriptwriter"
            | "creative-director"
            | "brand-story"
            | "character-chat",
        },
      ],
      reasoning: "Specialist feature handoff, no generation dispatched.",
    };
  }

  const intentClassification = classifyIntentDeterministically(text);
  if (
    intentClassification.intent === "ANSWER" ||
    intentClassification.intent === "EXPLORE"
  ) {
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions: [{ type: "answer_question", question: text }],
      reasoning:
        "A question or consultation request is not a media generation authorization.",
    };
  }

  // Multi-step requests require a reviewed workflow, not an accidental
  // single media generation. The v3 native executor is feature-gated until
  // the complete DAG approval and recovery path is proven.
  if (intentClassification.intent === "MULTI_STEP") {
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions: [{type: "answer_question", question: text}],
      reasoning: "Complex creative work requires a reviewed multi-step plan before any paid admission.",
    };
  }

  // Questions, consultation and capability discovery are NEVER implicit paid
  // media requests. Interpret them as a read-only conversational turn.
  const isNonGenerationQuestion =
    /\?$/.test(text) ||
    /^(?:what|why|which|who|where|when|how|explain|describe|help me|tell me|can you tell|could you explain|i want to know|let's plan|lets plan|plan a|suggest|recommend|compare)\b/i.test(
      text,
    );
  if (isNonGenerationQuestion) {
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions: [{ type: "answer_question", question: text }],
      reasoning:
        "A question or planning request is not a media generation authorization.",
    };
  }

  // Recognize explicit settings before the asset-reference resolver. A setting
  // patch can use the selected output without asking a misleading question.
  const resolutionMatch = /\b(480p|720p|1080p|1k|1\.5k|2k|3k|4k)\b/i.exec(text);
  const resolution = resolutionMatch?.[1]?.toUpperCase().replace(/P$/, "p") as
    "480p" | "720p" | "1080p" | "1K" | "1.5K" | "2K" | "3K" | "4K" | undefined;
  const isResolutionIntent =
    Boolean(resolution) &&
    /^(?:make|change|set|switch|render|convert|upscale|increase|decrease|use|output|export)\b|\b(?:resolution|quality)\b/i.test(
      text,
    );
  const voiceMatch =
    /^(?:change|switch|set|use)\s+(?:the\s+)?voice\s+(?:to\s+)?([a-z][a-z0-9_-]{1,60})[.!]?$/i.exec(
      text,
    );
  if (context.activeModality === "VOICE" && voiceMatch) {
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions: [
        { type: "change_voice", voiceKey: voiceMatch[1]!.toLowerCase() },
      ],
      reasoning: "Explicit speech voice change.",
    };
  }
  if (
    /\b(?:enhance|improve|optimi[sz]e)\s+(?:my |the )?prompt\b/i.test(text) ||
    /\blast frame\b/i.test(text)
  ) {
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions: [{ type: "answer_question", question: text }],
      reasoning:
        "Advanced Studio workflow requires an explicit handoff, not an invented billable action.",
    };
  }
  const ratio = normalizeAspectRatioPhrase(text);
  const isAspectRatioIntent =
    ratio !== null &&
    (lower.includes("make it") ||
      lower.includes("change") ||
      lower.includes("ratio") ||
      lower.includes("aspect") ||
      /^(?:9:16|16:9|1:1|4:3|3:4|3:2|2:3|21:9|vertical|portrait|horizontal|landscape|square|widescreen)\.?$/i.test(
        text,
      ));

  if (isResolutionIntent || isAspectRatioIntent) {
    const changes: ConversationAction[] = [];
    const referencedOutput = parseOutputIndex(text);
    if (referencedOutput !== null) {
      changes.push({
        type: "select_asset",
        target: { kind: "output_index", index: referencedOutput },
      });
    }
    if (isAspectRatioIntent && ratio) {
      changes.push({ type: "change_aspect_ratio", aspectRatio: ratio });
    }
    if (isResolutionIntent && resolution) {
      changes.push({ type: "change_resolution", resolution });
    }
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions: changes,
      reasoning: "Explicit creative settings adjustment.",
    };
  }

  // =========================================================
  // 1. Check for Ambiguity / Clarification from Reference Resolver
  // =========================================================
  // If user says "the second image" or "animate that" without a clear single asset
  const isFreshCreationIntent =
    /^(?:please\s+)?(?:create|generate|draw|make)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|illustration|photo)\s+(?:of|showing|with)\b/i.test(
      text,
    );
  // First-turn video/voice requests have no media reference to resolve.
  // Do not let the word "video" or "this" trigger a false asset clarification.
  const isFreshVideoIntent =
    /^(?:please\s+)?(?:create|generate|make|produce|render)\s+(?:me\s+)?(?:an?\s+)?(?:[\w-]+\s+){0,3}(?:video|clip|animation)\b/i.test(
      text,
    ) &&
    !/\b(?:from this|use this|first frame|selected image|previous image)\b/i.test(
      text,
    );
  const isFreshSpeechIntent =
    /^(?:please\s+)?(?:narrate|read aloud|speak|say|generate speech|create (?:a |an )?voiceover|make (?:a |an )?voiceover)\b/i.test(
      text,
    );
  const hasReferenceWord =
    !isAspectRatioIntent &&
    !isFreshCreationIntent &&
    !isFreshVideoIntent &&
    !isFreshSpeechIntent &&
    /\b(?:image|picture|output|this|that|it|animate|variation|variations|first\s+frame|last\s+frame|video|extend)\b/i.test(
      lower,
    );

  let resolvedRef: ReferenceResolutionResult | null = null;
  if (hasReferenceWord || explicitAssetId) {
    resolvedRef = await resolveAssetReference({
      text,
      organizationId,
      context,
      explicitAssetId,
    });

    if (!resolvedRef.resolved && resolvedRef.clarification) {
      return {
        version: ACTION_PROTOCOL_VERSION,
        actions: [
          {
            type: "clarify",
            question: resolvedRef.clarification.question,
            options: resolvedRef.clarification.options.map((opt) => ({
              label: opt.label,
              value: opt.value,
              assetId: opt.assetId,
              description: opt.description,
            })),
          },
        ],
        reasoning: "Ambiguous asset reference requires clarification.",
      };
    }
  }

  // Trusted UI output clicks are state-only. Never turn "Select asset" into
  // a paid generation just because a concrete selectedAssetId is present.
  if (lower === "select asset" && explicitAssetId && resolvedRef?.resolved) {
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions: [
        {
          type: "select_asset",
          target: { kind: "asset_id", assetId: resolvedRef.assetId! },
        },
      ],
      reasoning: "State-only explicit UI asset selection.",
    };
  }

  // =========================================================
  // 2. Multi-Action: Selection + Animation ("Use second image and animate it")
  // =========================================================
  const outputIdx = parseOutputIndex(text);
  const isAnimate =
    lower.includes("animate") ||
    lower.includes("make a video") ||
    lower.includes("turn into video") ||
    lower.includes("generate video");

  if (outputIdx !== null && isAnimate) {
    actions.push({
      type: "select_asset",
      target: { kind: "output_index", index: outputIdx },
    });
    actions.push({
      type: "generate_video",
      firstFrameAssetId: resolvedRef?.assetId,
      outputFormat: "mp4",
      workflow: "FRAME_TO_VIDEO",
    });
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions,
      reasoning: "Select output index and generate video.",
    };
  }

  // A numbered selection can be composed with a settings change. Keep both
  // actions tied to the same turn instead of returning after selection.
  if (outputIdx !== null && isAspectRatioIntent && ratio !== null) {
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions: [
        {
          type: "select_asset",
          target: { kind: "output_index", index: outputIdx },
        },
        { type: "change_aspect_ratio", aspectRatio: ratio },
      ],
      reasoning: `Select output #${outputIdx} and change aspect ratio to ${ratio}.`,
    };
  }

  // =========================================================
  // 3. State-Only Asset Selection ("Use the second image", "Select image 3")
  // =========================================================
  if (
    outputIdx !== null &&
    (lower.startsWith("use") ||
      lower.startsWith("select") ||
      lower.startsWith("pick") ||
      lower.startsWith("choose") ||
      lower === `image ${outputIdx}` ||
      lower === `image #${outputIdx}`) &&
    !isAnimate &&
    !lower.includes("variation") &&
    !lower.includes("aspect ratio") &&
    !lower.includes("first frame") &&
    !lower.includes("video")
  ) {
    actions.push({
      type: "select_asset",
      target: { kind: "output_index", index: outputIdx },
    });
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions,
      reasoning: `State-only asset selection: output #${outputIdx}.`,
    };
  }

  // =========================================================
  // 4. Aspect Ratio Change ("Make it 9:16", "Change to vertical")
  // =========================================================
  if (isAspectRatioIntent && ratio !== null) {
    actions.push({
      type: "change_aspect_ratio",
      aspectRatio: ratio,
    });
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions,
      reasoning: `Change aspect ratio to ${ratio}.`,
    };
  }

  // =========================================================
  // 5. Focused Image Edit ("Enhance with cinematic lighting", etc.)
  // =========================================================
  // Follow-up creative direction should operate on the focused image when the
  // user asks to enhance/edit it. Without this branch the generic fallback
  // treats the instruction as a brand-new text-to-image prompt and loses the
  // visual continuity the conversation UI promises.
  const imageEditSource =
    resolvedRef?.assetId ?? context.selectedAssetId ?? undefined;
  const isFocusedImageEdit =
    context.activeModality === "IMAGE" &&
    Boolean(imageEditSource) &&
    (lower.startsWith("enhance with ") ||
      lower.startsWith("edit this ") ||
      lower.startsWith("retouch this ") ||
      lower.startsWith("adjust the ") ||
      /^make\s+(?:the|this|that|its)\s+\S+/.test(lower) ||
      /^(?:change|replace|remove|add)\s+(?:the|this|that|its|a)\s+/.test(
        lower,
      ) ||
      lower.startsWith("change the lighting") ||
      lower.startsWith("make the lighting"));

  if (isFocusedImageEdit) {
    actions.push({
      type: "edit_image",
      prompt: text,
      sourceAssetId: imageEditSource,
    });
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions,
      reasoning: "Apply the requested edit to the focused image.",
    };
  }

  // =========================================================
  // 6. Alternate Model ("Try another model", "Use a different model")
  // =========================================================
  if (
    lower.includes("try another model") ||
    lower.includes("different model") ||
    lower.includes("switch model") ||
    lower.includes("other model")
  ) {
    actions.push({
      type: "switch_model",
      excludeCurrentModel: true,
      targetMediaKind: context.activeModality,
    });
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions,
      reasoning: "Switch to compatible alternate model.",
    };
  }

  // =========================================================
  // 7. Variations ("Give me four variations", "Create 4 variations")
  // =========================================================
  if (lower.includes("variation") || lower.includes("variations")) {
    const countMatch = /(\d+)\s+variations?/i.exec(lower);
    let count = 4;
    if (countMatch?.[1]) {
      count = Number.parseInt(countMatch[1], 10);
    } else if (lower.includes("two") || lower.includes("2")) {
      count = 2;
    } else if (lower.includes("three") || lower.includes("3")) {
      count = 3;
    } else if (lower.includes("four") || lower.includes("4")) {
      count = 4;
    }

    actions.push({
      type: "create_variations",
      sourceAssetId:
        resolvedRef?.assetId ?? context.selectedAssetId ?? undefined,
      outputCount: Math.min(Math.max(1, count), 8),
    });
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions,
      reasoning: `Create ${count} variations.`,
    };
  }

  // =========================================================
  // 8. Video Animation ("Animate this", "Animate it")
  // =========================================================
  if (isAnimate) {
    actions.push({
      type: "generate_video",
      firstFrameAssetId:
        resolvedRef?.assetId ?? context.selectedAssetId ?? undefined,
      outputFormat: "mp4",
      workflow: "FRAME_TO_VIDEO",
    });
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions,
      reasoning: "Image-to-video animation from active/selected asset.",
    };
  }

  // =========================================================
  // 9. Video extension ("Extend this video by 5 seconds")
  // =========================================================
  if (/\bextend\b/i.test(lower) && /\b(?:video|this|it)\b/i.test(lower)) {
    const durationMatch = /\b(\d{1,2})\s*(?:s|sec|secs|second|seconds)\b/i.exec(
      lower,
    );
    const durationSeconds = durationMatch?.[1]
      ? Math.min(30, Math.max(1, Number.parseInt(durationMatch[1], 10)))
      : 5;
    actions.push({
      type: "extend_video",
      sourceAssetId:
        resolvedRef?.assetId ?? context.selectedAssetId ?? undefined,
      direction: lower.includes("before") ? "BEFORE" : "AFTER",
      durationSeconds,
    });
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions,
      reasoning:
        "Extend the selected video using the canonical EXTEND workflow.",
    };
  }

  // =========================================================
  // 10. First / Last Frame Mapping
  // =========================================================
  if (lower.includes("first frame")) {
    actions.push({
      type: "use_first_frame",
      assetId: resolvedRef?.assetId ?? context.selectedAssetId ?? undefined,
      target: { kind: "selected_asset" },
    });
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions,
      reasoning: "Map image asset as video first frame.",
    };
  }

  // =========================================================
  // 11. Speech Speed / Voice Adjustments
  // =========================================================
  if (
    lower.includes("voice slower") ||
    lower.includes("speak slower") ||
    lower.includes("make it slower") ||
    lower === "slower" ||
    lower.includes("slower voice")
  ) {
    actions.push({
      type: "change_speaking_rate",
      speechRate: 0.8,
    });
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions,
      reasoning: "Adjust speech rate to 0.8.",
    };
  }
  if (
    lower.includes("voice faster") ||
    lower.includes("speak faster") ||
    lower.includes("make it faster") ||
    lower === "faster" ||
    lower.includes("faster voice")
  ) {
    actions.push({
      type: "change_speaking_rate",
      speechRate: 1.2,
    });
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions,
      reasoning: "Adjust speech rate to 1.2.",
    };
  }

  // =========================================================
  // 12. Retry
  // =========================================================
  if (
    lower === "retry" ||
    lower === "try again" ||
    lower === "regenerate" ||
    lower === "retry generation"
  ) {
    actions.push({
      type: "retry_generation",
      targetGenerationId: context.activeModality ? undefined : undefined,
    });
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions,
      reasoning: "Retry latest generation.",
    };
  }

  // Fresh explicit media requests must not inherit the previous generation's
  // modality or a selected source. A new video/voice intent is not an image edit.
  if (isFreshVideoIntent) {
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions: [{ type: "generate_video", prompt: text, workflow: "GENERATE" }],
      reasoning: "Explicit new text-to-video request.",
    };
  }
  if (isFreshSpeechIntent) {
    return {
      version: ACTION_PROTOCOL_VERSION,
      actions: [{ type: "generate_speech", text }],
      reasoning: "Explicit new voice generation request.",
    };
  }

  // =========================================================
  // 13. Default Fallback: Generate Media with User Prompt
  // =========================================================
  if (context.activeModality === "VIDEO") {
    actions.push({
      type: "generate_video",
      prompt: text,
      outputFormat: "mp4",
    });
  } else if (context.activeModality === "VOICE") {
    actions.push({
      type: "generate_speech",
      text,
    });
  } else {
    actions.push({
      type: "generate_image",
      prompt: text,
      aspectRatio: context.currentSettings.aspectRatio as
        | "1:1"
        | "16:9"
        | "9:16"
        | "4:3"
        | "3:4"
        | "3:2"
        | "2:3"
        | "21:9"
        | undefined,
      resolution: context.currentSettings.resolution as
        "1K" | "1.5K" | "2K" | "3K" | "4K" | undefined,
      outputCount: context.currentSettings.outputCount ?? 1,
    });
  }

  return {
    version: ACTION_PROTOCOL_VERSION,
    actions,
    reasoning: "Standard creative generation from conversational prompt.",
  };
}
