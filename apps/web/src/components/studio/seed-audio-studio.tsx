"use client";

import {
  CreativeLocaleSelector,
  useCreativeLocale,
} from "@/components/studio/creative-locale-selector";
import { sortVoicesForLocale, voiceLocaleMatch } from "@aiwa/generation/locale";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";

type Model = {
  id: string;
  providerModelId: string;
  name: string;
  priceVersionId: string;
  description?: string;
  capabilities?: Record<string, boolean | number | string> | null;
};

type Asset = {
  id: string;
  name: string | null;
  mediaKind: "AUDIO" | "IMAGE";
  durationMs: number | null;
  byteSize: string;
  mimeType?: string;
};

type PresetVoice = {
  key: string;
  displayName: string;
  gender?: "female" | "male";
  locale: string;
  language: string;
  scenario?: string;
  style?: string;
  supportedModels: string[];
  previewUrl?: string;
};

type Quote = {
  quoteToken: string;
  reservationCredits: string;
  estimatedCredits: string;
  priceVersionId: string;
};

type Mode = "CREATE" | "MATCH" | "IMAGE" | "LONG";
type ReferenceMode = "CLIPS" | "VOICES";
type AudioFormat = "wav" | "mp3" | "pcm" | "ogg_opus";
type SampleRate = 8000 | 16000 | 24000 | 32000 | 44100 | 48000;

export type SeedAudioInitialTake = {
  sourceText: string;
  workflow: Mode;
  duration: number;
  speechRate: number;
  loudnessRate: number;
  pitch: number;
  subtitles: boolean;
  language: (typeof LANGUAGES)[number][0];
  directorPreset: string;
  format: AudioFormat;
  sampleRate: SampleRate;
  referenceAudioAssetIds: string[];
  referenceVoiceKeys: string[];
  referenceImageAssetId: string;
  parentGenerationId: string;
};

const WORKFLOWS: readonly {
  value: Mode;
  title: string;
  detail: string;
  icon: IconName;
  badge: string;
}[] = [
  {
    value: "CREATE",
    title: "Audio Director",
    detail:
      "Direct voice, mood, timbre and atmosphere from one creative brief.",
    icon: "wand",
    badge: "Prompt-led",
  },
  {
    value: "MATCH",
    title: "Match a voice",
    detail: "Guide the result with up to three clips or verified saved voices.",
    icon: "voice",
    badge: "References",
  },
  {
    value: "IMAGE",
    title: "Image to voice",
    detail: "Let one visual reference shape the character and delivery.",
    icon: "image",
    badge: "Visual",
  },
  {
    value: "LONG",
    title: "Long-form narrator",
    detail:
      "Produce up to five minutes with automatic continuity, normalization and seamless stitching.",
    icon: "story",
    badge: "Long form",
  },
];

const DIRECTOR_PRESETS: readonly {
  id: string;
  title: string;
  detail: string;
  directive: string;
  icon: IconName;
}[] = [
  {
    id: "documentary",
    title: "Documentary",
    detail: "Measured, intimate and cinematic",
    directive:
      "Create a polished documentary performance with measured pacing, believable warmth, clean diction, and subtle cinematic presence.",
    icon: "director",
  },
  {
    id: "commercial",
    title: "Commercial",
    detail: "Bright, crisp and persuasive",
    directive:
      "Create a premium commercial performance that feels bright, confident, concise, and naturally persuasive without sounding exaggerated.",
    icon: "sparkles",
  },
  {
    id: "podcast",
    title: "Podcast",
    detail: "Close, relaxed and conversational",
    directive:
      "Create a close-mic podcast-style performance with relaxed conversational pacing, natural breaths, and an approachable tone.",
    icon: "chat",
  },
  {
    id: "character",
    title: "Character",
    detail: "Expressive and personality-led",
    directive:
      "Create an expressive character performance with a distinct personality, clear emotional intent, and believable vocal mannerisms.",
    icon: "user",
  },
  {
    id: "cinematic",
    title: "Cinematic",
    detail: "Dramatic, textured and atmospheric",
    directive:
      "Create a cinematic vocal performance with dramatic restraint, textured timbre, intentional pauses, and atmospheric depth.",
    icon: "video",
  },
  {
    id: "calm",
    title: "Calm",
    detail: "Soft, slow and reassuring",
    directive:
      "Create a calm reassuring performance with soft dynamics, unhurried pacing, gentle emphasis, and a grounded natural timbre.",
    icon: "voice",
  },
];

