"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/creative";
import { StatusDot, Tape } from "@/components/ui/sketch";

type Model = {
  id: string;
  name: string;
  priceVersionId: string;
  credits: string;
  capabilities?: { aspectRatios?: string[]; resolution?: string };
};
type Job = {
  id: string;
  status: string;
  errorMessage: string | null;
  reservedCredits: string;
  chargedCredits: string;
  providerModel: { displayName: string };
  assets: { id: string }[];
};
type Studio = {
  configured: boolean;
  balance: string;
  models: Model[];
  jobs: Job[];
};
const statuses: Record<string, string> = {
  QUEUED: "Queued",
  SUBMITTED: "Generating image",
  PROCESSING: "Saving image",
  SUCCEEDED: "Ready",
  FAILED: "Failed — credits released",
  MANUAL_REVIEW: "Needs review — credits reserved",
  CANCELLED: "Cancelled",
};

export function GenerationStudio({
  canGenerate,
  organizationId,
}: {
  canGenerate: boolean;
  organizationId: string;
}) {
  const [data, setData] = useState<Studio | null>(null);
  const [modelId, setModelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState("1:1");
  const [resolution, setResolution] = useState("2K");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const model = data?.models.find((m) => m.id === modelId) ?? data?.models[0];

  const availableRatios = model?.capabilities?.aspectRatios ?? [
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
    "21:9",
  ];
  const is4KSupported =
    model?.capabilities?.resolution === "4K" ||
    model?.capabilities?.resolution === "4k";

  useEffect(() => {
    if (!availableRatios.includes(ratio)) {
      setRatio(availableRatios[0] ?? "1:1");
    }
  }, [availableRatios, ratio]);

  useEffect(() => {
    if (!is4KSupported && resolution === "4K") {
      setResolution("2K");
    }
  }, [is4KSupported, resolution]);

  const refresh = useCallback(async () => {
    const response = await fetch(
      `/api/generations?organizationId=${encodeURIComponent(organizationId)}`,
      { cache: "no-store" },
    );
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Cannot load Studio.");
    setData(body);
  }, [organizationId]);
  useEffect(() => {
    let stopped = false;
    const load = () =>
      refresh().catch(() => {
        if (!stopped)
          setError(
            "Connection interrupted. Job history will refresh automatically.",
          );
      });
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [refresh]);
  async function generate() {
    if (!model || busy) return;
    setBusy(true);
    setError(null);
    const input = {
      organizationId,
      modelId: model.id,
      priceVersionId: model.priceVersionId,
      prompt,
      aspectRatio: ratio,
      resolution,
    };
    const fingerprint = JSON.stringify(input);
    if (attempt.current?.fingerprint !== fingerprint)
      attempt.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, idempotencyKey: attempt.current.key }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Generation could not be queued.");
      attempt.current = null;
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Connection interrupted. Retry to check the same request.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      id="create"
      className="paper-sheet relative rounded-[28px] border border-border p-5 sm:p-7"
    >
      <Tape className="-top-1 right-16 hidden rotate-6 sm:block" />
      <Eyebrow>AI creation studio</Eyebrow>
      <h2 className="font-display mt-2 text-2xl font-semibold text-foreground">
        Start with a rough idea.
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Create a 2K image with BytePlus. Video and voice generation are coming
        later.
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <label
            className="block text-sm font-semibold text-foreground"
            htmlFor="image-model"
          >
            Image model
          </label>
          <select
            id="image-model"
            value={model?.id ?? ""}
            onChange={(e) => setModelId(e.target.value)}
            disabled={busy}
            className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-foreground"
          >
            {!data?.models.length ? (
              <option>No enabled image models with active pricing</option>
            ) : null}
            {data?.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.credits} credits
              </option>
            ))}
          </select>
          <label
            htmlFor="creation-prompt"
            className="block text-sm font-semibold text-foreground"
          >
            Describe your visual
          </label>
          <textarea
            id="creation-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={2000}
            disabled={busy}
            placeholder="A cinematic product photograph in warm Omani desert light…"
            className="min-h-44 w-full rounded-2xl border border-input bg-card p-4 text-foreground placeholder:text-muted-foreground"
          />
          <label
            htmlFor="image-ratio"
            className="block text-sm font-semibold text-foreground"
          >
            Aspect ratio
          </label>
          <select
            id="image-ratio"
            value={ratio}
            onChange={(e) => setRatio(e.target.value)}
            disabled={busy}
            className="min-h-11 rounded-xl border border-input bg-card px-3 text-foreground"
          >
            {availableRatios.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          {is4KSupported ? (
            <>
              <label
                htmlFor="image-resolution"
                className="block text-sm font-semibold text-foreground"
              >
                Resolution
              </label>
              <select
                id="image-resolution"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                disabled={busy}
                className="min-h-11 rounded-xl border border-input bg-card px-3 text-foreground"
              >
                <option value="2K">2K</option>
                <option value="4K">4K</option>
              </select>
            </>
          ) : null}
          <p className="text-sm tabular-nums text-muted-foreground">
            Available balance: {data?.balance ?? "…"} credits
          </p>
          <Button
            type="button"
            className="w-full"
            onClick={() => void generate()}
            disabled={
              busy ||
              !canGenerate ||
              !data?.configured ||
              !model ||
              !prompt.trim() ||
              BigInt(data?.balance ?? "0") < BigInt(model?.credits ?? "0")
            }
          >
            {busy
              ? "Queuing image…"
              : `Generate image · ${model?.credits ?? "—"} credits`}
          </Button>
          <p className="text-xs text-muted-foreground">
            Credits are reserved when queued and charged once the image is
            saved.
          </p>
          {!canGenerate ? (
            <p className="text-sm text-muted-foreground">
              Member or Owner access is required to generate.
            </p>
          ) : null}
          {data && !data.configured ? (
            <p className="text-sm text-muted-foreground">
              Image generation is not configured yet.
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-destructive p-3 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold text-foreground">
            Recent images
          </h3>
          <div className="mt-4 space-y-4" aria-live="polite">
            {data?.jobs.length === 0 ? (
              <p className="rounded-2xl border border-border p-6 text-muted-foreground">
                Your first generated image will appear here.
              </p>
            ) : null}
            {data?.jobs.map((job) => (
              <article
                key={job.id}
                className="rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {job.providerModel.displayName}
                  </span>
                  <StatusDot
                    tone={
                      job.status === "SUCCEEDED"
                        ? "success"
                        : ["FAILED", "MANUAL_REVIEW"].includes(job.status)
                          ? "warning"
                          : "info"
                    }
                  >
                    {statuses[job.status] ?? job.status}
                  </StatusDot>
                </div>
                {job.assets.map((asset) => (
                  <div key={asset.id} className="mt-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/assets/${asset.id}`}
                      alt={`Generated image from ${job.providerModel.displayName}`}
                      className="max-h-96 w-full rounded-xl object-contain"
                    />
                    <a
                      href={`/api/assets/${asset.id}?download=1`}
                      className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-primary"
                    >
                      Download PNG
                    </a>
                  </div>
                ))}
                {job.errorMessage ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {job.errorMessage}
                  </p>
                ) : null}
                <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                  {job.status === "SUCCEEDED"
                    ? `${job.chargedCredits} credits charged`
                    : job.status === "FAILED"
                      ? "No charge"
                      : `${job.reservedCredits} credits reserved`}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
