"use client";

import {
  CreativeLocaleButton,
  useCreativeLocale,
} from "@/components/studio/creative-locale-selector";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  StudioModelSelect,
  type StudioModelOption,
} from "@/components/studio/studio-model-select";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/creative";
import { Icon } from "@/components/ui/icon";

type SourceAsset = {
  id: string;
  name: string | null;
  originalFilename: string | null;
  mediaKind: "AUDIO" | "VIDEO";
  mimeType: string;
  byteSize: string;
  durationMs: number | null;
  projectId: string | null;
  createdAt: string;
};

type OutputAsset = {
  id: string;
  name: string | null;
  mimeType: string;
  byteSize: string;
  generationOutputIndex: number | null;
  downloadUrl?: string;
};

type TranscriptionJob = {
  id: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  requestPayload: Record<string, unknown>;
  outputPayload?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  reservedCredits: string;
  chargedCredits: string;
  createdAt: string;
  completedAt: string | null;
  providerModel?: {
    id: string;
    provider: string;
    providerModelId: string;
    displayName: string;
  };
  model?: {
    id: string;
    provider: string;
    providerModelId: string;
    name: string;
  };
  assets: OutputAsset[];
};

type Quote = {
  quoteToken: string;
  priceVersionId: string;
  expiresAt: string;
  pricingDimension: "SECOND" | "REQUEST";
  unitQuantity: string;
  billableSeconds: number;
  billingUnits: string;
  estimatedCredits: string;
  reservationCredits: string;
  provider: string;
  providerModelId: string;
  displayName: string;
};

