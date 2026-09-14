export const generationJobStatuses = [
  "DRAFT",
  "QUOTED",
  "CREDIT_RESERVED",
  "QUEUED",
  "SUBMITTED",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "MANUAL_REVIEW",
] as const;

export type GenerationJobStatus = (typeof generationJobStatuses)[number];

const terminalStatuses = new Set<GenerationJobStatus>([
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);

const transitions: Readonly<
  Record<GenerationJobStatus, readonly GenerationJobStatus[]>
> = {
  DRAFT: ["QUOTED", "CANCELLED"],
  QUOTED: ["CREDIT_RESERVED", "CANCELLED"],
  CREDIT_RESERVED: ["QUEUED", "CANCELLED", "MANUAL_REVIEW"],
  QUEUED: ["SUBMITTED", "FAILED", "CANCELLED", "MANUAL_REVIEW"],
  SUBMITTED: ["PROCESSING", "SUCCEEDED", "FAILED", "MANUAL_REVIEW"],
  PROCESSING: ["SUCCEEDED", "FAILED", "MANUAL_REVIEW"],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
  MANUAL_REVIEW: ["QUEUED", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"],
};

export function canTransitionGenerationJob(
  from: GenerationJobStatus,
  to: GenerationJobStatus,
): boolean {
  return transitions[from].includes(to);
}

export function isTerminalGenerationJobStatus(
  status: GenerationJobStatus,
): boolean {
  return terminalStatuses.has(status);
}

export function assertGenerationJobTransition(
  from: GenerationJobStatus,
  to: GenerationJobStatus,
): void {
  if (!canTransitionGenerationJob(from, to)) {
    throw new Error(`Invalid generation job transition: ${from} -> ${to}`);
  }
}

export function requireNonNegativeInteger(
  value: bigint,
  fieldName: string,
): bigint {
  if (value < 0n) {
    throw new RangeError(`${fieldName} must be a non-negative integer`);
  }

  return value;
}
