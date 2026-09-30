export const derivativeKinds = [
  "THUMBNAIL",
  "PREVIEW",
  "POSTER",
  "STORYBOARD",
  "WAVEFORM",
] as const;
export type DerivativeKind = (typeof derivativeKinds)[number];
export type PreviewState =
  | "READY"
  | "PENDING"
  | "PROCESSING"
  | "RETRY_WAIT"
  | "FAILED"
  | "REVIEW"
  | "UNAVAILABLE";
export type PreviewStatus = {
  kind: DerivativeKind;
  state: PreviewState;
  taskId: string | null;
  cycle: number;
  attempts: number;
  maxAttempts: number;
  retryAt: string | null;
  canRetry: boolean;
};
export function expectedDerivatives(
  mediaKind: string,
): readonly DerivativeKind[] {
  return mediaKind === "IMAGE"
    ? ["THUMBNAIL", "PREVIEW"]
    : mediaKind === "VIDEO"
      ? ["POSTER", "STORYBOARD"]
      : mediaKind === "AUDIO"
        ? ["WAVEFORM"]
        : [];
}
export function assetPreviewStatuses(
  asset: {
    mediaKind: string;
    status: string;
    storageProvider: string;
    variants: { kind: string }[];
  },
  tasks: {
    id: string;
    kind: string;
    status: string;
    cycle: number;
    attemptCount: number;
    maxAttempts: number;
    nextAttemptAt: Date | null;
  }[],
): PreviewStatus[] {
  return expectedDerivatives(asset.mediaKind).map((kind) => {
    const task = tasks.find((row) => row.kind === kind);
    const published = asset.variants.some((variant) => variant.kind === kind);
    const state: PreviewState = published
      ? "READY"
      : asset.status !== "READY" || asset.storageProvider !== "LOCAL"
        ? "UNAVAILABLE"
        : task &&
            [
              "PENDING",
              "PROCESSING",
              "RETRY_WAIT",
              "FAILED",
              "REVIEW",
            ].includes(task.status)
          ? (task.status as PreviewState)
          : task?.status === "SUCCEEDED"
            ? "UNAVAILABLE"
            : "PENDING";
    return {
      kind,
      state,
      taskId: task?.id ?? null,
      cycle: task?.cycle ?? 1,
      attempts: task?.attemptCount ?? 0,
      maxAttempts: task?.maxAttempts ?? 3,
      retryAt: task?.nextAttemptAt?.toISOString() ?? null,
      canRetry:
        state === "FAILED" &&
        Boolean(task) &&
        task!.cycle < 3 &&
        asset.status === "READY" &&
        asset.storageProvider === "LOCAL",
    };
  });
}
export function previewMessage(state: PreviewState): string {
  return {
    READY: "Preview ready",
    PENDING: "Preview queued",
    PROCESSING: "Preparing preview",
    RETRY_WAIT: "Preview will retry shortly",
    FAILED: "Preview could not be prepared",
    REVIEW: "Preview needs support review",
    UNAVAILABLE: "Preview unavailable",
  }[state];
}
