export type MediaKind = "image" | "video" | "voice";

export type ProviderJobStatus =
  "submitted" | "processing" | "succeeded" | "failed" | "cancelled";

export interface ProviderInlineOutput {
  readonly mediaType: string;
  readonly dataBase64: string;
}

export interface ProviderModelDescriptor {
  readonly id: string;
  readonly provider: "byteplus" | "nvidia";
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
  readonly inlineOutputs?: readonly ProviderInlineOutput[];
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
}

export interface ReasoningResult {
  readonly providerRequestId?: string;
  readonly content: unknown;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export interface ReasoningProvider {
  readonly name: "nvidia";
  complete(input: ReasoningRequest): Promise<ReasoningResult>;
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
      readonly stage?: SubmissionStage | string;
    },
  ) {
    super(message, options);
    this.code = options?.code;
    this.stage = options?.stage;
  }

  readonly code?: string;
  readonly stage?: SubmissionStage | string;
}