const LANGUAGES = [
  ["auto", "Auto detect"],
  ["English", "English"],
  ["Chinese", "Chinese"],
  ["Japanese", "Japanese"],
  ["Korean", "Korean"],
  ["Spanish", "Spanish"],
  ["German", "German"],
  ["Portuguese", "Portuguese"],
  ["French", "French"],
  ["Thai", "Thai"],
  ["Vietnamese", "Vietnamese"],
  ["Indonesian", "Indonesian"],
  ["Malay", "Malay"],
  ["Filipino", "Filipino"],
  ["Italian", "Italian"],
  ["Russian", "Russian"],
  ["Dutch", "Dutch"],
  ["Polish", "Polish"],
  ["Turkish", "Turkish"],
  ["Swedish", "Swedish"],
] as const;

const OUTPUT_PROFILES: readonly {
  id: string;
  title: string;
  detail: string;
  format: AudioFormat;
  sampleRate: SampleRate;
  icon: IconName;
}[] = [
  {
    id: "web",
    title: "Web voiceover",
    detail: "MP3 · 44.1 kHz",
    format: "mp3",
    sampleRate: 44100,
    icon: "globe",
  },
  {
    id: "studio",
    title: "Studio master",
    detail: "WAV · 48 kHz",
    format: "wav",
    sampleRate: 48000,
    icon: "sparkles",
  },
  {
    id: "compact",
    title: "Compact",
    detail: "Opus · 48 kHz",
    format: "ogg_opus",
    sampleRate: 48000,
    icon: "assets",
  },
  {
    id: "raw",
    title: "Raw PCM",
    detail: "PCM · 24 kHz",
    format: "pcm",
    sampleRate: 24000,
    icon: "settings",
  },
];

const FORMAT_LABELS: Record<AudioFormat, string> = {
  wav: "WAV",
  mp3: "MP3",
  pcm: "PCM",
  ogg_opus: "OGG Opus",
};

function secondsLabel(ms: number | null): string {
  if (!ms) return "Duration unavailable";
  return `${Math.max(1, Math.round(ms / 1000))}s`;
}

