"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CancelJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const key = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function cancel() {
    if (
      busy ||
      !window.confirm(
        "Cancel this queued job and release its reserved credits?",
      )
    )
      return;
    key.current ??= crypto.randomUUID();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/generation-jobs/${encodeURIComponent(jobId)}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idempotencyKey: key.current }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Cancellation failed.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cancellation failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={() => void cancel()}
      >
        {busy ? "Cancelling…" : "Cancel queued job"}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
