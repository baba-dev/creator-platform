export type GenerationKind = "IMAGE" | "VIDEO" | "VOICE";
export type GenerationExperienceStage =
  | "QUEUED"
  | "STARTING"
  | "CREATING"
  | "READY"
  | "DELAYED"
  | "FAILED"
  | "CANCELLED"
  | "REVIEW";

export type EtaConfidence = "LOW" | "MEDIUM" | "HIGH";

export type GenerationExperience = {
  stage: GenerationExperienceStage;
  stageIndex: number;
  title: string;
  description: string;
  etaSeconds: number | null;
  etaConfidence: EtaConfidence | null;
  delayed: boolean;
  terminal: boolean;
  canBackground: boolean;
};

const fallbackTotalMs: Record<GenerationKind, number> = {
  IMAGE: 45_000,
  VIDEO: 150_000,
  VOICE: 35_000,
};

export function percentile(values: number[], quantile: number): number | null {
  const clean = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const index = Math.min(
    clean.length - 1,
    Math.max(0, Math.ceil(clean.length * quantile) - 1),
  );
  return clean[index] ?? null;
}

export function deriveGenerationExperience({
  status,
  kind,
  queuedAt,
  errorMessage,
  historicalDurationsMs = [],
  nowMs = Date.now(),
}: {
  status: string;
  kind: GenerationKind;
  queuedAt: Date | string | null;
  errorMessage?: string | null;
  historicalDurationsMs?: number[];
  nowMs?: number;
}): GenerationExperience {
  if (status === "SUCCEEDED") {
    return {
      stage: "READY",
      stageIndex: 3,
      title: "Your creation is ready",
      description: "The finished media has been saved to your asset library.",
      etaSeconds: null,
      etaConfidence: null,
      delayed: false,
      terminal: true,
      canBackground: false,
    };
  }
  if (status === "FAILED") {
    return {
      stage: "FAILED",
      stageIndex: 2,
      title: "We couldn't finish this creation",
      description:
        errorMessage ??
        "The generation failed safely. Check the job details before retrying.",
      etaSeconds: null,
      etaConfidence: null,
      delayed: false,
      terminal: true,
      canBackground: false,
    };
  }
  if (status === "CANCELLED") {
    return {
      stage: "CANCELLED",
      stageIndex: 0,
      title: "Generation cancelled",
      description: "The queued request was cancelled and will not be processed.",
      etaSeconds: null,
      etaConfidence: null,
      delayed: false,
      terminal: true,
      canBackground: false,
    };
  }
  if (status === "MANUAL_REVIEW") {
    return {
      stage: "REVIEW",
      stageIndex: 2,
      title: "This generation needs attention",
      description:
        errorMessage ??
        "We could not safely confirm the provider result. Open the job for details.",
      etaSeconds: null,
      etaConfidence: null,
      delayed: false,
      terminal: true,
      canBackground: false,
    };
  }

  const queuedMs = queuedAt ? new Date(queuedAt).getTime() : nowMs;
  const elapsedMs = Math.max(0, nowMs - queuedMs);
  const learnedTotalMs = percentile(historicalDurationsMs, 0.75);
  const expectedTotalMs = Math.max(
    10_000,
    learnedTotalMs ?? fallbackTotalMs[kind],
  );
  const confidence: EtaConfidence =
    historicalDurationsMs.length >= 20
      ? "HIGH"
      : historicalDurationsMs.length >= 5
        ? "MEDIUM"
        : "LOW";
  const delayThresholdMs = Math.max(
    expectedTotalMs * 1.35,
    expectedTotalMs + 20_000,
  );
  const delayed = elapsedMs > delayThresholdMs;

  if (delayed) {
    return {
      stage: "DELAYED",
      stageIndex: status === "QUEUED" ? 0 : 2,
      title: "Taking a little longer than usual",
      description:
        "Your generation is still active. You do not need to restart it; we will keep checking automatically.",
      etaSeconds: null,
      etaConfidence: confidence,
      delayed: true,
      terminal: false,
      canBackground: true,
    };
  }

  const remainingSeconds = Math.max(
    1,
    Math.ceil((expectedTotalMs - elapsedMs) / 1000),
  );

  if (status === "QUEUED") {
    return {
      stage: "QUEUED",
      stageIndex: 0,
      title: "Your creation is in the queue",
      description: "The request is safely queued and waiting to start.",
      etaSeconds: remainingSeconds,
      etaConfidence: confidence,
      delayed: false,
      terminal: false,
      canBackground: true,
    };
  }

  if (status === "SUBMITTED") {
    return {
      stage: "STARTING",
      stageIndex: 1,
      title: "Starting your generation",
      description: "Everything has been sent to the generation engine.",
      etaSeconds: remainingSeconds,
      etaConfidence: confidence,
      delayed: false,
      terminal: false,
      canBackground: true,
    };
  }

  const description =
    kind === "VIDEO"
      ? "Your scene is being rendered. We will save it to your library when it is ready."
      : kind === "VOICE"
        ? "Your narration is being synthesized and prepared for your library."
        : "Your image is being finished and saved to your library.";

  return {
    stage: "CREATING",
    stageIndex: 2,
    title: kind === "VIDEO" ? "Rendering your video" : "Creating your media",
    description,
    etaSeconds: remainingSeconds,
    etaConfidence: confidence,
    delayed: false,
    terminal: false,
    canBackground: true,
  };
}

export function formatEta(
  etaSeconds: number | null,
  confidence: EtaConfidence | null,
): string | null {
  if (etaSeconds === null) return null;
  if (confidence === "LOW") {
    if (etaSeconds <= 60) return "Usually ready within a minute";
    const minutes = Math.max(1, Math.ceil(etaSeconds / 60));
    return `Usually ready in about ${minutes} min`;
  }
  if (etaSeconds < 60) {
    const rounded = Math.max(5, Math.ceil(etaSeconds / 5) * 5);
    return `About ${rounded} sec remaining`;
  }
  const minutes = Math.max(1, Math.ceil(etaSeconds / 60));
  return `About ${minutes} min remaining`;
}
