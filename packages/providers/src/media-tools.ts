export type ProviderToolStatus =
  "submitted" | "processing" | "succeeded" | "failed" | "cancelled";

export type ProviderToolExecutionMode = "async" | "sync";

export type ProviderToolPricingMetric =
  "REQUEST" | "INPUT_SECOND" | "OUTPUT_SECOND";

export interface ProviderToolDescriptor {
  readonly id: string;
  readonly provider: "byteplus-mediakit";
  readonly displayName: string;
  readonly description: string;
  readonly category: "image" | "video";
  readonly executionMode: ProviderToolExecutionMode;
  readonly endpoint: string;
  readonly pricingMetric: ProviderToolPricingMetric;
  readonly capabilities: Readonly<Record<string, boolean | number | string>>;
}

export interface ProviderToolSubmission {
  readonly idempotencyKey: string;
  readonly toolId: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface ProviderToolTask {
  readonly providerTaskId?: string;
  readonly providerRequestId?: string;
  readonly status: ProviderToolStatus;
  readonly result?: Readonly<Record<string, unknown>>;
  readonly errorCode?: string;
}

export interface MediaToolProvider {
  readonly name: "byteplus-mediakit";
  listTools(): readonly ProviderToolDescriptor[];
  submit(input: ProviderToolSubmission): Promise<ProviderToolTask>;
  getTask(providerTaskId: string): Promise<ProviderToolTask>;
}
