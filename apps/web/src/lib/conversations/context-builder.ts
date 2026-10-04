import type {
  ActiveOutputItem,
  ConversationEffectiveSettings,
  ConversationState,
  CreativeModality,
} from "./types";

export interface ContextBuilderInput {
  conversationId: string;
  title: string;
  state?: ConversationState | null;
  latestJob?: {
    id: string;
    status: string;
    providerModel?: {
      id: string;
      provider: string;
      displayName: string;
      mediaKind: string;
    } | null;
    requestPayload?: unknown;
    assets: Array<{
      id: string;
      mimeType: string;
      generationOutputIndex?: number | null;
      width?: number | null;
      height?: number | null;
      durationMs?: number | null;
    }>;
  } | null;
  recentMessages?: Array<{
    role: string;
    content: string;
  }>;
  clientSelectedAssetId?: string | null;
}

export interface ConversationPlannerContext {
  conversationId: string;
  title: string;
  activeModality: CreativeModality;
  currentModelId?: string | null;
  currentProvider?: string | null;
  currentSettings: ConversationEffectiveSettings;
  activeOutputGroup: ActiveOutputItem[];
  selectedAssetId?: string | null;
  compatibleActions: string[];
  recentTurns: Array<{ role: "user" | "assistant"; content: string }>;
}

export function buildPlannerContext(
  input: ContextBuilderInput,
): ConversationPlannerContext {
  const existingState = input.state;
  const latestJob = input.latestJob;

  // Determine active modality from latest job or existing state
  let activeModality: CreativeModality = "IMAGE";
  if (latestJob?.providerModel?.mediaKind) {
    const kind = latestJob.providerModel.mediaKind;
    if (kind === "VIDEO") activeModality = "VIDEO";
    else if (kind === "VOICE") activeModality = "VOICE";
    else activeModality = "IMAGE";
  } else if (existingState?.activeModality) {
    activeModality = existingState.activeModality;
  }

  // Extract settings from latest job's request payload or state
  const rawPayload =
    (latestJob?.requestPayload as Record<string, unknown>) ?? {};
  const currentSettings: ConversationEffectiveSettings = {
    aspectRatio:
      (rawPayload.aspectRatio as string) ??
      existingState?.settings?.aspectRatio ??
      "1:1",
    resolution:
      (rawPayload.resolution as string) ??
      existingState?.settings?.resolution ??
      (activeModality === "VIDEO" ? "720p" : "2K"),
    outputCount:
      (rawPayload.outputCount as number) ??
      existingState?.settings?.outputCount ??
      1,
    durationSeconds:
      (rawPayload.durationSeconds as number) ??
      existingState?.settings?.durationSeconds ??
      5,
    voiceKey:
      (rawPayload.voiceKey as string) ??
      existingState?.settings?.voiceKey ??
      "jasper",
    speechRate:
      (rawPayload.speechRate as number) ??
      existingState?.settings?.speechRate ??
      1.0,
  };

  // Build active output group from latest job assets if available, or state
  const activeOutputGroup: ActiveOutputItem[] = [];
  if (latestJob?.assets && latestJob.assets.length > 0) {
    latestJob.assets.forEach((asset, idx) => {
      activeOutputGroup.push({
        index: (asset.generationOutputIndex ?? idx) + 1,
        assetId: asset.id,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        durationMs: asset.durationMs,
      });
    });
  } else if (
    existingState?.activeOutputs &&
    existingState.activeOutputs.length > 0
  ) {
    activeOutputGroup.push(...existingState.activeOutputs);
  }

  // Selected asset ID: client UI selection takes priority, then state, then single output
  let selectedAssetId: string | null = null;
  if (input.clientSelectedAssetId) {
    // If client supplied an asset, verify it belongs to outputs or state
    selectedAssetId = input.clientSelectedAssetId;
  } else if (existingState?.activeAssetId) {
    selectedAssetId = existingState.activeAssetId;
  } else if (activeOutputGroup.length === 1) {
    selectedAssetId = activeOutputGroup[0]?.assetId ?? null;
  }

  // Determine compatible actions for this modality and state
  const compatibleActions: string[] = [
    "switch_model",
    "enhance_prompt",
    "retry_generation",
  ];

  if (activeModality === "IMAGE") {
    compatibleActions.push(
      "generate_image",
      "create_variations",
      "change_aspect_ratio",
      "change_resolution",
      "edit_image",
      "generate_video",
      "use_first_frame",
    );
    if (activeOutputGroup.length > 0) {
      compatibleActions.push("select_asset");
    }
  } else if (activeModality === "VIDEO") {
    compatibleActions.push(
      "generate_video",
      "extend_video",
      "change_resolution",
    );
    if (activeOutputGroup.length > 0) {
      compatibleActions.push("select_asset");
    }
  } else if (activeModality === "VOICE") {
    compatibleActions.push(
      "generate_speech",
      "change_voice",
      "change_speaking_rate",
    );
  }

  // Trim recent messages (last 4 turns = up to 8 messages)
  const allMessages = input.recentMessages ?? [];
  const validMessages = allMessages.filter(
    (m): m is { role: "user" | "assistant"; content: string } =>
      m.role === "user" || m.role === "assistant",
  );
  const recentTurns = validMessages.slice(-8);

  return {
    conversationId: input.conversationId,
    title: input.title,
    activeModality,
    currentModelId:
      latestJob?.providerModel?.id ?? existingState?.currentModelId ?? null,
    currentProvider:
      latestJob?.providerModel?.provider ??
      existingState?.currentProvider ??
      null,
    currentSettings,
    activeOutputGroup,
    selectedAssetId,
    compatibleActions,
    recentTurns,
  };
}
