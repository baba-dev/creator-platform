export type MediaKind = "image" | "video" | "voice" | "text";

export type ProviderJobStatus =
  "submitted" | "processing" | "succeeded" | "failed" | "cancelled";

export interface ProviderInlineOutput {
  readonly mediaType: string;
  readonly dataBase64: string;
}

export interface ProviderModelDescriptor {
  readonly id: string;
  readonly provider: "byteplus" | "nvidia" | "groq" | "gemini" | "cloudflare";
  readonly displayName: string;
  readonly description: string;
  readonly mediaKind: MediaKind | "reasoning";
  readonly capabilities: Readonly<Record<string, boolean | number | string>>;
}

export interface MediaSubmission {
  readonly idempotencyKey: string;
  readonly modelId: string;
  readonly mediaKind: MediaKind;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface ProviderJob {
  readonly providerRequestId: string;
  readonly status: ProviderJobStatus;
  readonly outputUrls?: readonly string[];
  readonly lastFrameUrl?: string;
  readonly inlineOutputs?: readonly ProviderInlineOutput[];
  readonly textOutput?: { readonly content: string };
  readonly rawUsage?: Readonly<Record<string, unknown>>;
  readonly errorCode?: string;
}

export interface MediaGenerationProvider {
  readonly name: "byteplus";
  listModels(): Promise<readonly ProviderModelDescriptor[]>;
  submit(input: MediaSubmission): Promise<ProviderJob>;
  getJob(providerRequestId: string): Promise<ProviderJob>;
  cancel(providerRequestId: string): Promise<void>;
}

export interface ReasoningRequest {
  readonly idempotencyKey: string;
  readonly modelId: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly responseSchemaName: string;
  readonly maxTokens?: number;
}

export interface ReasoningResult {
  readonly providerRequestId?: string;
  readonly content: unknown;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export interface ReasoningProvider {
  readonly name: "nvidia" | "groq" | "gemini" | "cloudflare";
  complete(input: ReasoningRequest): Promise<ReasoningResult>;
}

export interface TextChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface TextChatRequest {
  readonly idempotencyKey: string;
  readonly modelId: string;
  readonly messages: readonly TextChatMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly responseFormat?: "text" | "json_object";
}

export interface TextChatResult {
  readonly providerRequestId?: string;
  readonly content: string;
  readonly usage?: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
  };
}

export interface TextGenerationProvider {
  readonly name: ReasoningProvider["name"];
  chat(input: TextChatRequest): Promise<TextChatResult>;
}

export interface AudioTranscriptionSegment {
  readonly id: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export interface AudioTranscriptionRequest {
  readonly idempotencyKey: string;
  readonly modelId?: string;
  readonly audioBytes: Uint8Array;
  readonly filename: string;
  readonly mimeType?: string;
  readonly language?: string;
  readonly prompt?: string;
  readonly temperature?: number;
}

export interface AudioTranscriptionResult {
  readonly providerRequestId?: string;
  readonly text: string;
  readonly segments?: readonly AudioTranscriptionSegment[];
  readonly srt?: string;
  readonly vtt?: string;
  readonly durationSeconds?: number;
  readonly language?: string;
}

export class ProviderConfigurationError extends Error {
  override readonly name = "ProviderConfigurationError";
}

export type SubmissionStage =
  "dispatch" | "response_headers" | "response_body" | "parsing";

export class ProviderRequestError extends Error {
  override readonly name = "ProviderRequestError";

  constructor(
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions & {
      readonly code?: string;
      readonly stage?: SubmissionStage;
    },
  ) {
    super(message, options);
    this.code = options?.code;
    this.stage = options?.stage;
  }

  readonly code?: string;
  readonly stage?: SubmissionStage;
}

export * from "./studio-tasks";

export * from "./media-tools";

export * from "./runtime-readiness";
