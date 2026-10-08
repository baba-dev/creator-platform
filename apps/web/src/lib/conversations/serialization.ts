export interface SerializedGenerationJobAsset {
  id: string;
  mimeType: string;
  generationOutputIndex?: number | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  thumbnailUrl?: string;
  previewUrl?: string;
  url?: string;
}

export interface SerializedProviderModelSummary {
  id: string;
  provider: string;
  displayName: string;
  mediaKind: string;
}

export interface SerializedGenerationJobDTO {
  id: string;
  status: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  reservedCredits: string;
  chargedCredits: string;
  assets: SerializedGenerationJobAsset[];
  providerModel?: SerializedProviderModelSummary | null;
  availableActions: string[];
}

export interface SerializedChatMessageDTO {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface SerializedConversationDTO {
  id: string;
  organizationId: string;
  title: string;
  threadType: string;
  state: unknown;
  createdAt: string;
  updatedAt: string;
  messages: SerializedChatMessageDTO[];
  generationJobs: SerializedGenerationJobDTO[];
  creativeWorkflows?: unknown[];
}

export function serializeGenerationJob(job: {
  id: string;
  status: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: Date | string;
  reservedCredits?: bigint | number | string | null;
  chargedCredits?: bigint | number | string | null;
  actualProviderCostMicroUsd?: bigint | number | string | null;
  assets: Array<{
    id: string;
    mimeType: string;
    generationOutputIndex?: number | null;
    width?: number | null;
    height?: number | null;
    durationMs?: number | null;
  }>;
  providerModel?: {
    id: string;
    provider: string;
    displayName: string;
    mediaKind: string;
  } | null;
  availableActions?: readonly string[];
}): SerializedGenerationJobDTO {
  return {
    id: job.id,
    status: job.status,
    errorCode: job.errorCode ?? null,
    errorMessage: job.errorMessage ?? null,
    createdAt:
      job.createdAt instanceof Date
        ? job.createdAt.toISOString()
        : String(job.createdAt),
    reservedCredits: (job.reservedCredits ?? 0n).toString(),
    chargedCredits: (job.chargedCredits ?? 0n).toString(),
    assets: (job.assets ?? []).map((asset) => ({
      id: asset.id,
      mimeType: asset.mimeType,
      generationOutputIndex: asset.generationOutputIndex ?? null,
      width: asset.width ?? null,
      height: asset.height ?? null,
      durationMs: asset.durationMs ?? null,
      thumbnailUrl: `/api/assets/${asset.id}/variant/thumbnail`,
      previewUrl: `/api/assets/${asset.id}/variant/preview`,
      url: `/api/assets/${asset.id}`,
    })),
    availableActions: [...(job.availableActions ?? [])],
    providerModel: job.providerModel
      ? {
          id: job.providerModel.id,
          provider: job.providerModel.provider,
          displayName: job.providerModel.displayName,
          mediaKind: job.providerModel.mediaKind,
        }
      : null,
  };
}

export function serializeChatMessage(msg: {
  id: string;
  role: string;
  content: string;
  createdAt: Date | string;
  metadata?: unknown;
}): SerializedChatMessageDTO {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    createdAt:
      msg.createdAt instanceof Date
        ? msg.createdAt.toISOString()
        : String(msg.createdAt),
    metadata: (msg.metadata as Record<string, unknown> | null) ?? null,
  };
}

export function serializeConversationDTO(thread: {
  id: string;
  organizationId: string;
  title: string;
  threadType: string;
  state: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    createdAt: Date | string;
    metadata?: unknown;
  }>;
  generationJobs: Array<{
    id: string;
    status: string;
    errorCode?: string | null;
    errorMessage?: string | null;
    createdAt: Date | string;
    reservedCredits?: bigint | number | string | null;
    chargedCredits?: bigint | number | string | null;
    actualProviderCostMicroUsd?: bigint | number | string | null;
    assets: Array<{
      id: string;
      mimeType: string;
      generationOutputIndex?: number | null;
      width?: number | null;
      height?: number | null;
      durationMs?: number | null;
    }>;
    providerModel?: {
      id: string;
      provider: string;
      displayName: string;
      mediaKind: string;
    } | null;
    availableActions?: readonly string[];
  }>;
  creativeWorkflows?: unknown[];
}): SerializedConversationDTO {
  return {
    id: thread.id,
    organizationId: thread.organizationId,
    title: thread.title,
    threadType: thread.threadType,
    state: thread.state,
    createdAt:
      thread.createdAt instanceof Date
        ? thread.createdAt.toISOString()
        : String(thread.createdAt),
    updatedAt:
      thread.updatedAt instanceof Date
        ? thread.updatedAt.toISOString()
        : String(thread.updatedAt),
    messages: (thread.messages ?? []).map(serializeChatMessage),
    generationJobs: (thread.generationJobs ?? []).map(serializeGenerationJob),
    creativeWorkflows: thread.creativeWorkflows,
  };
}
