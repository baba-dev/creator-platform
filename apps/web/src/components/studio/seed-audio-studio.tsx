"use client";

import { useEffect, useMemo, useState } from "react";
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
  estimatedOmr: string;
  priceVersionId: string;
};

export function SeedAudioStudio({
  organizationId,
}: {
  organizationId: string;
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
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
          body: JSON.stringify(request),
          signal: controller.signal,
        })
          .then(async (response) => {
            const data = await response.json();
            if (!response.ok)
              throw new Error(data.error ?? "Quote unavailable.");
            setQuote(data.quote);
            setMessage(null);
          })
          .catch((error) => {
            if (!controller.signal.aborted) {
              setQuote(null);
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
  }, [model, request, script]);

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
    if (!model || !quote || busy) return;
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
          quoteToken: quote.quoteToken,
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
  const modes = [
    ["CREATE", "Create audio", "Prompt-directed performance"],
    ["MATCH", "Match a voice", "Up to three audio references"],
    ["IMAGE", "Image to voice", "One visual delivery reference"],
    ["LONG", "Long-form voiceover", "Narration up to 120 seconds"],
  ] as const;
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="grid gap-3 sm:grid-cols-2">
          {modes.map(([value, title, detail]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                setAudioIds([]);
                setImageId("");
              }}
              className={`min-h-24 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${mode === value ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}
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
        <p className="mt-2 text-xs text-subtle-foreground">
          {script.length.toLocaleString()} / 3,000 characters
        </p>
        {mode === "MATCH" ? (
          <div className="mt-6">
            <h2 className="text-sm font-semibold">
              Reference audio{" "}
              <span className="text-muted-foreground">
                ({audioIds.length}/3)
              </span>
            </h2>
            <div className="mt-3 grid gap-2">
              {audioAssets.length ? (
                audioAssets.map((asset) => (
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
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
        <div className="mt-6 rounded-2xl bg-muted p-4">
          <p className="text-xs text-muted-foreground">Estimated reservation</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {quote ? `${quote.reservationCredits} credits` : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {quote
              ? `Estimated ${quote.estimatedOmr} OMR`
              : "Enter a script to calculate a quote."}
          </p>
        </div>
        <Button
          className="mt-5 w-full"
          disabled={
            !model ||
            !quote ||
            busy ||
            !script.trim() ||
            (mode === "MATCH" && !audioIds.length) ||
            (mode === "IMAGE" && !imageId)
          }
          onClick={() => void generate()}
        >
          {busy ? "Starting generation…" : "Generate audio"}
        </Button>
        {message ? (
          <p className="mt-4 text-sm text-muted-foreground" role="status">
            {message}
          </p>
        ) : null}
      </aside>
    </div>
  );
}
