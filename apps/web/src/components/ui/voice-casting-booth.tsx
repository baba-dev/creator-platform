"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/admin/primitives";
import { AudioWaveformPlayer } from "@/components/ui/audio-waveform-player";

export interface VoiceOption {
  key: string;
  name: string;
  lang: string;
  gender: "female" | "male";
  locale: string;
  style: string;
  archetype: string;
}

export const VERIFIED_VOICES: readonly VoiceOption[] = [
  {
    key: "russell",
    name: "Russell",
    lang: "English (US)",
    gender: "male",
    locale: "en-US",
    style: "Natural, sincere & approachable",
    archetype: "General · Neutral",
  },
  {
    key: "tim",
    name: "Tim",
    lang: "English (US)",
    gender: "male",
    locale: "en-US",
    style: "Clear, versatile & friendly",
    archetype: "General · Friendly",
  },
  {
    key: "dacey",
    name: "Dacey",
    lang: "English (US)",
    gender: "female",
    locale: "en-US",
    style: "Crisp, confident & engaging",
    archetype: "General · Confident",
  },
  {
    key: "joanne",
    name: "Joanne",
    lang: "English (US)",
    gender: "female",
    locale: "en-US",
    style: "Natural, lively & conversational",
    archetype: "General · Conversational",
  },
  {
    key: "skye",
    name: "Skye",
    lang: "English (US)",
    gender: "female",
    locale: "en-US",
    style: "Clear, candid & sincere",
    archetype: "General · Sincere",
  },
  {
    key: "jimmy",
    name: "Jimmy",
    lang: "English (US)",
    gender: "male",
    locale: "en-US",
    style: "Natural, smooth & easygoing",
    archetype: "General · Easygoing",
  },
  {
    key: "adrian",
    name: "Adrian",
    lang: "English (US)",
    gender: "male",
    locale: "en-US",
    style: "Composed, restrained & level-headed",
    archetype: "General · Composed",
  },
  {
    key: "alex",
    name: "Alex",
    lang: "English (US)",
    gender: "male",
    locale: "en-US",
    style: "Warm, clear & composed",
    archetype: "General · Warm",
  },
  {
    key: "margaret",
    name: "Margaret",
    lang: "English (US)",
    gender: "female",
    locale: "en-US",
    style: "Gentle, sincere & unhurried",
    archetype: "General · Gentle",
  },
  {
    key: "marcus",
    name: "Marcus",
    lang: "English (US)",
    gender: "male",
    locale: "en-US",
    style: "Mellow, deep & narrative",
    archetype: "General · Narrative",
  },
  {
    key: "jasper",
    name: "Jasper",
    lang: "English (US)",
    gender: "male",
    locale: "en-US",
    style: "Passionate & high-spirited",
    archetype: "Entertainment · Dynamic",
  },
  {
    key: "charlotte",
    name: "Charlotte",
    lang: "English (UK)",
    gender: "female",
    locale: "en-GB",
    style: "Bright & crisp",
    archetype: "Education · Crisp",
  },
  {
    key: "kayla",
    name: "Kayla",
    lang: "English (US)",
    gender: "female",
    locale: "en-US",
    style: "Enthusiastic & outgoing",
    archetype: "Role play · Outgoing",
  },
  {
    key: "sunny",
    name: "Sunny (Myra)",
    lang: "English (US)",
    gender: "female",
    locale: "en-US",
    style: "Crisp & lively",
    archetype: "Education · Friendly",
  },
  {
    key: "zendaya",
    name: "Zendaya",
    lang: "English (US)",
    gender: "female",
    locale: "en-US",
    style: "Relaxed & approachable",
    archetype: "Education · Warm",
  },
  {
    key: "sharron",
    name: "Sharron",
    lang: "English (US)",
    gender: "female",
    locale: "en-US",
    style: "Gentle & calm",
    archetype: "Narration · Calm",
  },
  {
    key: "dina",
    name: "Dina",
    lang: "Arabic (Egyptian)",
    gender: "female",
    locale: "ar-EG",
    style: "Warm, lively & conversational",
    archetype: "General · Arabic",
  },
  {
    key: "youssef",
    name: "Youssef",
    lang: "Arabic (Egyptian)",
    gender: "male",
    locale: "ar-EG",
    style: "Calm, easygoing & intimate",
    archetype: "General · Arabic",
  },
  {
    key: "vivi",
    name: "Vivi",
    lang: "Chinese (Mandarin)",
    gender: "female",
    locale: "zh-CN",
    style: "Youthful & vibrant",
    archetype: "General · Vibrant",
  },
  {
    key: "xiaohe",
    name: "Xiaohe (Amber)",
    lang: "Chinese (Mandarin)",
    gender: "female",
    locale: "zh-CN",
    style: "Warm & natural",
    archetype: "General · Documentary",
  },
];

