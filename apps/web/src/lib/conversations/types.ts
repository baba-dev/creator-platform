export type CreativeModality = "IMAGE" | "VIDEO" | "VOICE";

export interface ConversationEffectiveSettings {
  aspectRatio?: string;
  resolution?: string;
  outputCount?: number;
  durationSeconds?: number;
  voiceKey?: string;
  speechRate?: number;
  format?: "mp3" | "mp4" | "mov";
}

export interface ActiveOutputItem {
  index: number; // 1-based index: 1, 2, 3, 4
  assetId: string;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}

export interface ConversationPendingOperation {
  originalPrompt: string;
  createdAt: string;
}

export interface ConversationState {
  activeAssetId?: string | null;
  activeGenerationId?: string | null;
  activeOutputGroupId?: string | null;
  activeModality: CreativeModality;
  currentModelId?: string | null;
  currentProvider?: string | null;
  settings: ConversationEffectiveSettings;
  activeOutputs: ActiveOutputItem[];
  pendingOperation?: ConversationPendingOperation | null;
  revision?: number;
}

export interface ClarificationOption {
  label: string;
  value: string;
  assetId?: string;
  thumbnailUrl?: string;
  description?: string;
}

export interface ClarificationRequest {
  question: string;
  context?: string;
  options: ClarificationOption[];
}

export interface TurnActionRecord {
  id: string;
  type: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
  payload: Record<string, unknown>;
  generationJobId?: string;
  assetIds?: string[];
  error?: string;
}

export interface ConversationTurnMetadata {
  turnStatus: "COMPLETED" | "FAILED" | "REQUIRES_CLARIFICATION" | "EXECUTING";
  actions: TurnActionRecord[];
  clarification?: ClarificationRequest;
  error?: {
    code?: string;
    message: string;
    retryable?: boolean;
  };
  generationJobId?: string;
  assetIds?: string[];
  selectedAssetId?: string;
  effectiveSpec?: Record<string, unknown>;
}

export interface ConversationSummary {
  id: string;
  organizationId: string;
  title: string;
  threadType: "CREATIVE" | "CHARACTER";
  createdAt: string;
  updatedAt: string;
  state?: ConversationState | null;
}

export interface ConversationTurnOutputGroup {
  id: string;
  generationJobId: string;
  providerModelName: string;
  status: string;
  items: ActiveOutputItem[];
  createdAt: string;
}
