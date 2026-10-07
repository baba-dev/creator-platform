"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AudioWaveformPlayer } from "@/components/ui/audio-waveform-player";
import { Icon } from "@/components/ui/icon";

type TimedItem = { startMs: number; endMs: number; text: string };

export type SeedAudioResultWorkspaceProps = {
  organizationSlug: string;
  jobId: string;
  asset: {
    id: string;
    name: string | null;
    mimeType: string;
    durationMs: number | null;
  };
  request: {
    sourceText: string;
    workflow: string;
    directorPreset: string | null;
    language: string | null;
    format: string | null;
    sampleRate: number | null;
  };
  result: {
    originalDurationSeconds: number | null;
    playbackDurationSeconds: number | null;
    subtitle: {
      text: string;
      sentences: TimedItem[];
      words: TimedItem[];
    } | null;
    longForm: {
      segmentCount: number;
      segmentDurationsSeconds: number[];
      crossfadeMs: number;
    } | null;
  } | null;
  takes: Array<{
    id: string;
    status: string;
    createdAt: string;
    workflow: string;
    asset: {
      id: string;
      name: string | null;
      mimeType: string;
      durationMs: number | null;
    } | null;
  }>;
};

function clock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function srtClock(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor(ms / 60_000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  const millis = ms % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function vttClock(ms: number): string {
  return srtClock(ms).replace(",", ".");
}

function safeStem(value: string | null): string {
  const normalized = (value || "seed-audio")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || "seed-audio";
}

function extensionForMime(mime: string): string {
  if (mime === "audio/wav") return "wav";
  if (mime === "audio/ogg") return "ogg";
  if (mime === "audio/L16" || mime === "audio/pcm") return "pcm";
  return "mp3";
}

export function SeedAudioResultWorkspace({
  organizationSlug,
  jobId,
  asset,
  request,
  result,
  takes,
}: SeedAudioResultWorkspaceProps) {
  const [seekNonce, setSeekNonce] = useState(0);
  const [seekSeconds, setSeekSeconds] = useState(0);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const transcript = result?.subtitle;
  const stem = safeStem(asset.name);
  const audioSrc = `/api/assets/${encodeURIComponent(asset.id)}`;

  const activeSentence = useMemo(
    () =>
      transcript?.sentences.find(
        (sentence) =>
          currentSeconds * 1000 >= sentence.startMs &&
          currentSeconds * 1000 < sentence.endMs,
      ) ?? null,
    [currentSeconds, transcript],
  );

  function seek(ms: number) {
    setSeekSeconds(ms / 1000);
    setSeekNonce((value) => value + 1);
  }

  function downloadText(kind: "txt" | "srt" | "vtt") {
    if (!transcript) return;
    let body = transcript.text || request.sourceText;
    let mime = "text/plain;charset=utf-8";
    if (kind === "srt") {
      body = transcript.sentences
        .map(
          (sentence, index) =>
            `${index + 1}\n${srtClock(sentence.startMs)} --> ${srtClock(sentence.endMs)}\n${sentence.text}\n`,
        )
        .join("\n");
      mime = "application/x-subrip;charset=utf-8";
    } else if (kind === "vtt") {
      body =
        "WEBVTT\n\n" +
        transcript.sentences
          .map(
            (sentence) =>
              `${vttClock(sentence.startMs)} --> ${vttClock(sentence.endMs)}\n${sentence.text}\n`,
          )
          .join("\n");
      mime = "text/vtt;charset=utf-8";
    }
    const url = URL.createObjectURL(new Blob([body], { type: mime }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${stem}.${kind}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="relative border-b border-border bg-primary/[0.06] p-5 sm:p-7">
        <Icon
          name="voice"
          className="pointer-events-none absolute -bottom-10 -right-6 size-40 text-primary/[0.05]"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
              Audio Results Workspace
            </p>
            <h2 className="font-display mt-2 text-2xl font-semibold sm:text-3xl">
              Listen, inspect and refine this take
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Review the master waveform, jump through timed dialogue, export
              captions, or send the same creative setup back to Audio Director
              for another take.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`${audioSrc}?download=1`}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Icon name="upload" className="size-4 rotate-180" />
              Download master
            </a>
            <Link
              href={`/app/${encodeURIComponent(organizationSlug)}/audio?sourceJobId=${encodeURIComponent(jobId)}`}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3.5 text-xs font-semibold transition hover:border-primary/40"
            >
              <Icon name="sparkles" className="size-4 text-primary" />
              New take
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:p-7 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
          <AudioWaveformPlayer
            src={audioSrc}
            title={asset.name ?? "Seed Audio master"}
            voiceName={request.directorPreset ?? undefined}
            downloadName={`${stem}.${extensionForMime(asset.mimeType)}`}
            seekRequest={{ seconds: seekSeconds, nonce: seekNonce }}
            onTimeChange={setCurrentSeconds}
            className="bg-background"
          />

          {transcript?.sentences.length ? (
            <div className="rounded-3xl border border-border bg-background p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Timed transcript
                  </p>
                  <h3 className="font-display mt-1 text-xl font-semibold">
                    Click a line to hear it
                  </h3>
                </div>
                <div className="flex gap-2">
                  {(["txt", "srt", "vtt"] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => downloadText(kind)}
                      className="min-h-9 rounded-xl border border-border bg-card px-3 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                    >
                      {kind}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 max-h-[30rem] space-y-2 overflow-y-auto pr-1">
                {transcript.sentences.map((sentence, index) => {
                  const active =
                    activeSentence?.startMs === sentence.startMs &&
                    activeSentence?.endMs === sentence.endMs;
                  return (
                    <button
                      key={`${sentence.startMs}-${index}`}
                      type="button"
                      onClick={() => seek(sentence.startMs)}
                      className={`group flex w-full gap-3 rounded-2xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-ring ${
                        active
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <span
                        className={`mt-0.5 inline-flex min-w-12 justify-center rounded-lg px-2 py-1 font-mono text-[0.68rem] ${
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {clock(sentence.startMs)}
                      </span>
                      <span className="text-sm leading-6">
                        {sentence.text}
                      </span>
                    </button>
                  );
                })}
              </div>
              {transcript.words.length ? (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    Word-level timing
                  </p>
                  <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                    {transcript.words.map((word, index) => (
                      <button
                        key={`${word.startMs}-${index}`}
                        type="button"
                        onClick={() => seek(word.startMs)}
                        title={`Jump to ${clock(word.startMs)}`}
                        className="rounded-lg bg-muted px-2 py-1 text-xs text-muted-foreground transition hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {word.text}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border bg-background p-5">
              <p className="font-semibold">Timing data unavailable</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                This take has audio, but the provider did not return a timed
                transcript. You can still download the master or generate a new
                take with word timings enabled.
              </p>
            </div>
          )}

          {takes.length > 1 ? (
            <div>
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Icon name="assets" className="size-5" />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    A/B takes
                  </p>
                  <h3 className="font-display text-xl font-semibold">
                    Compare the creative lineage
                  </h3>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {takes.map((take, index) => {
                  const current = take.id === jobId;
                  return (
                    <Link
                      key={take.id}
                      href={`/app/${encodeURIComponent(organizationSlug)}/history/${encodeURIComponent(take.id)}`}
                      className={`relative overflow-hidden rounded-2xl border p-4 transition focus-visible:outline-2 focus-visible:outline-ring ${
                        current
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background hover:-translate-y-0.5 hover:border-primary/40"
                      }`}
                    >
                      <Icon
                        name="voice"
                        className="absolute -bottom-4 -right-2 size-20 text-primary/[0.05]"
                      />
                      <span className="inline-flex rounded-full bg-muted px-2 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        Take {String.fromCharCode(65 + index)}
                      </span>
                      <p className="mt-3 text-sm font-semibold">
                        {take.workflow.replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {take.status.replaceAll("_", " ")}
                        {take.asset?.durationMs
                          ? ` · ${clock(take.asset.durationMs)}`
                          : ""}
                      </p>
                      {current ? (
                        <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                          <Icon name="check" className="size-3.5" />
                          Current take
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="space-y-3">
          {[
            {
              icon: "story" as const,
              label: "Workflow",
              value: request.workflow.replaceAll("_", " "),
            },
            {
              icon: "director" as const,
              label: "Direction",
              value: request.directorPreset || "Custom",
            },
            {
              icon: "globe" as const,
              label: "Language",
              value: request.language || "Auto detect",
            },
            {
              icon: "settings" as const,
              label: "Master",
              value: `${(request.format || extensionForMime(asset.mimeType)).toUpperCase()} · ${request.sampleRate ? `${request.sampleRate === 44100 ? "44.1" : Math.round(request.sampleRate / 1000)} kHz` : "Provider rate"}`,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-border bg-background p-3"
            >
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon name={item.icon} className="size-4 text-primary" />
                {item.label}
              </span>
              <p className="mt-1 truncate text-sm font-semibold capitalize">
                {item.value}
              </p>
            </div>
          ))}

          {result?.longForm ? (
            <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/10 p-4">
              <Icon
                name="story"
                className="absolute -bottom-4 -right-3 size-20 text-primary/[0.07]"
              />
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                Long-form master
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {result.longForm.segmentCount} segments
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Automatically normalized and joined with{" "}
                {result.longForm.crossfadeMs} ms total crossfade.
              </p>
              <div className="mt-3 flex gap-1">
                {Array.from(
                  { length: result.longForm.segmentCount },
                  (_, index) => (
                    <span
                      key={index}
                      className="h-2 flex-1 rounded-full bg-primary/30"
                    />
                  ),
                )}
              </div>
            </div>
          ) : null}

          <Link
            href={`/app/${encodeURIComponent(organizationSlug)}/audio`}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold transition hover:border-primary/40"
          >
            <Icon name="wand" className="size-4 text-primary" />
            Open Audio Director
          </Link>
        </aside>
      </div>
    </section>
  );
}
