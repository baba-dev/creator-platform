"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

type Model = {
  id: string;
  providerModelId: string;
  name: string;
  priceVersionId: string;
  description?: string;
};
type Asset = {
  id: string;
  name: string | null;
  mediaKind: "AUDIO" | "IMAGE";
  durationMs: number | null;
  byteSize: string;
};
type Quote = {
  quoteToken: string;
  reservationCredits: string;
  estimatedCredits: string;
  priceVersionId: string;
};

export function SeedAudioStudio({
  organizationId,
  organizationSlug,
  canGenerate,
}: {
  organizationId: string;
  organizationSlug: string;
  canGenerate: boolean;
}) {
  const [model, setModel] = useState<Model | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [script, setScript] = useState("");
  const [mode, setMode] = useState<"CREATE" | "MATCH" | "IMAGE" | "LONG">(
    "CREATE",
  );
  const [audioIds, setAudioIds] = useState<string[]>([]);
  const [imageId, setImageId] = useState("");
  const [duration, setDuration] = useState(30);
  const [speechRate, setSpeechRate] = useState(1);
  const [loudnessRate, setLoudnessRate] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [subtitles, setSubtitles] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteKey, setQuoteKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastJobId, setLastJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [assetQuery, setAssetQuery] = useState("");

  useEffect(() => {
    void Promise.all([
      fetch(
        `/api/generations?organizationId=${encodeURIComponent(organizationId)}`,
      ).then((r) => r.json()),
      fetch(
        `/api/assets?organizationId=${encodeURIComponent(organizationId)}&limit=100`,
      ).then((r) => r.json()),
    ])
      .then(([studio, library]) => {
        const next =
          studio.models?.find(
            (candidate: Model) =>
              candidate.providerModelId === "seed-audio-1.0",
          ) ?? null;
        setModel(next);
        setAssets(
          (library.assets ?? []).filter(
            (asset: Asset) =>
              asset.mediaKind === "AUDIO" || asset.mediaKind === "IMAGE",
          ),
        );
      })
      .catch(() => setMessage("Unable to load Seed Audio Studio."));
  }, [organizationId]);

  const request = useMemo(
    () => ({
      organizationId,
      modelId: model?.id,
      task: "seed-audio" as const,
      text: script,
      estimatedDurationSeconds: duration,
      referenceAudioAssetIds: mode === "MATCH" ? audioIds : [],
      referenceImageAssetId:
        mode === "IMAGE" ? imageId || undefined : undefined,
    }),
    [organizationId, model?.id, script, duration, mode, audioIds, imageId],
  );
  const requestKey = JSON.stringify(request);
  const activeQuote = quoteKey === requestKey ? quote : null;

  useEffect(() => {
    if (!model || !script.trim()) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        void fetch("/api/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestKey,
          signal: controller.signal,
        })
          .then(async (response) => {
            const data = await response.json();
            if (!response.ok)
              throw new Error(data.error ?? "Quote unavailable.");
            setQuote(data.quote);
            setQuoteKey(requestKey);
            setMessage(null);
          })
          .catch((error) => {
            if (!controller.signal.aborted) {
              setQuote(null);
              setQuoteKey(null);
              setMessage(
                error instanceof Error ? error.message : "Quote unavailable.",
              );
            }
          }),
      350,
    );
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [model, requestKey, script]);

  function toggleAudio(id: string) {
    setAudioIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < 3
          ? [...current, id]
          : current,
    );
  }
  async function generate() {
    if (!canGenerate || !model || !activeQuote || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...request,
          textPrompt: script,
          priceVersionId: model.priceVersionId,
          quoteToken: activeQuote.quoteToken,
          idempotencyKey: crypto.randomUUID(),
          format: "mp3",
          sampleRate: 44100,
          speechRate,
          loudnessRate,
          pitch,
          enableSubtitles: subtitles,
          watermark: false,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Audio generation could not start.");
      setLastJobId(typeof data.jobId === "string" ? data.jobId : null);
      setMessage(
        "Seed Audio is generating in the background. You can keep working while it finishes.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Audio generation could not start.",
      );
    } finally {
      setBusy(false);
    }
  }
  const audioAssets = assets.filter((asset) => asset.mediaKind === "AUDIO");
  const imageAssets = assets.filter((asset) => asset.mediaKind === "IMAGE");
  const normalizedAssetQuery = assetQuery.trim().toLowerCase();
  const visibleAudioAssets = audioAssets.filter((asset) =>
    (asset.name ?? "audio asset").toLowerCase().includes(normalizedAssetQuery),
  );
  const modes = [
    ["CREATE", "Create audio", "Direct a fresh voice from text"],
    ["MATCH", "Match a voice", "Blend up to three audio references"],
    ["IMAGE", "Image to voice", "Guide character from one visual reference"],
    ["LONG", "Long-form voiceover", "Extended narration up to 120 seconds"],
  ] as const;
  const promptStarters =
    mode === "MATCH"
      ? [
          "Use @Audio1 as the primary voice identity. Keep the delivery natural and conversational. Speak:",
          "Blend @Audio1 for timbre and @Audio2 for pacing. Speak:",
        ]
      : mode === "IMAGE"
        ? [
            "Infer a natural voice and delivery from the visual reference. Speak:",
            "Match the visual mood with a cinematic but believable performance. Speak:",
          ]
        : mode === "LONG"
          ? [
              "Narrate this as a polished documentary voiceover with steady pacing:",
              "Read this as a warm long-form explainer with clear paragraph breaks:",
            ]
          : [
              "Warm documentary delivery with a confident, intimate timbre. Speak:",
              "Bright commercial voice with crisp pacing and a friendly smile. Speak:",
            ];
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Choose a workflow
            </p>
            <p className="mt-1 text-sm text-foreground">
              One model, four focused ways to direct the performance.
            </p>
          </div>
          <span
            className={
              model
                ? "inline-flex min-h-8 items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 text-xs font-semibold text-primary"
                : "inline-flex min-h-8 items-center gap-2 rounded-full border border-border bg-muted px-3 text-xs font-semibold text-muted-foreground"
            }
          >
            <span
              className={
                model
                  ? "size-2 rounded-full bg-primary"
                  : "size-2 rounded-full bg-muted-foreground/40"
              }
            />
            {model ? "Seed Audio ready" : "Checking model"}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {modes.map(([value, title, detail]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
                setAudioIds([]);
                setImageId("");
                setAssetQuery("");
                if (value === "LONG") {
                  setDuration((current) => Math.max(current, 60));
                }
              }}
              className={`min-h-28 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${mode === value ? "border-primary bg-primary/10 shadow-xs" : "border-border bg-background/60 hover:border-primary/40 hover:bg-muted/30"}`}
            >
              <span className="flex items-center gap-2 font-semibold">
                <Icon
                  name={
                    value === "IMAGE"
                      ? "image"
                      : value === "MATCH"
                        ? "voice"
                        : "sparkles"
                  }
                  className="size-5 text-primary"
                />
                {title}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {detail}
              </span>
            </button>
          ))}
        </div>
        <label
          className="mt-6 block text-sm font-semibold"
          htmlFor="seed-audio-script"
        >
          Script or direction
        </label>
        <textarea
          id="seed-audio-script"
          value={script}
          onChange={(event) => setScript(event.target.value)}
          maxLength={3000}
          rows={10}
          placeholder="Describe the performance, timbre, pacing, and the words to speak…"
          className="mt-2 w-full rounded-2xl border border-input bg-background p-4 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-subtle-foreground">
            {script.length.toLocaleString()} / 3,000 characters
          </p>
          <div className="flex flex-wrap gap-2">
            {promptStarters.map((starter, index) => (
              <button
                key={starter}
                type="button"
                onClick={() =>
                  setScript((current) =>
                    current.trim()
                      ? `${current.trim()}\n\n${starter}`
                      : starter,
                  )
                }
                className="min-h-8 rounded-full border border-border bg-background px-3 text-[0.6875rem] font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                {index === 0 ? "Add direction" : "Add alternate style"}
              </button>
            ))}
          </div>
        </div>
        {mode === "MATCH" ? (
          <div className="mt-6">
            <h2 className="text-sm font-semibold">
              Reference audio{" "}
              <span className="text-muted-foreground">
                ({audioIds.length}/3)
              </span>
            </h2>
            <div className="relative mt-3">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                value={assetQuery}
                onChange={(event) => setAssetQuery(event.target.value)}
                placeholder="Search reference audio"
                className="min-h-10 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="mt-3 grid gap-2">
              {visibleAudioAssets.length ? (
                visibleAudioAssets.slice(0, 8).map((asset) => (
                  <label
                    key={asset.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 hover:border-primary/40"
                  >
                    <input
                      type="checkbox"
                      checked={audioIds.includes(asset.id)}
                      onChange={() => toggleAudio(asset.id)}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {asset.name || "Audio asset"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {asset.durationMs
                        ? `${Math.round(asset.durationMs / 1000)}s`
                        : ""}
                    </span>
                  </label>
                ))
              ) : (
                <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
                  Upload an audio asset in the library to match a voice.
                </p>
              )}
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Mention <span className="font-mono text-foreground">@Audio1</span>
              , <span className="font-mono text-foreground">@Audio2</span>, or{" "}
              <span className="font-mono text-foreground">@Audio3</span> in the
              direction to use each selected reference in order.
            </p>
          </div>
        ) : null}
        {mode === "IMAGE" ? (
          <div className="mt-6">
            <label
              className="block text-sm font-semibold"
              htmlFor="seed-audio-image"
            >
              Reference image
            </label>
            <select
              id="seed-audio-image"
              value={imageId}
              onChange={(event) => setImageId(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="">Choose an image</option>
              {imageAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name || "Image asset"}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="mt-6 rounded-2xl border border-border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Delivery presets</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Start with a balanced profile, then fine-tune pace, pitch, and
                volume below.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ["Natural", 1, 1, 0],
                ["Intimate", 0.9, 0.9, -1],
                ["Energetic", 1.15, 1.1, 1],
              ].map(([label, pace, volume, nextPitch]) => (
                <button
                  key={String(label)}
                  type="button"
                  onClick={() => {
                    setSpeechRate(Number(pace));
                    setLoudnessRate(Number(volume));
                    setPitch(Number(nextPitch));
                  }}
                  className="min-h-9 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {String(label)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-semibold">
            Duration{" "}
            <select
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
              className="mt-2 block min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
            >
              {[15, 30, 60, 90, 120].map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds} seconds
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Pace{" "}
            <input
              aria-label="Pace"
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={speechRate}
              onChange={(event) => setSpeechRate(Number(event.target.value))}
              className="mt-4 w-full"
            />
            <span className="text-xs text-muted-foreground">
              {speechRate.toFixed(1)}×
            </span>
          </label>
          <label className="text-sm font-semibold">
            Pitch{" "}
            <input
              aria-label="Pitch"
              type="range"
              min="-12"
              max="12"
              value={pitch}
              onChange={(event) => setPitch(Number(event.target.value))}
              className="mt-4 w-full"
            />
            <span className="text-xs text-muted-foreground">
              {pitch > 0 ? "+" : ""}
              {pitch} semitones
            </span>
          </label>
          <label className="text-sm font-semibold">
            Volume{" "}
            <input
              aria-label="Volume"
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={loudnessRate}
              onChange={(event) => setLoudnessRate(Number(event.target.value))}
              className="mt-4 w-full"
            />
            <span className="text-xs text-muted-foreground">
              {loudnessRate.toFixed(1)}×
            </span>
          </label>
        </div>
        <label className="mt-5 flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={subtitles}
            onChange={(event) => setSubtitles(event.target.checked)}
          />{" "}
          Include word-level timestamps
        </label>
      </section>
      <aside className="h-fit rounded-3xl border border-border bg-card p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Advanced voiceover
        </p>
        <h2 className="font-display mt-3 text-2xl font-semibold">
          Seed Audio 1.0
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Prompt-directed speech, sound design, and long-form narration in one
          protected generation workflow.
        </p>
        <div className="mt-6 rounded-2xl border border-border bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground">Estimated credits</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {activeQuote ? activeQuote.estimatedCredits : "—"}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {activeQuote
              ? `Up to ${activeQuote.reservationCredits} credits may be held while the job runs. Billing settles from actual provider-reported duration.`
              : "Enter a script to calculate the current quote."}
          </p>
        </div>
        <dl className="mt-5 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Workflow</dt>
            <dd className="font-semibold">
              {modes.find(([value]) => value === mode)?.[1] ?? "Create audio"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Target duration</dt>
            <dd className="font-semibold">{duration}s</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Output</dt>
            <dd className="font-semibold">MP3 · 44.1 kHz</dd>
          </div>
        </dl>
        {!canGenerate ? (
          <div className="mt-5 rounded-xl border border-warning/20 bg-warning/5 p-3">
            <p className="text-xs font-semibold text-foreground">
              View-only access
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Your workspace role does not include permission to create
              generations.
            </p>
          </div>
        ) : null}
        <Button
          className="mt-5 w-full"
          disabled={
            !canGenerate ||
            !model ||
            !activeQuote ||
            busy ||
            !script.trim() ||
            (mode === "MATCH" && !audioIds.length) ||
            (mode === "IMAGE" && !imageId)
          }
          onClick={() => void generate()}
        >
          {busy ? "Starting generation…" : "Generate with Seed Audio"}
        </Button>
        {!canGenerate ? (
          <p className="mt-2 text-center text-xs leading-5 text-muted-foreground">
            Ask a workspace owner to grant generation access.
          </p>
        ) : null}
        {message ? (
          <div className="mt-4 space-y-2" role="status">
            <p className="text-sm text-muted-foreground">{message}</p>
            {lastJobId ? (
              <Link
                href={
                  `/app/${encodeURIComponent(organizationSlug)}/history/${encodeURIComponent(lastJobId)}` as Route
                }
                className="inline-flex min-h-10 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                Follow this generation
              </Link>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