export function SeedAudioStudio({
  organizationId,
  organizationSlug,
  canGenerate,
  initialTake,
}: {
  organizationId: string;
  organizationSlug: string;
  canGenerate: boolean;
  initialTake?: SeedAudioInitialTake | null;
}) {
  const [localeIntent, setLocaleIntent] = useCreativeLocale(organizationId);
  const [model, setModel] = useState<Model | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [voices, setVoices] = useState<PresetVoice[]>([]);
  const [script, setScript] = useState(initialTake?.sourceText ?? "");
  const [mode, setMode] = useState<Mode>(initialTake?.workflow ?? "CREATE");
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>(
    initialTake?.referenceVoiceKeys.length ? "VOICES" : "CLIPS",
  );
  const [audioIds, setAudioIds] = useState<string[]>(
    initialTake?.referenceAudioAssetIds ?? [],
  );
  const [referenceVoiceKeys, setReferenceVoiceKeys] = useState<string[]>(
    initialTake?.referenceVoiceKeys ?? [],
  );
  const [imageId, setImageId] = useState(
    initialTake?.referenceImageAssetId ?? "",
  );
  const [duration, setDuration] = useState(initialTake?.duration ?? 30);
  const [speechRate, setSpeechRate] = useState(initialTake?.speechRate ?? 1);
  const [loudnessRate, setLoudnessRate] = useState(
    initialTake?.loudnessRate ?? 1,
  );
  const [pitch, setPitch] = useState(initialTake?.pitch ?? 0);
  const [subtitles, setSubtitles] = useState(initialTake?.subtitles ?? true);
  const [language, setLanguage] = useState<(typeof LANGUAGES)[number][0]>(
    initialTake?.language ?? "auto",
  );
  const [directorPreset, setDirectorPreset] = useState(
    initialTake?.directorPreset ?? "documentary",
  );
  const [outputProfile, setOutputProfile] = useState(
    initialTake
      ? (OUTPUT_PROFILES.find(
          (profile) =>
            profile.format === initialTake.format &&
            profile.sampleRate === initialTake.sampleRate,
        )?.id ?? "custom")
      : "web",
  );
  const [format, setFormat] = useState<AudioFormat>(
    initialTake?.format ?? "mp3",
  );
  const [sampleRate, setSampleRate] = useState<SampleRate>(
    initialTake?.sampleRate ?? 44100,
  );
  const [assetQuery, setAssetQuery] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteKey, setQuoteKey] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastJobId, setLastJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch(
        `/api/generations?organizationId=${encodeURIComponent(organizationId)}`,
        { signal: controller.signal },
      ).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Studio unavailable.");
        return data;
      }),
      fetch(
        `/api/assets?organizationId=${encodeURIComponent(organizationId)}&limit=100`,
        { signal: controller.signal },
      ).then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Asset library unavailable.");
        return data;
      }),
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
        setVoices(
          (studio.voices ?? []).filter((voice: PresetVoice) =>
            voice.supportedModels?.includes("seed-audio-1.0"),
          ),
        );
        setLoadError(null);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load Seed Audio Studio.",
          );
      });
    return () => controller.abort();
  }, [organizationId]);

  const selectedPreset =
    DIRECTOR_PRESETS.find((preset) => preset.id === directorPreset) ??
    DIRECTOR_PRESETS[0]!;
  const selectedAudioAssets = audioIds
    .map((id) => assets.find((asset) => asset.id === id))
    .filter((asset): asset is Asset => Boolean(asset));
  const rankedVoices = useMemo(() => sortVoicesForLocale(voices, localeIntent), [voices, localeIntent]);
  const selectedVoices = referenceVoiceKeys
    .map((key) => voices.find((voice) => voice.key === key))
    .filter((voice): voice is PresetVoice => Boolean(voice));

  const providerPrompt = useMemo(() => {
    const text = script.trim();
    if (!text || mode === "IMAGE") return text;

    const languageDirection =
      language === "auto" ? "" : ` Perform in ${language}.`;
    const referenceCount =
      mode === "LONG"
        ? referenceVoiceKeys.length
        : referenceMode === "CLIPS"
          ? audioIds.length
          : referenceVoiceKeys.length;
    const referenceDirection =
      (mode === "MATCH" || mode === "LONG") && referenceCount > 0
        ? ` Use ${Array.from(
            { length: referenceCount },
            (_, index) => `@Audio${index + 1}`,
          ).join(
            referenceCount === 2 ? " and " : ", ",
          )} as the vocal reference${referenceCount > 1 ? "s" : ""}.`
        : "";
    const longDirection =
      mode === "LONG"
        ? " Keep vocal identity and delivery consistent across the full narration."
        : "";

    return `${selectedPreset.directive}${languageDirection}${referenceDirection}${longDirection}\n\n${text}`.trim();
  }, [
    script,
    mode,
    language,
    selectedPreset.directive,
    referenceMode,
    audioIds.length,
    referenceVoiceKeys.length,
  ]);

  const promptLimit = mode === "LONG" ? 7_500 : 3_000;
  const promptTooLong = providerPrompt.length > promptLimit;
  const activeAudioReferenceCount =
    mode === "LONG"
      ? referenceVoiceKeys.length
      : referenceMode === "CLIPS"
        ? audioIds.length
        : referenceVoiceKeys.length;
  const referenceReady = mode !== "MATCH" || activeAudioReferenceCount > 0;
  const imageReady = mode !== "IMAGE" || Boolean(imageId);

  const quoteRequest = useMemo(
    () => ({
      organizationId,
      localeIntent,
      modelId: model?.id,
      task: "seed-audio" as const,
      longForm: mode === "LONG",
      text: providerPrompt,
      estimatedDurationSeconds: duration,
      referenceAudioAssetIds:
        mode === "MATCH" && referenceMode === "CLIPS" ? audioIds : [],
      referenceVoiceKeys:
        mode === "LONG"
          ? referenceVoiceKeys.slice(0, 1)
          : mode === "MATCH" && referenceMode === "VOICES"
            ? referenceVoiceKeys
            : [],
      referenceImageAssetId:
        mode === "IMAGE" ? imageId || undefined : undefined,
    }),
    [
      organizationId,
      localeIntent,
      model?.id,
      providerPrompt,
      duration,
      mode,
      referenceMode,
      audioIds,
      referenceVoiceKeys,
      imageId,
    ],
  );
  const requestKey = JSON.stringify(quoteRequest);
  const activeQuote = quoteKey === requestKey ? quote : null;

  useEffect(() => {
    if (
      !model ||
      !providerPrompt ||
      promptTooLong ||
      !referenceReady ||
      !imageReady
    )
      return;
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
            setQuoteError(null);
          })
          .catch((error) => {
            if (!controller.signal.aborted) {
              setQuote(null);
              setQuoteKey(null);
              setQuoteError(
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
  }, [
    model,
    requestKey,
    providerPrompt,
    promptTooLong,
    referenceReady,
    imageReady,
  ]);

  function chooseMode(next: Mode) {
    setMode(next);
    setAudioIds([]);
    setReferenceVoiceKeys([]);
    setImageId("");
    setAssetQuery("");
    if (next === "LONG") {
      setDuration((current) => Math.max(current, 60));
      if (format === "pcm") {
        setFormat("wav");
        setSampleRate(48_000);
        setOutputProfile("studio");
      }
    }
  }

  function toggleAudio(id: string) {
    setReferenceVoiceKeys([]);
    setReferenceMode("CLIPS");
    setAudioIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < 3
          ? [...current, id]
          : current,
    );
  }

  function toggleVoice(key: string) {
    setAudioIds([]);
    setReferenceMode("VOICES");
    setReferenceVoiceKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : current.length < 3
          ? [...current, key]
          : current,
    );
  }

  function toggleLongVoice(key: string) {
    setAudioIds([]);
    setReferenceMode("VOICES");
    setReferenceVoiceKeys((current) => (current[0] === key ? [] : [key]));
  }

  function applyOutputProfile(profile: (typeof OUTPUT_PROFILES)[number]) {
    setOutputProfile(profile.id);
    setFormat(profile.format);
    setSampleRate(profile.sampleRate);
  }

  async function generate() {
    if (
      !canGenerate ||
      !model ||
      !activeQuote ||
      busy ||
      !providerPrompt ||
      promptTooLong ||
      !referenceReady ||
      !imageReady
    )
      return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          modelId: model.id,
          task: "seed-audio",
          localeIntent,
          longForm: mode === "LONG",
          workflow: mode,
          sourceText: script.trim(),
          directorPreset,
          language,
          parentGenerationId: initialTake?.parentGenerationId || undefined,
          textPrompt: providerPrompt,
          estimatedDurationSeconds: duration,
          referenceAudioAssetIds:
            mode === "MATCH" && referenceMode === "CLIPS" ? audioIds : [],
          referenceVoiceKeys:
            mode === "LONG"
              ? referenceVoiceKeys.slice(0, 1)
              : mode === "MATCH" && referenceMode === "VOICES"
                ? referenceVoiceKeys
                : [],
          referenceImageAssetId:
            mode === "IMAGE" ? imageId || undefined : undefined,
          priceVersionId: model.priceVersionId,
          quoteToken: activeQuote.quoteToken,
          idempotencyKey: crypto.randomUUID(),
          format,
          sampleRate,
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
        "Seed Audio is generating in the background. The result will be stored in your asset library.",
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

  const normalizedAssetQuery = assetQuery.trim().toLowerCase();
  const audioAssets = assets.filter(
    (asset) =>
      asset.mediaKind === "AUDIO" &&
      (asset.name ?? "audio asset")
        .toLowerCase()
        .includes(normalizedAssetQuery),
  );
  const imageAssets = assets.filter(
    (asset) =>
      asset.mediaKind === "IMAGE" &&
      (asset.name ?? "image asset")
        .toLowerCase()
        .includes(normalizedAssetQuery),
  );
  const selectedImage = assets.find((asset) => asset.id === imageId);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="min-w-0 space-y-6">
        <CreativeLocaleSelector
          value={localeIntent}
          onChange={setLocaleIntent}
          disabled={busy}
        />
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Choose a workflow
              </p>
              <h2 className="font-display mt-1 text-xl font-semibold">
                What do you want Seed Audio to create?
              </h2>
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
            {WORKFLOWS.map((workflow) => {
              const selected = mode === workflow.value;
              return (
                <button
                  key={workflow.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => chooseMode(workflow.value)}
                  className={`group relative min-h-40 overflow-hidden rounded-3xl border p-5 text-left transition focus-visible:outline-2 focus-visible:outline-ring ${
                    selected
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border bg-background/70 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
                  }`}
                >
                  <Icon
                    name={workflow.icon}
                    className="pointer-events-none absolute -bottom-5 -right-3 size-28 text-primary/5 transition-transform group-hover:-rotate-3 group-hover:scale-105"
                  />
                  <span
                    className={`grid size-12 place-items-center rounded-2xl border ${
                      selected
                        ? "border-primary/20 bg-primary text-primary-foreground"
                        : "border-border bg-muted text-primary"
                    }`}
                  >
                    <Icon name={workflow.icon} className="size-6" />
                  </span>
                  <span className="mt-4 block text-base font-semibold">
                    {workflow.title}
                  </span>
                  <span className="mt-1 block max-w-[28rem] text-sm leading-5 text-muted-foreground">
                    {workflow.detail}
                  </span>
                  <span className="mt-3 inline-flex rounded-full bg-muted px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    {workflow.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {mode !== "IMAGE" ? (
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Icon name="director" className="size-5" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  Audio Director
                </p>
                <h2 className="font-display text-xl font-semibold">
                  Choose the performance language
                </h2>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DIRECTOR_PRESETS.map((preset) => {
                const selected = directorPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setDirectorPreset(preset.id)}
                    className={`rounded-2xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-ring ${
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background hover:border-primary/40"
                    }`}
                  >
                    <span className="flex items-start gap-3">
                      <span
                        className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                          selected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-primary"
                        }`}
                      >
                        <Icon name={preset.icon} className="size-5" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold">
                          {preset.title}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {preset.detail}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background text-primary">
                    <Icon name="globe" className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor="seed-audio-language"
                      className="text-sm font-semibold"
                    >
                      Spoken language
                    </label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Auto-detect is safest when the script already establishes
                      the language.
                    </p>
                    <select
                      id="seed-audio-language"
                      value={language}
                      onChange={(event) =>
                        setLanguage(
                          event.target.value as (typeof LANGUAGES)[number][0],
                        )
                      }
                      className="mt-3 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                    >
                      {LANGUAGES.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <p className="text-sm font-semibold">Delivery</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
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
                      className="min-h-12 rounded-xl border border-border bg-background px-2 text-[0.68rem] font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {String(label)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-primary/20 bg-primary/5 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
                <Icon name="image" className="size-5" />
              </span>
              <div>
                <p className="font-semibold">Visual-reference mode</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  The image drives character and delivery. This mode sends only
                  the spoken text in the prompt, so creative-direction presets
                  are intentionally hidden.
                </p>
              </div>
            </div>
          </div>
        )}

        {mode === "LONG" ? (
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  Long-form Producer
                </p>
                <h2 className="font-display mt-1 text-xl font-semibold">
                  One voice, multiple seamless chapters
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Creator keeps the same direction across native Seed Audio
                  calls, loudness-normalizes each chapter, then joins them into
                  one master with a short crossfade.
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                <Icon name="story" className="size-4" />
                Up to 5 minutes
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {Array.from(
                {
                  length:
                    duration <= 120
                      ? 1
                      : Math.min(3, Math.ceil(duration / 105)),
                },
                (_, index) => (
                  <div
                    key={index}
                    className="relative min-h-28 overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.06] p-4"
                  >
                    <Icon
                      name="voice"
                      className="absolute -bottom-4 -right-2 size-20 text-primary/[0.05]"
                    />
                    <span className="grid size-9 place-items-center rounded-xl bg-primary text-xs font-bold text-primary-foreground">
                      {index + 1}
                    </span>
                    <p className="mt-3 text-sm font-semibold">
                      {index === 0
                        ? "Establish voice"
                        : index === 2
                          ? "Finish naturally"
                          : "Continue seamlessly"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Native Seed Audio chapter
                    </p>
                  </div>
                ),
              )}
            </div>

            <div className="mt-5 border-t border-border pt-5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-muted text-primary">
                  <Icon name="voice" className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    Optional voice continuity anchor
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Choose one verified voice to keep identity stable across
                    chapters, or leave blank for prompt-directed narration.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {rankedVoices.slice(0, 8).map((voice) => {
                  const selected = referenceVoiceKeys[0] === voice.key;
                  return (
                    <button
                      key={voice.key}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleLongVoice(voice.key)}
                      className={`relative overflow-hidden rounded-2xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-ring ${
                        selected
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background hover:border-primary/40"
                      }`}
                    >
                      <Icon
                        name="voice"
                        className="absolute -bottom-3 -right-2 size-14 text-primary/[0.05]"
                      />
                      <span className="block truncate text-sm font-semibold">
                        {voice.displayName}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {voice.style || voice.language}
                      </span>
                      {selected ? (
                        <span className="mt-2 inline-flex items-center gap-1 text-[0.68rem] font-semibold text-primary">
                          <Icon name="check" className="size-3.5" />
                          Continuity anchor
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        {mode === "MATCH" ? (
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  Voice references
                </p>
                <h2 className="font-display mt-1 text-xl font-semibold">
                  Pick up to three voices
                </h2>
              </div>
              <div className="inline-flex rounded-2xl border border-border bg-muted/40 p-1">
                {[
                  ["CLIPS", "Audio clips", "assets"],
                  ["VOICES", "Saved voices", "voice"],
                ].map(([value, label, icon]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      const next = value as ReferenceMode;
                      setReferenceMode(next);
                      if (next === "CLIPS") setReferenceVoiceKeys([]);
                      else setAudioIds([]);
                    }}
                    className={`inline-flex min-h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition ${
                      referenceMode === value
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon name={icon as IconName} className="size-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {activeAudioReferenceCount > 0 ? (
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {(referenceMode === "CLIPS"
                  ? selectedAudioAssets.map((asset) => ({
                      key: asset.id,
                      title: asset.name || "Audio reference",
                      detail: secondsLabel(asset.durationMs),
                      icon: "assets" as IconName,
                    }))
                  : selectedVoices.map((voice) => ({
                      key: voice.key,
                      title: voice.displayName,
                      detail: voice.style || voice.language,
                      icon: "voice" as IconName,
                    }))
                ).map((item, index) => (
                  <div
                    key={item.key}
                    className="relative overflow-hidden rounded-2xl border border-primary/30 bg-primary/5 p-4"
                  >
                    <Icon
                      name={item.icon}
                      className="absolute -bottom-3 -right-2 size-16 text-primary/5"
                    />
                    <span className="inline-flex rounded-full bg-primary px-2 py-1 font-mono text-[0.65rem] font-bold text-primary-foreground">
                      @Audio{index + 1}
                    </span>
                    <p className="mt-3 truncate text-sm font-semibold">
                      {item.title}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            {referenceMode === "CLIPS" ? (
              <>
                <div className="relative mt-5">
                  <Icon
                    name="search"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    value={assetQuery}
                    onChange={(event) => setAssetQuery(event.target.value)}
                    placeholder="Search audio clips"
                    className="min-h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {audioAssets.slice(0, 10).map((asset) => {
                    const selected = audioIds.includes(asset.id);
                    const disabled = !selected && audioIds.length >= 3;
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleAudio(asset.id)}
                        className={`flex min-h-20 items-center gap-3 rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          selected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-background hover:border-primary/40"
                        }`}
                      >
                        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-muted text-primary">
                          <Icon name="voice" className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {asset.name || "Audio asset"}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {secondsLabel(asset.durationMs)}
                          </span>
                        </span>
                        {selected ? (
                          <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">
                            <Icon name="check" className="size-4" />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {!audioAssets.length ? (
                  <p className="mt-3 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
                    No matching audio clips. Add a reference in the Asset
                    Library, then return here.
                  </p>
                ) : null}
              </>
            ) : (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {rankedVoices.map((voice) => {
                  const selected = referenceVoiceKeys.includes(voice.key);
                  const disabled = !selected && referenceVoiceKeys.length >= 3;
                  return (
                    <button
                      key={voice.key}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleVoice(voice.key)}
                      className={`relative min-h-32 overflow-hidden rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        selected
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background hover:border-primary/40"
                      }`}
                    >
                      <Icon
                        name="voice"
                        className="absolute -bottom-4 -right-2 size-20 text-primary/5"
                      />
                      <span className="flex items-start gap-3">
                        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-muted text-primary">
                          <Icon
                            name={
                              voice.gender === "female" ? "sparkles" : "user"
                            }
                            className="size-5"
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">
                            {voice.displayName}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {voice.language}
                            {voiceLocaleMatch(voice.locale, localeIntent.language) === "exact" ? " · Locale match" : ""}
                          </span>
                        </span>
                      </span>
                      <span className="mt-3 block text-xs leading-5 text-muted-foreground">
                        {voice.style || voice.scenario || "Verified voice"}
                      </span>
                      {selected ? (
                        <span className="absolute right-3 top-3 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">
                          <Icon name="check" className="size-4" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}

            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Reference order is stable: the first selected voice becomes{" "}
              <span className="font-mono text-foreground">@Audio1</span>, then{" "}
              <span className="font-mono text-foreground">@Audio2</span> and{" "}
              <span className="font-mono text-foreground">@Audio3</span>.
            </p>
          </div>
        ) : null}

        {mode === "IMAGE" ? (
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Icon name="image" className="size-5" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  Character image
                </p>
                <h2 className="font-display text-xl font-semibold">
                  Choose one visual reference
                </h2>
              </div>
            </div>
            <div className="relative mt-5">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                value={assetQuery}
                onChange={(event) => setAssetQuery(event.target.value)}
                placeholder="Search images"
                className="min-h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {imageAssets.slice(0, 12).map((asset) => {
                const selected = imageId === asset.id;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => setImageId(asset.id)}
                    className={`group overflow-hidden rounded-2xl border text-left transition focus-visible:outline-2 focus-visible:outline-ring ${
                      selected
                        ? "border-primary ring-2 ring-primary/20"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <span className="relative block aspect-square overflow-hidden bg-muted">
                      <Image
                        src={`/api/assets/${encodeURIComponent(asset.id)}`}
                        alt={asset.name || "Reference image"}
                        fill
                        unoptimized
                        sizes="(max-width: 640px) 50vw, 220px"
                        className="object-cover transition duration-300 group-hover:scale-[1.03]"
                      />
                      {selected ? (
                        <span className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
                          <Icon name="check" className="size-4" />
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate px-3 py-2 text-xs font-semibold">
                      {asset.name || "Image asset"}
                    </span>
                  </button>
                );
              })}
            </div>
            {!imageAssets.length ? (
              <p className="mt-3 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
                No matching image assets are available.
              </p>
            ) : null}
            {selectedImage ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Selected:{" "}
                <span className="font-semibold text-foreground">
                  {selectedImage.name || "Image asset"}
                </span>
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Icon
                name={mode === "IMAGE" ? "script" : "voice"}
                className="size-5"
              />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {mode === "IMAGE" ? "Spoken text" : "Creative brief & script"}
              </p>
              <h2 className="font-display text-xl font-semibold">
                {mode === "IMAGE"
                  ? "What should the character say?"
                  : "Describe the audio you want"}
              </h2>
            </div>
          </div>

          <textarea
            id="seed-audio-script"
            value={script}
            onChange={(event) => setScript(event.target.value)}
            maxLength={mode === "LONG" ? 7_000 : 3_000}
            rows={mode === "LONG" ? 16 : 10}
            placeholder={
              mode === "IMAGE"
                ? "Type only the words the character should speak…"
                : mode === "MATCH"
                  ? "Write the script or audio brief. Reference guidance is added automatically from your selected @Audio sources…"
                  : mode === "LONG"
                    ? "Paste the narration or long-form script…"
                    : "Describe the scene, performance, timbre, atmosphere, sound effects, and words to speak…"
            }
            className="mt-5 w-full rounded-2xl border border-input bg-background p-4 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span
              className={
                promptTooLong
                  ? "font-semibold text-destructive"
                  : "text-muted-foreground"
              }
            >
              Provider prompt: {providerPrompt.length.toLocaleString()} /{" "}
              {promptLimit.toLocaleString()}
            </span>
            {mode !== "IMAGE" ? (
              <span className="text-muted-foreground">
                Direction is visible and compiled into the Seed Audio prompt.
              </span>
            ) : null}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Icon name="settings" className="size-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Output & delivery
              </p>
              <h2 className="font-display text-xl font-semibold">
                Pick a quality profile
              </h2>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {OUTPUT_PROFILES.map((profile) => {
              const selected = outputProfile === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => applyOutputProfile(profile)}
                  disabled={mode === "LONG" && profile.format === "pcm"}
                  className={`rounded-2xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-ring ${
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:border-primary/40"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <span
                    className={`grid size-10 place-items-center rounded-xl ${
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-primary"
                    }`}
                  >
                    <Icon name={profile.icon} className="size-5" />
                  </span>
                  <span className="mt-3 block text-sm font-semibold">
                    {profile.title}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {profile.detail}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 rounded-2xl border border-border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-semibold">
              Format
              <select
                value={format}
                onChange={(event) => {
                  setFormat(event.target.value as AudioFormat);
                  setOutputProfile("custom");
                }}
                className="mt-2 block min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="mp3">MP3</option>
                <option value="wav">WAV</option>
                <option value="ogg_opus">OGG Opus</option>
                <option value="pcm" disabled={mode === "LONG"}>
                  PCM{mode === "LONG" ? " · native mode only" : ""}
                </option>
              </select>
            </label>

            <label className="text-sm font-semibold">
              Sample rate
              <select
                value={sampleRate}
                onChange={(event) => {
                  setSampleRate(Number(event.target.value) as SampleRate);
                  setOutputProfile("custom");
                }}
                className="mt-2 block min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              >
                {[8000, 16000, 24000, 32000, 44100, 48000].map((rate) => (
                  <option key={rate} value={rate}>
                    {rate === 44100
                      ? "44.1 kHz"
                      : `${Math.round(rate / 1000)} kHz`}
                  </option>
                ))}
              </select>
            </label>

            <div className="sm:col-span-2">
              <p className="text-sm font-semibold">Target duration</p>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {(mode === "LONG"
                  ? [60, 120, 180, 240, 300]
                  : [15, 30, 60, 90, 120]
                ).map((seconds) => (
                  <button
                    key={seconds}
                    type="button"
                    onClick={() => setDuration(seconds)}
                    className={`min-h-11 rounded-xl border text-xs font-semibold transition ${
                      duration === seconds
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {seconds >= 60 ? `${seconds / 60}m` : `${seconds}s`}
                  </button>
                ))}
              </div>
            </div>

            <label className="text-sm font-semibold">
              Pace
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
              Pitch
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
              Volume
              <input
                aria-label="Volume"
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={loudnessRate}
                onChange={(event) =>
                  setLoudnessRate(Number(event.target.value))
                }
                className="mt-4 w-full"
              />
              <span className="text-xs text-muted-foreground">
                {loudnessRate.toFixed(1)}×
              </span>
            </label>

            <button
              type="button"
              aria-pressed={subtitles}
              onClick={() => setSubtitles((value) => !value)}
              className={`flex min-h-20 items-center gap-3 rounded-2xl border p-3 text-left transition ${
                subtitles
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background hover:border-primary/40"
              }`}
            >
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                  subtitles
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-primary"
                }`}
              >
                <Icon name="script" className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold">
                  Word timings
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Persist sentence + word timing metadata
                </span>
              </span>
            </button>
          </div>
        </div>
      </section>

      <aside className="h-fit rounded-3xl border border-border bg-card p-5 shadow-sm xl:sticky xl:top-6">
        <div className="relative overflow-hidden rounded-2xl bg-primary/10 p-4">
          <Icon
            name="voice"
            className="absolute -bottom-5 -right-4 size-24 text-primary/10"
          />
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Seed Audio 1.0
          </p>
          <h2 className="font-display mt-2 text-2xl font-semibold">
            Audio Director
          </h2>
          <p className="mt-2 max-w-[18rem] text-sm leading-6 text-muted-foreground">
            Prompt-directed audio, references, visual character guidance and
            long-form narration in one durable generation flow.
          </p>
        </div>

        {loadError ? (
          <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-3">
            <p className="text-sm font-semibold">Studio unavailable</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {loadError}
            </p>
          </div>
        ) : null}

        <div className="mt-5 rounded-2xl border border-border bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground">Estimated credits</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {activeQuote ? activeQuote.estimatedCredits : "—"}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {activeQuote
              ? `Up to ${activeQuote.reservationCredits} credits may be held. Settlement uses provider-reported original duration.`
              : quoteError ||
                "Complete the required inputs to calculate a fresh quote."}
          </p>
        </div>

        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Workflow</dt>
            <dd className="text-right font-semibold">
              {WORKFLOWS.find((workflow) => workflow.value === mode)?.title}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">References</dt>
            <dd className="font-semibold">
              {mode === "MATCH"
                ? activeAudioReferenceCount
                : mode === "LONG"
                  ? referenceVoiceKeys.length
                    ? "1 voice"
                    : "Prompt only"
                  : mode === "IMAGE"
                    ? imageId
                      ? "1 image"
                      : "None"
                    : "Prompt only"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Target</dt>
            <dd className="font-semibold">{duration}s</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Output</dt>
            <dd className="text-right font-semibold">
              {FORMAT_LABELS[format]} ·{" "}
              {sampleRate === 44100 ? "44.1" : Math.round(sampleRate / 1000)}{" "}
              kHz
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Timings</dt>
            <dd className="font-semibold">{subtitles ? "On" : "Off"}</dd>
          </div>
        </dl>

        {promptTooLong ? (
          <div className="mt-5 rounded-xl border border-destructive/20 bg-destructive/5 p-3">
            <p className="text-xs font-semibold text-foreground">
              Prompt is over the model limit
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Shorten the script or choose a shorter direction before
              generating.
            </p>
          </div>
        ) : null}

        {!canGenerate ? (
          <div className="mt-5 rounded-xl border border-warning/20 bg-warning/5 p-3">
            <p className="text-xs font-semibold text-foreground">
              View-only access
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Your workspace role does not include generation permission.
            </p>
          </div>
        ) : null}

        <Button
          className="mt-5 min-h-12 w-full"
          disabled={
            !canGenerate ||
            !model ||
            !activeQuote ||
            busy ||
            !providerPrompt ||
            promptTooLong ||
            !referenceReady ||
            !imageReady
          }
          onClick={() => void generate()}
        >
          <Icon name="sparkles" className="mr-2 size-4" />
          {busy ? "Starting generation…" : "Generate with Seed Audio"}
        </Button>

        {!referenceReady ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Select at least one clip or saved voice.
          </p>
        ) : !imageReady ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Select one character image.
          </p>
        ) : null}

        {message ? (
          <div className="mt-4 space-y-2" role="status">
            <p className="text-sm leading-6 text-muted-foreground">{message}</p>
            {lastJobId ? (
              <Link
                href={
                  `/app/${encodeURIComponent(organizationSlug)}/history/${encodeURIComponent(lastJobId)}` as Route
                }
                className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                Follow this generation
                <Icon name="arrow" className="size-4" />
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 border-t border-border pt-4">
          <Link
            href={
              `/app/${encodeURIComponent(organizationSlug)}/assets` as Route
            }
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
          >
            <Icon name="assets" className="size-4" />
            Open audio assets
          </Link>
        </div>
      </aside>
    </div>
  );
}