export interface VoiceCastingBoothProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVoice: (voiceKey: string, speechRate?: number) => void;
  currentVoiceKey?: string;
  organizationId: string;
  initialTestPhrase?: string;
  characterName?: string;
  presentation?: "modal" | "page";
}

export function VoiceCastingBooth({
  isOpen,
  onClose,
  onSelectVoice,
  currentVoiceKey = "russell",
  organizationId,
  initialTestPhrase = "",
  characterName,
  presentation = "modal",
}: VoiceCastingBoothProps) {
  const [selectedVoice, setSelectedVoice] = useState(currentVoiceKey);
  const [genderFilter, setGenderFilter] = useState<"all" | "female" | "male">(
    "all",
  );
  const [localeFilter, setLocaleFilter] = useState("all");
  const [speechRate, setSpeechRate] = useState(1.0);
  const [testPhrase, setTestPhrase] = useState(
    initialTestPhrase ||
      "Every story begins with a voice that gives life to imagination.",
  );

  // Audition state
  const [auditioningVoice, setAuditioningVoice] = useState<string | null>(null);
  const [auditionAudios, setAuditionAudios] = useState<Record<string, string>>(
    {},
  );
  const [auditionError, setAuditionError] = useState<string | null>(null);

  // Polling ref
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [prevVoiceKey, setPrevVoiceKey] = useState(currentVoiceKey);
  const [prevPhrase, setPrevPhrase] = useState(initialTestPhrase);

  if (currentVoiceKey !== prevVoiceKey) {
    setPrevVoiceKey(currentVoiceKey);
    setSelectedVoice(currentVoiceKey);
  }
  if (initialTestPhrase !== prevPhrase) {
    setPrevPhrase(initialTestPhrase);
    if (initialTestPhrase) {
      setTestPhrase(initialTestPhrase);
    }
  }

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  if (presentation === "modal" && !isOpen) return null;

  const filteredVoices = VERIFIED_VOICES.filter((voice) => {
    if (genderFilter !== "all" && voice.gender !== genderFilter) return false;
    if (localeFilter !== "all" && voice.locale !== localeFilter) return false;
    return true;
  });

  async function handleAuditionVoice(voiceKey: string) {
    if (!testPhrase.trim()) {
      setAuditionError("Please enter a test phrase to audition.");
      return;
    }

    setAuditionError(null);
    setAuditioningVoice(voiceKey);

    try {
      const res = await fetch("/api/voices/audition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          voiceKey,
          text: testPhrase.slice(0, 280),
          speechRate,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to trigger audition.");
      }

      const { jobId } = await res.json();

      // Poll with progressive backoff. A new audition or unmount cancels
      // the pending timer so stale requests cannot update the booth.
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);

      const poll = async (attempt: number): Promise<void> => {
        if (attempt > 30) {
          setAuditioningVoice(null);
          setAuditionError("Audition request timed out. Please try again.");
          return;
        }

        try {
          const pollRes = await fetch(`/api/generation-jobs/${jobId}`, {
            cache: "no-store",
          });
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            const job = pollData.job;

            if (job.status === "SUCCEEDED") {
              setAuditioningVoice(null);
              const assetId =
                job.outputPayload?.assetIds?.[0] ||
                pollData.assets?.[0]?.id ||
                pollData.asset?.id;

              if (assetId) {
                setAuditionAudios((prev) => ({
                  ...prev,
                  [voiceKey]: `/api/assets/${assetId}`,
                }));
              } else {
                setAuditionError(
                  "Audition completed but its audio asset is not ready yet.",
                );
              }
              return;
            }

            if (
              job.status === "FAILED" ||
              job.status === "CANCELLED" ||
              job.status === "MANUAL_REVIEW"
            ) {
              setAuditioningVoice(null);
              setAuditionError(
                job.errorMessage || "Audition synthesis did not complete.",
              );
              return;
            }
          }
        } catch {
          // Transient polling failures are retried with backoff.
        }

        const delayMs = Math.min(1500 + attempt * 250, 5000);
        pollTimerRef.current = setTimeout(() => {
          void poll(attempt + 1);
        }, delayMs);
      };

      void poll(1);
    } catch (err) {
      setAuditioningVoice(null);
      setAuditionError(err instanceof Error ? err.message : "Audition failed.");
    }
  }

  return (
    <div
      className={
        presentation === "modal"
          ? "fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-md"
          : "w-full"
      }
      onMouseDown={presentation === "modal" ? onClose : undefined}
    >
      <div
        role={presentation === "modal" ? "dialog" : "region"}
        aria-modal={presentation === "modal" ? true : undefined}
        aria-label="Voice Audition & Casting Booth"
        onMouseDown={(e) => e.stopPropagation()}
        className={
          presentation === "modal"
            ? "flex max-h-[92vh] w-full max-w-4xl flex-col rounded-3xl border border-border bg-card shadow-xl"
            : "flex w-full flex-col rounded-3xl border border-border bg-card shadow-sm"
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Icon name="voice" className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-semibold text-foreground">
                  Voice Casting Booth
                </h2>
                <StatusBadge tone="info">Seed Speech TTS 2.0</StatusBadge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {characterName
                  ? `Audition and cast the verified voice for character “${characterName}”`
                  : "Audition verified BytePlus Seed-TTS voices on-the-fly"}
              </p>
            </div>
          </div>

          {presentation === "modal" ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <span className="text-xl leading-none">&times;</span>
            </button>
          ) : null}
        </div>

        {/* Test Phrase & Speed Controls */}
        <div className="border-b border-border bg-surface-sunken/40 px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex-1 text-xs font-semibold text-foreground">
              Audition Line (Synthesize on-the-fly)
              <input
                type="text"
                value={testPhrase}
                onChange={(e) => setTestPhrase(e.target.value)}
                maxLength={280}
                placeholder="Enter custom sentence to audition..."
                className="mt-1 block h-10 w-full rounded-xl border border-input bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>

            <div className="flex items-center gap-4">
              <label className="text-xs font-semibold text-foreground">
                Speech Rate: <span className="font-mono">{speechRate}x</span>
                <input
                  type="range"
                  min="0.5"
                  max="1.8"
                  step="0.1"
                  value={speechRate}
                  onChange={(e) =>
                    setSpeechRate(Number.parseFloat(e.target.value))
                  }
                  className="mt-2 block w-28 accent-primary"
                />
              </label>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
            <span className="text-[11px] font-semibold text-muted-foreground">
              Filters:
            </span>
            <button
              type="button"
              onClick={() => setGenderFilter("all")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                genderFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              All Genders
            </button>
            <button
              type="button"
              onClick={() => setGenderFilter("female")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                genderFilter === "female"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              Female
            </button>
            <button
              type="button"
              onClick={() => setGenderFilter("male")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                genderFilter === "male"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              Male
            </button>

            <span className="text-muted-foreground/40">|</span>

            <button
              type="button"
              onClick={() => setLocaleFilter("all")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                localeFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              All Locales
            </button>
            <button
              type="button"
              onClick={() => setLocaleFilter("en-US")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                localeFilter === "en-US"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              English (US)
            </button>
            <button
              type="button"
              onClick={() => setLocaleFilter("en-GB")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                localeFilter === "en-GB"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              English (UK)
            </button>
            <button
              type="button"
              onClick={() => setLocaleFilter("zh-CN")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                localeFilter === "zh-CN"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              Chinese
            </button>
            <button
              type="button"
              onClick={() => setLocaleFilter("ar-EG")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                localeFilter === "ar-EG"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              Arabic
            </button>
          </div>
        </div>

        {/* Audition Notice / Error */}
        {auditionError && (
          <div className="mx-6 mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {auditionError}
          </div>
        )}

        {/* Voice Cards Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {filteredVoices.map((voice) => {
              const isSelected = selectedVoice === voice.key;
              const isAuditioning = auditioningVoice === voice.key;
              const audioSrc = auditionAudios[voice.key];

              return (
                <div
                  key={voice.key}
                  className={`flex flex-col justify-between rounded-2xl border p-4.5 transition ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-card/60 hover:border-border/80"
                  }`}
                >
                  <div>
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-xs font-bold text-primary">
                          {voice.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-foreground">
                              {voice.name}
                            </h3>
                            {isSelected && (
                              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {voice.lang} • {voice.gender}
                          </p>
                        </div>
                      </div>

                      <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {voice.archetype}
                      </span>
                    </div>

                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      {voice.style}
                    </p>

                    {/* Audition Waveform Player if synthesized */}
                    {audioSrc ? (
                      <div className="mt-3">
                        <AudioWaveformPlayer
                          src={audioSrc}
                          speakerName={voice.name}
                          voiceName={voice.archetype}
                          className="p-2.5"
                        />
                      </div>
                    ) : null}
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
                    <button
                      type="button"
                      disabled={isAuditioning}
                      onClick={() => handleAuditionVoice(voice.key)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50"
                    >
                      {isAuditioning ? (
                        <>
                          <span className="size-2 animate-ping rounded-full bg-primary" />
                          <span>Synthesizing...</span>
                        </>
                      ) : (
                        <>
                          <Icon name="voice" className="size-3.5" />
                          <span>Audition Line</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedVoice(voice.key)}
                      className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-muted/40 text-foreground hover:bg-muted"
                      }`}
                    >
                      {isSelected ? "Selected" : "Select"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <div className="text-xs text-muted-foreground">
            Selected:{" "}
            <strong className="text-foreground">
              {VERIFIED_VOICES.find((v) => v.key === selectedVoice)?.name}
            </strong>{" "}
            ({speechRate}x speed)
          </div>

          <div className="flex items-center gap-2.5">
            {presentation === "modal" ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-muted"
              >
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                onSelectVoice(selectedVoice, speechRate);
                if (presentation === "modal") onClose();
              }}
              className="rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90"
            >
              {presentation === "modal" ? "Cast Voice" : "Use in Voice Studio"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
