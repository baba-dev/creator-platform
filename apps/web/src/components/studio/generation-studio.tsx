"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/creative";
import { StatusDot, Tape } from "@/components/ui/sketch";

type CapabilityValue = boolean | number | string;
type MediaKind = "IMAGE" | "VIDEO" | "VOICE";
type PresetVoice = {
  key: string;
  displayName: string;
  gender?: "female" | "male";
  locale: string;
  language: string;
  style?: string;
  supportedModels: string[];
};
type Model = {
  id: string;
  providerModelId: string;
  name: string;
  mediaKind: MediaKind;
  description?: string | null;
  priceVersionId: string;
  pricingDimension?: "REQUEST" | "CHARACTER" | "SECOND" | null;
  unitQuantity?: string | null;
  credits: string;
  capabilities?: Record<string, CapabilityValue> | null;
};
type Job = {
  id: string;
  status: string;
  errorMessage: string | null;
  reservedCredits: string;
  chargedCredits: string;
  providerModel: { displayName: string; mediaKind: MediaKind };
  assets: { id: string; mimeType: string }[];
};
type Studio = {
  configured: boolean;
  mediaConfigured?: boolean;
  voiceConfigured?: boolean;
  balance: string;
  models: Model[];
  voices?: PresetVoice[];
  jobs: Job[];
};
function statusLabel(status: string, mediaKind: MediaKind): string {
  const media =
    mediaKind === "VIDEO" ? "video" : mediaKind === "VOICE" ? "voice" : "image";
  const statuses: Record<string, string> = {
    QUEUED: "Queued",
    SUBMITTED: `Submitting ${media}`,
    PROCESSING:
      mediaKind === "VIDEO"
        ? "Rendering video"
        : mediaKind === "VOICE"
          ? "Synthesizing voice"
          : "Saving image",
    SUCCEEDED: "Ready",
    FAILED: "Failed — credits released",
    MANUAL_REVIEW: "Needs review — credits reserved",
    CANCELLED: "Cancelled",
  };
  return statuses[status] ?? status;
}

function capabilityValues(
  capabilities: Model["capabilities"],
  prefix: string,
): string[] {
  if (!capabilities) return [];
  const marker = `${prefix}:`;
  return Object.entries(capabilities)
    .filter(([key, value]) => key.startsWith(marker) && value === true)
    .map(([key]) => key.slice(marker.length));
}

const mediaModes = ["IMAGE", "VIDEO", "VOICE"] as const;

