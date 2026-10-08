import type {
  OrchestrationTask,
  StepOutput,
  StepQuote,
} from "../contracts/index";

export interface ToolAdapterContext {
  organizationId: string;
  userId: string;
  idempotencyKey: string;
}

export interface ToolAdapterEstimateInput {
  task: OrchestrationTask;
  modelId?: string;
  payload: Record<string, unknown>;
  sourceAssetIds: readonly string[];
}

export interface ToolAdapterAdmitInput {
  task: OrchestrationTask;
  modelId: string;
  quote: StepQuote;
  payload: Record<string, unknown>;
  sourceAssetIds: readonly string[];
}

export interface ToolAdapterExecutionStatus {
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "MANUAL_REVIEW";
  jobId?: string;
  error?: string;
  outputs?: StepOutput[];
}

/**
 * Common standard adapter contract for all native tools and model studios:
 * validate -> estimate/quote -> admit -> getStatus -> collectOutputs -> requestCancellation
 */
export interface OrchestrationToolAdapter {
  readonly supportedTasks: readonly OrchestrationTask[];

  validate(
    input: ToolAdapterEstimateInput,
  ): Promise<{ valid: boolean; error?: string }>;

  estimate(
    ctx: ToolAdapterContext,
    input: ToolAdapterEstimateInput,
  ): Promise<StepQuote>;

  admit(
    ctx: ToolAdapterContext,
    input: ToolAdapterAdmitInput,
  ): Promise<{ jobId: string; status: "QUEUED" | "RUNNING" }>;

  getStatus(
    ctx: ToolAdapterContext,
    jobId: string,
  ): Promise<ToolAdapterExecutionStatus>;

  collectOutputs(ctx: ToolAdapterContext, jobId: string): Promise<StepOutput[]>;

  requestCancellation?(
    ctx: ToolAdapterContext,
    jobId: string,
  ): Promise<{ cancelled: boolean; message?: string }>;
}

export * from "./generation-adapter";
export * from "./specialist-mediakit-adapter";
