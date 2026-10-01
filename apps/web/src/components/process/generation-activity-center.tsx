"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MascotScene } from "@/components/process/mascot-scene";
import {
  GenerationProgressDialog,
  type GenerationProgressJob,
} from "@/components/process/generation-progress-dialog";
import {
  GENERATION_ACTIVITY_EVENT,
  generationActivityStorageKey,
} from "@/lib/generation-activity";
import type { GenerationExperience } from "@/lib/generation-experience";

type Snapshot = {
  job: GenerationProgressJob;
  experience: GenerationExperience;
};

export function GenerationActivityCenter({
  organizationId,
  organizationSlug,
}: {
  organizationId: string;
  organizationSlug: string;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [connectionIssue, setConnectionIssue] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const cancelKey = useRef<string | null>(null);

  const storageKey = generationActivityStorageKey(organizationId);

  const clearActivity = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    setJobId(null);
    setSnapshot(null);
    setDialogOpen(false);
    setConnectionIssue(null);
    setCancelError(null);
    cancelKey.current = null;
  }, [storageKey]);

  const refresh = useCallback(
    async (activeJobId: string) => {
      try {
        const response = await fetch(
          `/api/generation-jobs/${encodeURIComponent(
            activeJobId,
          )}?organizationId=${encodeURIComponent(organizationId)}`,
          { cache: "no-store" },
        );
        const body = (await response.json()) as {
          job?: GenerationProgressJob;
          experience?: GenerationExperience;
          error?: string;
        };
        if (!response.ok || !body.job || !body.experience) {
          throw new Error(body.error ?? "Generation status is unavailable.");
        }
        setSnapshot({ job: body.job, experience: body.experience });
        setConnectionIssue(null);
      } catch {
        setConnectionIssue(
          "Status updates are temporarily unavailable. Your generation may still be running; we will keep checking without resubmitting it.",
        );
      }
    },
    [organizationId],
  );

  useEffect(() => {
    const restored = sessionStorage.getItem(storageKey);
    if (restored) {
      setJobId(restored);
      void refresh(restored);
    }

    const onStarted = (event: Event) => {
      const detail = (
        event as CustomEvent<{ organizationId?: string; jobId?: string }>
      ).detail;
      if (
        detail?.organizationId !== organizationId ||
        typeof detail.jobId !== "string"
      ) {
        return;
      }
      cancelKey.current = null;
      setJobId(detail.jobId);
      setSnapshot(null);
      setConnectionIssue(null);
      setCancelError(null);
      setDialogOpen(true);
      void refresh(detail.jobId);
    };

    window.addEventListener(GENERATION_ACTIVITY_EVENT, onStarted);
    return () =>
      window.removeEventListener(GENERATION_ACTIVITY_EVENT, onStarted);
  }, [organizationId, refresh, storageKey]);

  useEffect(() => {
    if (!jobId) return;
    const timer = window.setInterval(() => {
      void refresh(jobId);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [jobId, refresh]);

  async function cancel() {
    if (!snapshot?.job.canCancel || cancelling) return;
    cancelKey.current ??= crypto.randomUUID();
    setCancelling(true);
    setCancelError(null);
    try {
      const response = await fetch(
        `/api/generation-jobs/${encodeURIComponent(snapshot.job.id)}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idempotencyKey: cancelKey.current }),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Cancellation failed.");
      await refresh(snapshot.job.id);
    } catch (cause) {
      setCancelError(
        cause instanceof Error ? cause.message : "Cancellation failed.",
      );
    } finally {
      setCancelling(false);
    }
  }

  if (!jobId) return null;

  if (!snapshot) {
    return dialogOpen ? (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-5 right-5 z-[70] flex max-w-[360px] items-center gap-3 rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-lg"
      >
        <MascotScene
          kind={connectionIssue ? "confused" : "running"}
          size="compact"
          className="h-14 w-20"
        />
        <div>
          <p className="font-display text-sm font-semibold">
            {connectionIssue ? "Checking your generation" : "Loading status"}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {connectionIssue ??
              "Connecting to the durable generation job you just created."}
          </p>
        </div>
      </div>
    ) : null;
  }

  return (
    <>
      <GenerationProgressDialog
        open={dialogOpen}
        organizationSlug={organizationSlug}
        job={snapshot.job}
        experience={snapshot.experience}
        cancelling={cancelling}
        cancelError={cancelError}
        connectionIssue={connectionIssue}
        onBackground={() => setDialogOpen(false)}
        onClose={clearActivity}
        onCancel={() => void cancel()}
      />

      {!dialogOpen ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-[70] flex w-[min(390px,calc(100vw-2rem))] items-center gap-3 rounded-2xl border border-border bg-popover p-3 text-left text-popover-foreground shadow-lg"
        >
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
          >
            <MascotScene
              kind={
                snapshot.experience.delayed ||
                ["FAILED", "REVIEW", "CANCELLED"].includes(
                  snapshot.experience.stage,
                )
                  ? "confused"
                  : snapshot.experience.terminal
                    ? "working"
                    : "running"
              }
              size="compact"
              className="h-14 w-20"
            />
            <span className="min-w-0">
              <span className="font-display block truncate text-sm font-semibold">
                {snapshot.experience.title}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {snapshot.experience.terminal
                  ? "Open for details"
                  : "Running in the background · open status"}
              </span>
            </span>
          </button>
          {snapshot.experience.terminal ? (
            <button
              type="button"
              aria-label="Dismiss generation update"
              onClick={clearActivity}
              className="grid size-10 shrink-0 place-items-center rounded-xl text-lg text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35"
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
