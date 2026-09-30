"use client";
import { useState } from "react";
import { previewMessage, type PreviewStatus } from "@aiwa/assets/media-status";
import { Button } from "@/components/ui/button";
export function PreviewStatusPanel({
  assetId,
  organizationId,
  previews,
  canManage,
  onRetried,
}: {
  assetId: string;
  organizationId: string;
  previews: PreviewStatus[];
  canManage: boolean;
  onRetried: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function retry(preview: PreviewStatus) {
    setBusy(preview.kind);
    setError(null);
    try {
      const response = await fetch(`/api/assets/${assetId}/previews/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          taskId: preview.taskId,
          cycle: preview.cycle,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Unable to retry preview.");
      onRetried();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to retry preview.",
      );
    } finally {
      setBusy(null);
    }
  }
  if (!previews.length) return null;
  return (
    <section
      aria-label="Preview processing"
      className="mt-4 rounded-2xl border border-border bg-muted/30 p-4"
    >
      <h3 className="text-sm font-semibold">Preview processing</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Your original stays available to download. Preview retries do not charge
        generation credits.
      </p>
      <ul className="mt-3 space-y-3">
        {previews.map((preview) => (
          <li
            key={preview.kind}
            className="flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <div>
              <p className="font-semibold">
                {preview.kind[0] + preview.kind.slice(1).toLowerCase()}
              </p>
              <p
                className={
                  preview.state === "FAILED" || preview.state === "REVIEW"
                    ? "text-warning"
                    : "text-muted-foreground"
                }
              >
                {previewMessage(preview.state)}
              </p>
              {preview.state === "RETRY_WAIT" && preview.retryAt ? (
                <p className="mt-1 text-muted-foreground">
                  Next attempt after{" "}
                  {new Date(preview.retryAt).toLocaleTimeString()}
                </p>
              ) : null}
              {preview.state === "FAILED" && !preview.canRetry ? (
                <p className="mt-1 text-muted-foreground">
                  Contact support for further recovery.
                </p>
              ) : null}
            </div>
            {canManage && preview.canRetry ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void retry(preview)}
              >
                {busy === preview.kind ? "Queueing…" : "Retry preview"}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