function formatDuration(durationMs: number | null): string {
  if (!durationMs) return "Unknown duration";
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatBytes(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return value;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function providerLabel(provider: string): string {
  const labels: Record<string, string> = {
    GROQ: "Groq",
    GEMINI: "Gemini",
    NVIDIA: "NVIDIA",
    CLOUDFLARE: "Cloudflare",
    BYTEPLUS: "BytePlus",
  };
  return labels[provider] ?? provider;
}

export function TranscriptionStudio({
  organizationId,
  canGenerate,
  canUpload,
  models,
  defaultModelId,
}: {
  organizationId: string;
  canGenerate: boolean;
  canUpload: boolean;
  models: StudioModelOption[];
  defaultModelId: string | null;
}) {
  const [localeIntent, setLocaleIntent] = useCreativeLocale(organizationId);
  const [assets, setAssets] = useState<SourceAsset[]>([]);
  const [jobs, setJobs] = useState<TranscriptionJob[]>([]);
  const [selectedModelId, setSelectedModelId] = useState(
    defaultModelId ?? models[0]?.id ?? "",
  );
  const [sourceAssetId, setSourceAssetId] = useState("");
  const [language, setLanguage] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteCanAfford, setQuoteCanAfford] = useState(false);
  const [quoteCanSpend, setQuoteCanSpend] = useState(false);
  const [quotePending, setQuotePending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<TranscriptionJob | null>(null);
  const quoteRequest = useRef(0);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === sourceAssetId) ?? null,
    [assets, sourceAssetId],
  );

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/transcriptions?organizationId=${encodeURIComponent(organizationId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const data = (await response.json()) as {
      assets?: SourceAsset[];
      jobs?: TranscriptionJob[];
    };
    setAssets(data.assets ?? []);
    setJobs(data.jobs ?? []);
    setSourceAssetId((current) =>
      current && (data.assets ?? []).some((asset) => asset.id === current)
        ? current
        : (data.assets?.[0]?.id ?? ""),
    );
  }, [organizationId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!selectedModelId || !sourceAssetId) return;
    const requestId = ++quoteRequest.current;
    const timer = setTimeout(async () => {
      setQuotePending(true);
      setError(null);
      try {
        const response = await fetch("/api/transcriptions/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            organizationId,
            modelId: selectedModelId,
            sourceAssetId,
            ...(language.trim() ? { language: language.trim() } : {}),
            localeIntent,
          }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          quote?: Quote;
          wallet?: { canAfford?: boolean };
          budget?: { canSpend?: boolean };
        };
        if (requestId !== quoteRequest.current) return;
        if (!response.ok || !data.quote) {
          setQuote(null);
          setQuoteCanAfford(false);
          setQuoteCanSpend(false);
          setError(data.error ?? "Transcription estimate is unavailable.");
          return;
        }
        setQuote(data.quote);
        setQuoteCanAfford(data.wallet?.canAfford === true);
        setQuoteCanSpend(data.budget?.canSpend === true);
      } catch {
        if (requestId === quoteRequest.current) {
          setQuote(null);
          setError("Transcription estimate is unavailable.");
        }
      } finally {
        if (requestId === quoteRequest.current) setQuotePending(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [organizationId, selectedModelId, sourceAssetId, language, localeIntent]);

  async function upload(file: File) {
    if (!canUpload) return;
    setUploadBusy(true);
    setError(null);
    try {
      if (file.size > 25 * 1024 * 1024)
        throw new Error("Transcription source files must be 25 MB or smaller.");
      const response = await fetch("/api/assets/media-upload", {
        method: "POST",
        headers: {
          "x-organization-id": organizationId,
          "x-file-name": file.name,
          "content-type": "application/octet-stream",
        },
        body: file,
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        asset?: { id?: string };
      };
      if (!response.ok || !data.asset?.id)
        throw new Error(data.error ?? "Upload failed.");
      await load();
      setSourceAssetId(data.asset.id);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "Upload failed.",
      );
    } finally {
      setUploadBusy(false);
    }
  }

  async function poll(jobId: string) {
    for (let attempt = 0; attempt < 180; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const response = await fetch(
        `/api/transcriptions/${encodeURIComponent(jobId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) continue;
      const job = (await response.json()) as TranscriptionJob;
      setActiveJob(job);
      if (
        ["SUCCEEDED", "FAILED", "MANUAL_REVIEW", "CANCELLED"].includes(
          job.status,
        )
      ) {
        await load();
        return;
      }
    }
    throw new Error(
      "Transcription is still running. You can continue tracking it in History.",
    );
  }

  async function transcribe() {
    if (
      !quote ||
      !sourceAssetId ||
      !selectedModelId ||
      busy ||
      !quoteCanAfford ||
      !quoteCanSpend
    )
      return;

    setBusy(true);
    setError(null);
    setActiveJob(null);
    try {
      const response = await fetch("/api/transcriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId,
          modelId: selectedModelId,
          priceVersionId: quote.priceVersionId,
          quoteToken: quote.quoteToken,
          idempotencyKey: crypto.randomUUID(),
          sourceAssetId,
          ...(language.trim() ? { language: language.trim() } : {}),
          localeIntent,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        jobId?: string;
      };
      if (!response.ok || !data.jobId)
        throw new Error(data.error ?? "Could not start transcription.");
      setActiveJob({
        id: data.jobId,
        status: "QUEUED",
        errorCode: null,
        errorMessage: null,
        requestPayload: {},
        reservedCredits: quote.reservationCredits,
        chargedCredits: "0",
        createdAt: new Date().toISOString(),
        completedAt: null,
        assets: [],
      });
      await poll(data.jobId);
    } catch (transcriptionError) {
      setError(
        transcriptionError instanceof Error
          ? transcriptionError.message
          : "Transcription failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const resultText =
    activeJob?.output && typeof activeJob.output.text === "string"
      ? activeJob.output.text
      : activeJob?.outputPayload &&
          typeof activeJob.outputPayload.text === "string"
        ? activeJob.outputPayload.text
        : null;

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow>Speech / transcription</Eyebrow>
          <h2 className="mt-2 font-display text-xl font-semibold text-foreground">
            Transcribe & subtitles
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Turn an audio or video asset into a transcript plus SRT and VTT
            subtitles. Source duration is verified by the media pipeline before
            pricing and billing.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CreativeLocaleButton
            value={localeIntent}
            onChange={setLocaleIntent}
            disabled={busy || uploadBusy}
          />
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {models.length} {models.length === 1 ? "model" : "models"} ready
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-foreground">
              Transcription model
            </label>
            <StudioModelSelect
              models={models}
              value={selectedModelId}
              onChange={(value) => {
                setSelectedModelId(value);
                setQuote(null);
              }}
              ariaLabel="Transcription model"
              className="mt-1 w-full"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground">
              Source audio or video
            </label>
            <select
              value={sourceAssetId}
              onChange={(event) => setSourceAssetId(event.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              {assets.length === 0 ? (
                <option value="">No eligible media assets</option>
              ) : (
                assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name ?? asset.originalFilename ?? asset.id} ·{" "}
                    {formatDuration(asset.durationMs)} ·{" "}
                    {formatBytes(asset.byteSize)}
                  </option>
                ))
              )}
            </select>
            {selectedAsset ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {selectedAsset.mediaKind} · {selectedAsset.mimeType} ·{" "}
                {formatDuration(selectedAsset.durationMs)}
              </p>
            ) : null}
          </div>

          {canUpload ? (
            <div>
              <label className="text-xs font-semibold text-foreground">
                Upload a new source
              </label>
              <input
                type="file"
                accept="audio/mpeg,audio/wav,audio/x-wav,video/mp4"
                disabled={uploadBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.currentTarget.value = "";
                }}
                className="mt-1 block w-full rounded-xl border border-dashed border-border bg-background p-3 text-xs"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                MP3, WAV, or MP4 · maximum 25 MB.
              </p>
            </div>
          ) : null}

          <div>
            <label className="text-xs font-semibold text-foreground">
              Language hint{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <input
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              placeholder="e.g. en, ar, hi"
              maxLength={20}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
          </div>

          {error ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <Button
            type="button"
            onClick={() => void transcribe()}
            disabled={
              !canGenerate ||
              busy ||
              quotePending ||
              !quote ||
              !quoteCanAfford ||
              !quoteCanSpend
            }
            className="w-full gap-2"
          >
            <Icon name="voice" className="size-4" />
            {busy
              ? "Transcribing..."
              : quote
                ? `Transcribe · est. ${quote.estimatedCredits} credits`
                : quotePending
                  ? "Estimating..."
                  : "Select media to estimate"}
          </Button>
        </div>

        <div className="rounded-2xl border border-border bg-surface-sunken p-4">
          <h3 className="text-sm font-semibold text-foreground">
            Estimate & result
          </h3>
          {quote ? (
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-muted-foreground">Duration</div>
                <strong>{quote.billableSeconds}s</strong>
              </div>
              <div>
                <div className="text-muted-foreground">Billing</div>
                <strong>
                  {quote.pricingDimension === "SECOND"
                    ? `${quote.billingUnits} × ${quote.unitQuantity}s`
                    : "Per request"}
                </strong>
              </div>
              <div>
                <div className="text-muted-foreground">Estimate</div>
                <strong>{quote.estimatedCredits} credits</strong>
              </div>
              <div>
                <div className="text-muted-foreground">Provider</div>
                <strong>{providerLabel(quote.provider)}</strong>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Choose a source and model to calculate the quote.
            </p>
          )}

          {activeJob ? (
            <div className="mt-5 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm text-foreground">
                  {activeJob.status}
                </strong>
                {activeJob.model ? (
                  <span className="text-[11px] text-muted-foreground">
                    {activeJob.model.name} ·{" "}
                    {providerLabel(activeJob.model.provider)}
                  </span>
                ) : null}
              </div>
              {activeJob.errorMessage ? (
                <p className="mt-2 text-xs text-destructive">
                  {activeJob.errorMessage}
                </p>
              ) : null}
              {resultText ? (
                <div className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-background p-3 text-xs leading-5 text-foreground">
                  {resultText}
                </div>
              ) : null}
              {activeJob.assets.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeJob.assets.map((asset) => (
                    <a
                      key={asset.id}
                      href={
                        asset.downloadUrl ??
                        `/api/assets/${encodeURIComponent(asset.id)}?download=1`
                      }
                      className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:border-primary/40"
                    >
                      Download {asset.name ?? asset.mimeType}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {jobs.length ? (
            <div className="mt-5 border-t border-border pt-4">
              <div className="text-xs font-semibold text-foreground">
                Recent transcription jobs
              </div>
              <div className="mt-2 space-y-2">
                {jobs.slice(0, 5).map((job) => (
                  <button
                    type="button"
                    key={job.id}
                    onClick={() => setActiveJob(job)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left text-xs"
                  >
                    <span className="truncate">{job.id}</span>
                    <span className="font-semibold">{job.status}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
