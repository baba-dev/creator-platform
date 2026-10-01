"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  formatEta,
  type GenerationExperience,
  type GenerationKind,
} from "@/lib/generation-experience";
import { cn } from "@/lib/utils";

import { ProcessDialog } from "./process-dialog";

const steps = ["Queue", "Start", "Create", "Ready"] as const;

export type GenerationProgressJob = {
  id: string;
  status: string;
  model: string;
  kind: GenerationKind;
  errorMessage: string | null;
  reservedCredits: string;
  chargedCredits: string;
  canCancel: boolean;
};

function isAttentionStage(experience: GenerationExperience) {
  return ["DELAYED", "FAILED", "CANCELLED", "REVIEW"].includes(
    experience.stage,
  );
}

export function GenerationProgressDialog({
  open,
  organizationSlug,
  job,
  experience,
  cancelling,
  cancelError,
  connectionIssue,
  onBackground,
  onClose,
  onCancel,
}: {
  open: boolean;
  organizationSlug: string;
  job: GenerationProgressJob;
  experience: GenerationExperience;
  cancelling: boolean;
  cancelError: string | null;
  connectionIssue: string | null;
  onBackground: () => void;
  onClose: () => void;
  onCancel: () => void;
}) {
  const eta = formatEta(experience.etaSeconds, experience.etaConfidence);
  const terminal = experience.terminal;

  return (
    <ProcessDialog
      open={open}
      mascot={isAttentionStage(experience) ? "confused" : "working"}
      eyebrow={
        experience.stage === "DELAYED"
          ? "Taking longer"
          : terminal
            ? "Generation update"
            : "Creating"
      }
      title={experience.title}
      description={experience.description}
      allowDismiss
      onDismiss={terminal ? onClose : onBackground}
    >
      <div aria-label="Generation progress" className="space-y-5">
        {!terminal || experience.stage === "READY" ? (
          <ol className="grid grid-cols-4 gap-2" aria-label="Generation stages">
            {steps.map((step, index) => {
              const complete =
                experience.stage === "READY" || index < experience.stageIndex;
              const current =
                experience.stage !== "READY" &&
                index === experience.stageIndex;
              return (
                <li key={step} className="min-w-0 text-center">
                  <div
                    className={cn(
                      "mx-auto h-1.5 rounded-full border",
                      complete
                        ? "border-success/30 bg-success"
                        : current
                          ? "border-primary/30 bg-primary animate-pulse-soft"
                          : "border-border bg-surface-sunken",
                    )}
                  />
                  <span
                    aria-current={current ? "step" : undefined}
                    className={cn(
                      "mt-2 block truncate font-mono text-[0.625rem] font-bold uppercase tracking-[0.1em]",
                      complete || current
                        ? "text-foreground"
                        : "text-subtle-foreground",
                    )}
                  >
                    {step}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : null}

        <div
          className="rounded-2xl border border-border bg-surface-sunken px-4 py-3 text-center"
          aria-live="polite"
        >
          {eta ? (
            <p className="font-mono text-sm font-bold tabular-nums text-foreground">
              {eta}
            </p>
          ) : (
            <p className="text-sm font-semibold text-foreground">
              {experience.stage === "READY"
                ? "Saved to your asset library"
                : experience.stage === "REVIEW"
                  ? "Credits remain reserved while the job is reviewed"
                  : experience.stage === "FAILED"
                    ? "Open the job for billing and recovery details"
                    : "Status updated"}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {job.model} · {job.kind.toLowerCase()}
          </p>
        </div>

        {connectionIssue ? (
          <p
            role="status"
            className="rounded-xl border border-info/25 bg-info/5 px-3 py-2 text-xs leading-5 text-muted-foreground"
          >
            {connectionIssue}
          </p>
        ) : null}
        {cancelError ? (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive"
          >
            {cancelError}
          </p>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          {!terminal ? (
            <Button type="button" variant="secondary" onClick={onBackground}>
              Continue in background
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          )}
          <Button asChild>
            <Link href={`/app/${organizationSlug}/history/${job.id}`}>
              View job details
            </Link>
          </Button>
        </div>

        {job.canCancel && !terminal ? (
          <div className="border-t border-border pt-3 text-center">
            <button
              type="button"
              disabled={cancelling}
              onClick={onCancel}
              className="min-h-10 px-3 text-xs font-semibold text-muted-foreground underline-offset-4 hover:text-destructive hover:underline disabled:opacity-45"
            >
              {cancelling ? "Cancelling…" : "Cancel queued generation"}
            </button>
          </div>
        ) : null}
      </div>
    </ProcessDialog>
  );
}