export function GenerationStudio({
  canGenerate,
  organizationId,
}: {
  canGenerate: boolean;
  organizationId: string;
}) {
  const [data, setData] = useState<Studio | null>(null);
  const [activeMode, setActiveMode] = useState<MediaKind>("IMAGE");
  const [modelId, setModelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [voiceText, setVoiceText] = useState("");
  const [voiceKey, setVoiceKey] = useState("jasper");
  const [speechRate, setSpeechRate] = useState(1.0);
  const [quotedCreditsInfo, setQuotedCreditsInfo] = useState<{
    text: string;
    modelId: string;
    priceVersionId: string;
    credits: string;
  } | null>(null);
  const [voiceQuotePending, setVoiceQuotePending] = useState(false);
  const [voiceQuoteError, setVoiceQuoteError] = useState<string | null>(null);
  const [videoQuotedCreditsInfo, setVideoQuotedCreditsInfo] = useState<{
    duration: string;
    resolution: string;
    modelId: string;
    priceVersionId: string;
    credits: string;
    generateAudio: boolean;
  } | null>(null);
  const [videoQuotePending, setVideoQuotePending] = useState(false);
  const [videoQuoteError, setVideoQuoteError] = useState<string | null>(null);
  const [ratio, setRatio] = useState("1:1");
  const [resolution, setResolution] = useState("2K");
  const [duration, setDuration] = useState("5");
  const [generateAudio, setGenerateAudio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const enhancementAttempt = useRef<{
    fingerprint: string;
    key: string;
  } | null>(null);

  const modelsForMode = useMemo(
    () => data?.models.filter((m) => m.mediaKind === activeMode) ?? [],
    [data?.models, activeMode],
  );

  const model = modelsForMode.find((m) => m.id === modelId) ?? modelsForMode[0];

  const availableVoices = useMemo(
    () =>
      (data?.voices ?? []).filter(
        (voice) =>
          !model || voice.supportedModels.includes(model.providerModelId),
      ),
    [data?.voices, model],
  );
  const selectedVoiceKey = availableVoices.some(
    (voice) => voice.key === voiceKey,
  )
    ? voiceKey
    : (availableVoices[0]?.key ?? "");

  const availableRatios = useMemo(
    () => capabilityValues(model?.capabilities, "aspectRatio"),
    [model?.capabilities],
  );
  const availableResolutions = useMemo(
    () => capabilityValues(model?.capabilities, "resolution"),
    [model?.capabilities],
  );
  const availableDurations = useMemo(
    () => capabilityValues(model?.capabilities, "durationSeconds"),
    [model?.capabilities],
  );

  const selectedRatio = availableRatios.includes(ratio)
    ? ratio
    : (availableRatios[0] ?? "");
  const selectedResolution = availableResolutions.includes(resolution)
    ? resolution
    : (availableResolutions[0] ?? "");
  const selectedDuration = availableDurations.includes(duration)
    ? duration
    : (availableDurations[0] ?? "5");

  const handleModeChange = useCallback(
    (mode: MediaKind) => {
      setActiveMode(mode);
      setError(null);
      const nextModel = data?.models.find((m) => m.mediaKind === mode);
      if (nextModel) {
        setModelId(nextModel.id);
      }
    },
    [data?.models],
  );

  const billableCharacters = Array.from(voiceText.replace(/\s/gu, "")).length;
  const unitQuantity = Number(model?.unitQuantity ?? 1000);
  const estimatedUnits =
    billableCharacters > 0 ? Math.ceil(billableCharacters / unitQuantity) : 0;
  const activeModelId = model?.id;
  const activePriceVersionId = model?.priceVersionId;

  const quotedCredits =
    quotedCreditsInfo?.text === voiceText &&
    quotedCreditsInfo?.modelId === activeModelId &&
    quotedCreditsInfo?.priceVersionId === activePriceVersionId
      ? quotedCreditsInfo.credits
      : null;

  const videoQuotedCredits =
    videoQuotedCreditsInfo?.duration === selectedDuration &&
    videoQuotedCreditsInfo?.resolution === selectedResolution &&
    videoQuotedCreditsInfo?.modelId === activeModelId &&
    videoQuotedCreditsInfo?.priceVersionId === activePriceVersionId &&
    videoQuotedCreditsInfo?.generateAudio === generateAudio
      ? videoQuotedCreditsInfo.credits
      : null;

  useEffect(() => {
    if (activeMode !== "VOICE" || !activeModelId || billableCharacters === 0)
      return;
    const quoteModelId = activeModelId;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      setQuotedCreditsInfo(null);
      setVoiceQuotePending(true);
      setVoiceQuoteError(null);
      try {
        const res = await fetch("/api/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            modelId: quoteModelId,
            text: voiceText,
          }),
        });
        if (cancelled) return;
        const resData = (await res.json()) as {
          error?: string;
          quote?: { customerCredits?: string; priceVersionId?: string };
        };
        if (
          res.ok &&
          resData.quote?.customerCredits !== undefined &&
          resData.quote.priceVersionId
        ) {
          setQuotedCreditsInfo({
            text: voiceText,
            modelId: quoteModelId,
            priceVersionId: resData.quote.priceVersionId,
            credits: String(resData.quote.customerCredits),
          });
          setVoiceQuoteError(null);
        } else {
          setVoiceQuoteError(resData.error ?? "Voice quote is unavailable.");
        }
      } catch {
        if (!cancelled) setVoiceQuoteError("Voice quote is unavailable.");
      } finally {
        if (!cancelled) setVoiceQuotePending(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    activeMode,
    activeModelId,
    activePriceVersionId,
    billableCharacters,
    voiceText,
    organizationId,
  ]);

  useEffect(() => {
    if (activeMode !== "VIDEO" || !activeModelId || !selectedDuration) return;
    const quoteModelId = activeModelId;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      setVideoQuotedCreditsInfo(null);
      setVideoQuotePending(true);
      setVideoQuoteError(null);
      try {
        const res = await fetch("/api/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            modelId: quoteModelId,
            durationSeconds: Number.parseInt(selectedDuration, 10),
            resolution: selectedResolution,
            generateAudio,
          }),
        });
        if (cancelled) return;
        const resData = (await res.json()) as {
          error?: string;
          quote?: { customerCredits?: string; priceVersionId?: string };
        };
        if (
          res.ok &&
          resData.quote?.customerCredits !== undefined &&
          resData.quote.priceVersionId
        ) {
          setVideoQuotedCreditsInfo({
            duration: selectedDuration,
            resolution: selectedResolution,
            modelId: quoteModelId,
            priceVersionId: resData.quote.priceVersionId,
            credits: String(resData.quote.customerCredits),
            generateAudio,
          });
          setVideoQuoteError(null);
        } else {
          setVideoQuoteError(resData.error ?? "Video quote is unavailable.");
        }
      } catch {
        if (!cancelled) setVideoQuoteError("Video quote is unavailable.");
      } finally {
        if (!cancelled) setVideoQuotePending(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    activeMode,
    activeModelId,
    activePriceVersionId,
    selectedDuration,
    selectedResolution,
    generateAudio,
    organizationId,
  ]);

  const activeRequiredCredits =
    activeMode === "VOICE"
      ? quotedCredits === null
        ? null
        : BigInt(quotedCredits)
      : activeMode === "VIDEO"
        ? videoQuotedCredits !== null
          ? BigInt(videoQuotedCredits)
          : model?.pricingDimension === "SECOND"
            ? null
            : BigInt(model?.credits ?? "0")
        : BigInt(model?.credits ?? "0");

  const isConfiguredForMode =
    activeMode === "VOICE"
      ? Boolean(data?.voiceConfigured)
      : Boolean(data?.mediaConfigured ?? data?.configured);

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
    if (!model || busy || isEnhancing) return;
    setBusy(true);
    setError(null);
    let input: Record<string, unknown>;
    if (model.mediaKind === "VOICE") {
      input = {
        organizationId,
        modelId: model.id,
        priceVersionId: model.priceVersionId,
        text: voiceText.trim(),
        voiceKey: selectedVoiceKey,
        speechRate,
        format: "mp3",
      };
    } else {
      input = {
        organizationId,
        modelId: model.id,
        priceVersionId: model.priceVersionId,
        prompt,
        aspectRatio: selectedRatio,
        resolution: selectedResolution,
        ...(model.mediaKind === "VIDEO" && {
          durationSeconds: Number.parseInt(selectedDuration, 10),
          generateAudio,
        }),
      };
    }
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

  async function enhancePrompt() {
    const sourcePrompt = prompt.trim();
    if (!sourcePrompt || !model || isEnhancing || busy || !canGenerate) return;

    const fingerprint = JSON.stringify({
      organizationId,
      sourcePrompt,
      targetMedia: model.mediaKind,
    });
    if (enhancementAttempt.current?.fingerprint !== fingerprint)
      enhancementAttempt.current = {
        fingerprint,
        key: crypto.randomUUID(),
      };

    setIsEnhancing(true);
    setError(null);
    try {
      const response = await fetch("/api/reasoning/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          userPrompt: sourcePrompt,
          targetMedia: model.mediaKind,
          idempotencyKey: enhancementAttempt.current.key,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error ?? "Prompt enhancement could not be queued.",
        );

      const jobId = body.jobId as string;
      for (let attemptNumber = 0; attemptNumber < 45; attemptNumber += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const pollResponse = await fetch(`/api/reasoning/${jobId}`, {
          cache: "no-store",
        });
        const job = await pollResponse.json();
        if (!pollResponse.ok)
          throw new Error(
            job.error ?? "Prompt enhancement status unavailable.",
          );

        if (job.status === "SUCCEEDED") {
          const enhancedPrompt = job.outputPayload?.enhancedPrompt;
          if (typeof enhancedPrompt !== "string" || !enhancedPrompt.trim())
            throw new Error("Prompt enhancement returned an invalid result.");
          setPrompt(enhancedPrompt);
          enhancementAttempt.current = null;
          return;
        }
        if (job.status === "FAILED") {
          enhancementAttempt.current = null;
          throw new Error(job.errorMessage ?? "Prompt enhancement failed.");
        }
      }

      throw new Error("Prompt enhancement timed out. Retry the same request.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Prompt enhancement could not be completed.",
      );
    } finally {
      setIsEnhancing(false);
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
        Create image, video, and voice media with verified BytePlus models.
      </p>
      <div className="mt-4">
        <div
          role="tablist"
          aria-label="Media format"
          className="inline-flex rounded-xl border border-border bg-card p-1"
        >
          {mediaModes.map((mode, index) => (
            <button
              key={mode}
              id={`media-tab-${mode.toLowerCase()}`}
              type="button"
              role="tab"
              aria-selected={activeMode === mode}
              aria-controls="media-creation-panel"
              tabIndex={activeMode === mode ? 0 : -1}
              onClick={() => handleModeChange(mode)}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const nextIndex =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? mediaModes.length - 1
                      : (index +
                          (event.key === "ArrowRight" ? 1 : -1) +
                          mediaModes.length) %
                        mediaModes.length;
                const nextMode = mediaModes[nextIndex]!;
                handleModeChange(nextMode);
                document
                  .getElementById(`media-tab-${nextMode.toLowerCase()}`)
                  ?.focus();
              }}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                activeMode === mode
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode === "IMAGE"
                ? "Image"
                : mode === "VIDEO"
                  ? "Video"
                  : "Voice"}
            </button>
          ))}
        </div>
      </div>
      <div
        id="media-creation-panel"
        role="tabpanel"
        aria-labelledby={`media-tab-${activeMode.toLowerCase()}`}
        className="mt-6 grid gap-6 lg:grid-cols-2"
      >
        <div className="space-y-4">
          <label
            className="block text-sm font-semibold text-foreground"
            htmlFor="media-model"
          >
            Generation model
          </label>
          <select
            id="media-model"
            value={model?.id ?? ""}
            onChange={(e) => setModelId(e.target.value)}
            disabled={busy || isEnhancing}
            className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-foreground"
          >
            {!modelsForMode.length ? (
              <option>
                No enabled {activeMode.toLowerCase()} models with active pricing
              </option>
            ) : null}
            {modelsForMode.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ·{" "}
                {m.pricingDimension === "CHARACTER"
                  ? `${m.credits} credits / ${m.unitQuantity ?? 1000} chars`
                  : m.pricingDimension === "SECOND"
                    ? `${m.credits} credits / ${m.unitQuantity ?? 5}s`
                    : `${m.credits} credits`}
              </option>
            ))}
          </select>
          {model?.description ? (
            <p className="text-xs text-muted-foreground">{model.description}</p>
          ) : null}

          {activeMode === "VOICE" ? (
            <>
              <label
                htmlFor="voice-text"
                className="block text-sm font-semibold text-foreground"
              >
                Speech synthesis text
              </label>
              <div className="relative">
                <textarea
                  id="voice-text"
                  value={voiceText}
                  onChange={(e) => setVoiceText(e.target.value)}
                  maxLength={4096}
                  disabled={busy}
                  placeholder="Enter clear, natural text for speech synthesis…"
                  className="min-h-44 w-full rounded-2xl border border-input bg-card p-4 pb-10 text-foreground placeholder:text-muted-foreground"
                />
                <div className="absolute bottom-3 right-3 text-xs text-muted-foreground">
                  {voiceText.length} / 4096 chars · {estimatedUnits} block
                  {estimatedUnits === 1 ? "" : "s"}
                </div>
              </div>

              <label
                htmlFor="voice-preset"
                className="block text-sm font-semibold text-foreground"
              >
                Preset voice
              </label>
              <select
                id="voice-preset"
                value={selectedVoiceKey}
                onChange={(e) => setVoiceKey(e.target.value)}
                disabled={busy || availableVoices.length === 0}
                className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-foreground"
              >
                {availableVoices.length === 0 ? (
                  <option>No verified voices available</option>
                ) : null}
                {availableVoices.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.displayName} ({v.gender ? `${v.gender} · ` : ""}
                    {v.locale}){v.style ? ` — ${v.style}` : ""}
                  </option>
                ))}
              </select>

              <label
                htmlFor="voice-speech-rate"
                className="block text-sm font-semibold text-foreground"
              >
                Speech rate
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="voice-speech-rate"
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={speechRate}
                  onChange={(e) =>
                    setSpeechRate(Number.parseFloat(e.target.value))
                  }
                  disabled={busy}
                  aria-valuetext={`${speechRate.toFixed(1)} times speed`}
                  className="min-h-11 w-full accent-primary"
                />
                <output
                  htmlFor="voice-speech-rate"
                  className="min-w-12 text-right text-sm font-semibold tabular-nums text-foreground"
                >
                  {speechRate.toFixed(1)}×
                </output>
              </div>
            </>
          ) : (
            <>
              <label
                htmlFor="creation-prompt"
                className="block text-sm font-semibold text-foreground"
              >
                Describe your {model?.mediaKind === "VIDEO" ? "video" : "image"}
              </label>
              <div className="relative">
                <textarea
                  id="creation-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  maxLength={2000}
                  disabled={busy || isEnhancing}
                  placeholder="A cinematic product photograph in warm Omani desert light…"
                  className="min-h-44 w-full rounded-2xl border border-input bg-card p-4 pb-14 text-foreground placeholder:text-muted-foreground"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void enhancePrompt()}
                  disabled={
                    busy ||
                    isEnhancing ||
                    !canGenerate ||
                    !model ||
                    !prompt.trim()
                  }
                  aria-busy={isEnhancing}
                  className="absolute bottom-3 right-3"
                >
                  {isEnhancing ? (
                    <>
                      <span
                        aria-hidden="true"
                        className="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent"
                      />
                      Enhancing…
                    </>
                  ) : (
                    <>✨ Enhance prompt</>
                  )}
                </Button>
              </div>

              <label
                htmlFor="media-ratio"
                className="block text-sm font-semibold text-foreground"
              >
                Aspect ratio
              </label>
              <select
                id="media-ratio"
                value={selectedRatio}
                onChange={(e) => setRatio(e.target.value)}
                disabled={busy || availableRatios.length === 0}
                className="min-h-11 rounded-xl border border-input bg-card px-3 text-foreground"
              >
                {availableRatios.length ? (
                  availableRatios.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))
                ) : (
                  <option>No supported aspect ratios advertised</option>
                )}
              </select>

              <label
                htmlFor="media-resolution"
                className="block text-sm font-semibold text-foreground"
              >
                Resolution
              </label>
              <select
                id="media-resolution"
                value={selectedResolution}
                onChange={(e) => setResolution(e.target.value)}
                disabled={busy || availableResolutions.length === 0}
                className="min-h-11 rounded-xl border border-input bg-card px-3 text-foreground"
              >
                {availableResolutions.length ? (
                  availableResolutions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))
                ) : (
                  <option>No supported resolutions advertised</option>
                )}
              </select>

              {model?.mediaKind === "VIDEO" && (
                <>
                  <label
                    htmlFor="video-duration"
                    className="block text-sm font-semibold text-foreground"
                  >
                    Duration
                  </label>
                  <select
                    id="video-duration"
                    value={selectedDuration}
                    onChange={(e) => setDuration(e.target.value)}
                    disabled={busy || availableDurations.length === 0}
                    className="min-h-11 rounded-xl border border-input bg-card px-3 text-foreground"
                  >
                    {availableDurations.length ? (
                      availableDurations.map((value) => (
                        <option key={value} value={value}>
                          {value} seconds
                        </option>
                      ))
                    ) : (
                      <option>No supported durations advertised</option>
                    )}
                  </select>

                  {model.capabilities?.generateAudio === true ? (
                    <label className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-sm font-medium text-foreground">
                      <input
                        type="checkbox"
                        checked={generateAudio}
                        onChange={(event) =>
                          setGenerateAudio(event.target.checked)
                        }
                        disabled={busy}
                        className="size-4 accent-primary"
                      />
                      Generate synchronized audio
                    </label>
                  ) : null}
                </>
              )}
            </>
          )}

          <p className="text-sm tabular-nums text-muted-foreground">
            Available balance: {data?.balance ?? "…"} credits
            {activeMode === "VOICE" && billableCharacters > 0 ? (
              <span className="ml-2 font-semibold text-foreground">
                ·{" "}
                {voiceQuotePending
                  ? "Calculating quote…"
                  : quotedCredits !== null
                    ? `Quoted: ${quotedCredits} credits`
                    : "Quote unavailable"}
              </span>
            ) : null}
            {activeMode === "VIDEO" && selectedDuration ? (
              <span className="ml-2 font-semibold text-foreground">
                ·{" "}
                {videoQuotePending
                  ? "Calculating quote…"
                  : videoQuotedCredits !== null
                    ? `Quoted: ${videoQuotedCredits} credits`
                    : "Quote unavailable"}
              </span>
            ) : null}
          </p>
          {voiceQuoteError ? (
            <p role="status" className="text-sm text-destructive">
              {voiceQuoteError}
            </p>
          ) : null}
          {videoQuoteError ? (
            <p role="status" className="text-sm text-destructive">
              {videoQuoteError}
            </p>
          ) : null}

          <Button
            type="button"
            className="w-full"
            onClick={() => void generate()}
            aria-busy={busy}
            disabled={
              busy ||
              !canGenerate ||
              !isConfiguredForMode ||
              !model ||
              (activeMode === "VOICE" ? !voiceText.trim() : !prompt.trim()) ||
              (activeMode === "VOICE" &&
                (selectedVoiceKey === "" || activeRequiredCredits === null)) ||
              (activeMode !== "VOICE" &&
                (!selectedRatio || !selectedResolution)) ||
              (model.mediaKind === "VIDEO" &&
                (!selectedDuration || activeRequiredCredits === null)) ||
              (activeRequiredCredits !== null &&
                BigInt(data?.balance ?? "0") < activeRequiredCredits)
            }
          >
            {busy
              ? activeMode === "VOICE"
                ? "Synthesizing voice…"
                : "Queuing media…"
              : `Generate ${
                  activeMode === "VIDEO"
                    ? "video"
                    : activeMode === "VOICE"
                      ? "speech"
                      : "image"
                } · ${
                  activeMode === "VOICE"
                    ? (quotedCredits ?? "—")
                    : activeMode === "VIDEO" &&
                        model?.pricingDimension === "SECOND"
                      ? (videoQuotedCredits ?? "—")
                      : (model?.credits ?? "—")
                } credits`}
          </Button>
          <p className="text-xs text-muted-foreground">
            Credits are reserved when queued and charged once the media is
            saved.
          </p>
          {!canGenerate ? (
            <p className="text-sm text-muted-foreground">
              Member or Owner access is required to generate.
            </p>
          ) : null}
          {data && !isConfiguredForMode ? (
            <p className="text-sm text-muted-foreground">
              {activeMode === "VOICE"
                ? "Voice generation is not configured yet."
                : "Media generation is not configured yet."}
            </p>
          ) : null}
          {model &&
          activeMode !== "VOICE" &&
          (availableRatios.length === 0 ||
            availableResolutions.length === 0 ||
            (model.mediaKind === "VIDEO" &&
              availableDurations.length === 0)) ? (
            <p className="text-sm text-destructive">
              This model is missing generation capabilities. Ask an admin to
              sync provider models before generating.
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
            Recent creations
          </h3>
          <div className="mt-4 space-y-4" aria-live="polite">
            {data?.jobs.length === 0 ? (
              <p className="rounded-2xl border border-border p-6 text-muted-foreground">
                Your first generated media will appear here.
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
                    {statusLabel(job.status, job.providerModel.mediaKind)}
                  </StatusDot>
                </div>
                {job.assets.map((asset) => (
                  <div key={asset.id} className="mt-3">
                    {asset.mimeType.startsWith("video/") ? (
                      <video
                        src={`/api/assets/${asset.id}`}
                        controls
                        playsInline
                        preload="metadata"
                        aria-label={`Generated video from ${job.providerModel.displayName}`}
                        className="max-h-96 w-full rounded-xl bg-muted object-contain"
                      />
                    ) : asset.mimeType.startsWith("audio/") ? (
                      <div className="rounded-xl border border-border bg-surface-sunken p-3">
                        <audio
                          src={`/api/assets/${asset.id}`}
                          controls
                          preload="metadata"
                          aria-label={`Generated voice from ${job.providerModel.displayName}`}
                          className="w-full"
                        />
                      </div>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`/api/assets/${asset.id}`}
                        alt={`Generated image from ${job.providerModel.displayName}`}
                        className="max-h-96 w-full rounded-xl bg-muted object-contain"
                      />
                    )}
                    <a
                      href={`/api/assets/${asset.id}?download=1`}
                      className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-primary"
                    >
                      Download{" "}
                      {asset.mimeType.startsWith("video/")
                        ? "MP4"
                        : asset.mimeType.startsWith("audio/")
                          ? "MP3"
                          : "PNG"}
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
