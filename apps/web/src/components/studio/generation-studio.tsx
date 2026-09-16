"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Annotation, Eyebrow } from "@/components/ui/creative";
import { Icon, type IconName } from "@/components/ui/icon";
import { DemoBadge, StatusDot, Tape } from "@/components/ui/sketch";
import {
  generationKinds,
  getShowcaseModels,
  type GenerationKind,
} from "@/lib/showcase-models";

const taskCopy: Record<
  GenerationKind,
  {
    label: string;
    heading: string;
    icon: IconName;
    placeholder: string;
  }
> = {
  image: {
    label: "Image",
    heading: "Describe your visual",
    icon: "image",
    placeholder:
      "A cinematic launch visual for a premium Omani fragrance, desert twilight, sculpted shadows, editorial photography…",
  },
  video: {
    label: "Video",
    heading: "Describe your story",
    icon: "video",
    placeholder:
      "A sweeping opening shot over Muscat at sunrise, transitioning into a luxury product reveal with natural camera motion…",
  },
  voice: {
    label: "Voice",
    heading: "Write your narration",
    icon: "voice",
    placeholder:
      "Welcome to a new way of creating—where imagination moves from an idea to a finished story in minutes…",
  },
};

const defaults: Record<GenerationKind, string> = {
  image: "seedream-5-lite",
  video: "seedance-2-5",
  voice: "seed-speech-2",
};

const ratios: Record<GenerationKind, readonly string[]> = {
  image: ["1:1", "16:9", "9:16", "4:5"],
  video: ["16:9", "9:16", "1:1"],
  voice: ["English", "Arabic", "Hindi"],
};

export function GenerationStudio({ canGenerate }: { canGenerate: boolean }) {
  const [kind, setKind] = useState<GenerationKind>("image");
  const [selectedModels, setSelectedModels] =
    useState<Record<GenerationKind, string>>(defaults);
  const [selectedRatio, setSelectedRatio] = useState<
    Record<GenerationKind, string>
  >({
    image: "1:1",
    video: "16:9",
    voice: "English",
  });
  const [prompt, setPrompt] = useState("");
  const [enhanced, setEnhanced] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const models = useMemo(() => getShowcaseModels(kind), [kind]);
  const selectedModel =
    models.find((model) => model.id === selectedModels[kind]) ?? models[0];

  if (!selectedModel) {
    return null;
  }

  function selectKind(nextKind: GenerationKind) {
    setKind(nextKind);
    setNotice(null);
  }

  function showPreviewNotice() {
    setNotice(
      canGenerate
        ? "Demo mode is active—no credits were used. Provider submission arrives in the next milestone."
        : "Your role can explore the studio, but generation requires Member or Owner access.",
    );
  }

  return (
    <section
      id="create"
      className="paper-sheet relative overflow-hidden rounded-[28px]"
    >
      <Tape className="-top-1 right-16 z-10 hidden rotate-6 sm:block" />
      <div className="paper-dots absolute inset-0 opacity-35" />
      <div className="relative flex flex-col gap-4 border-b border-border px-5 py-5 sm:px-7 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Eyebrow className="flex items-center gap-2">
            <Icon name="sparkles" className="size-4" /> AI creation studio
          </Eyebrow>
          <h2 className="font-display mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Start with a rough idea.
          </h2>
        </div>

        <div
          className="grid grid-cols-3 rounded-xl border border-border bg-surface-sunken p-1.5"
          role="tablist"
          aria-label="Generation type"
        >
          {generationKinds.map((task) => {
            const config = taskCopy[task];
            const active = task === kind;

            return (
              <button
                key={task}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectKind(task)}
                className={`flex min-w-24 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition sm:min-w-28 ${
                  active
                    ? "bg-card text-primary shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground/90"
                }`}
              >
                <Icon name={config.icon} className="size-4" />
                {config.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative grid xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]">
        <div className="bg-card/65 p-5 sm:p-7 xl:border-r xl:border-border">
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="creation-prompt"
              className="font-display text-base font-semibold text-foreground"
            >
              {taskCopy[kind].heading}
            </label>
            <button
              type="button"
              onClick={() => setEnhanced((value) => !value)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                enhanced
                  ? "border-primary/20 bg-primary/15 text-primary"
                  : "border-transparent text-primary hover:border-primary/15 hover:bg-primary/10"
              }`}
            >
              <Icon name="wand" className="size-3.5" />
              {enhanced ? "Prompt enhanced" : "Enhance with NVIDIA"}
            </button>
          </div>

          <div className="ruled-paper relative mt-3 overflow-hidden rounded-2xl border border-input bg-card/80 shadow-inner transition focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/[0.08]">
            <textarea
              id="creation-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={taskCopy[kind].placeholder}
              className="min-h-36 w-full resize-none bg-transparent px-4 py-4 text-sm leading-[1.8rem] text-foreground outline-none placeholder:text-subtle-foreground sm:min-h-40"
              maxLength={2000}
            />
            <div className="flex items-center justify-between border-t border-border px-3 py-2.5">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-foreground/[0.04] hover:text-foreground/90"
              >
                <Icon name="upload" className="size-4" />
                Add reference
              </button>
              <Annotation className="hidden text-base text-muted-foreground sm:inline-flex">
                words become worlds
              </Annotation>
              <span className="ml-auto text-[11px] tabular-nums text-subtle-foreground">
                {prompt.length} / 2,000
              </span>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Choose a model
              </p>
              <p className="mt-1 text-xs text-subtle-foreground">
                All media is generated through BytePlus
              </p>
            </div>
            <DemoBadge>Catalog preview</DemoBadge>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {models.map((model) => {
              const active = model.id === selectedModel.id;

              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() =>
                    setSelectedModels((current) => ({
                      ...current,
                      [kind]: model.id,
                    }))
                  }
                  className={`group rounded-2xl border p-4 text-left transition duration-200 ${
                    active
                      ? "border-primary/45 bg-primary/[0.08] shadow-sketch ring-4 ring-primary/[0.06]"
                      : "border-border bg-card hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`grid size-8 place-items-center rounded-lg ${
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-foreground/[0.06] text-muted-foreground"
                        }`}
                      >
                        <Icon name={taskCopy[kind].icon} className="size-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {model.name}
                        </p>
                        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle-foreground">
                          {model.provider}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-md border border-border bg-secondary px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                      {model.badge}
                    </span>
                  </div>
                  <p className="mt-3 min-h-10 text-xs leading-5 text-muted-foreground">
                    {model.description}
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[11px]">
                    <span className="font-semibold text-foreground/90">
                      {model.demoRate}
                    </span>
                    <span className="text-subtle-foreground">
                      {model.latency}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold text-muted-foreground">
              {kind === "voice" ? "Language" : "Aspect ratio"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ratios[kind].map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() =>
                    setSelectedRatio((current) => ({
                      ...current,
                      [kind]: ratio,
                    }))
                  }
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    selectedRatio[kind] === ratio
                      ? "border-primary/35 bg-primary/10 text-primary shadow-xs"
                      : "border-border bg-card text-subtle-foreground hover:border-primary/20 hover:text-foreground/90"
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="creative-glow flex min-h-[520px] flex-col bg-background/50 p-5 sm:p-7">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Output preview
              </p>
              <p className="mt-1 text-xs text-subtle-foreground">
                A visual preview of this workflow
              </p>
            </div>
            <StatusDot>Ready</StatusDot>
          </div>

          <div className="paper-grid sketch-frame relative mt-5 flex min-h-80 flex-1 items-center justify-center overflow-hidden rounded-[24px] border border-border bg-surface-sunken p-6">
            {kind === "image" ? <ImagePreview /> : null}
            {kind === "video" ? <VideoPreview /> : null}
            {kind === "voice" ? <VoicePreview /> : null}
          </div>

          <div className="mt-5 rounded-2xl border border-border bg-card/85 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-subtle-foreground">Estimated cost</p>
                <p className="mt-1 text-base font-semibold text-foreground">
                  {selectedModel.demoRate}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-subtle-foreground">Model</p>
                <p className="mt-1 text-xs font-semibold text-foreground/90">
                  {selectedModel.name}
                </p>
              </div>
            </div>
            <Button
              className="mt-4 w-full"
              size="lg"
              type="button"
              onClick={showPreviewNotice}
            >
              <Icon name="sparkles" className="size-4" />
              {canGenerate
                ? `Generate · ${selectedModel.demoCredits} credits`
                : "Preview workflow"}
            </Button>
            <p className="mt-2 text-center text-[10px] leading-4 text-subtle-foreground">
              Indicative demo pricing. Final rates require finance approval.
            </p>
          </div>

          {notice ? (
            <p
              className="mt-3 rounded-xl border border-primary/15 bg-primary/[0.07] px-3 py-2.5 text-xs leading-5 text-primary"
              role="status"
            >
              {notice}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ImagePreview() {
  return (
    <div className="relative aspect-square w-full max-w-[310px] overflow-hidden rounded-[28px] border border-border bg-[linear-gradient(145deg,#12182b_0%,#342059_48%,#c36d45_100%)] shadow-2xl shadow-violet-950/40">
      <div className="absolute -right-14 -top-12 size-52 rounded-full bg-orange-200/70 blur-3xl" />
      <div className="absolute -bottom-16 -left-8 h-44 w-[125%] -rotate-6 rounded-[50%] bg-[#c87852]/70 blur-sm" />
      <div className="absolute bottom-12 left-1/2 h-40 w-20 -translate-x-1/2 rounded-t-[40px] rounded-b-2xl border border-border bg-[linear-gradient(145deg,rgba(255,255,255,.45),rgba(255,255,255,.08))] shadow-[0_30px_60px_rgba(0,0,0,.45)] backdrop-blur-sm">
        <div className="mx-auto mt-5 h-20 w-px bg-on-vivid/35" />
        <p className="mt-3 text-center text-[8px] font-bold tracking-[.35em] text-on-vivid/80">
          AIWA
        </p>
      </div>
      <div className="absolute left-5 top-5">
        <p className="text-[9px] font-bold uppercase tracking-[.25em] text-on-vivid/60">
          Campaign study
        </p>
        <p className="mt-1 text-xl font-medium tracking-tight text-on-vivid">
          Essence of Oman
        </p>
      </div>
      <div className="absolute bottom-4 right-5 text-[8px] font-semibold uppercase tracking-[.22em] text-on-vivid/45">
        Generated concept
      </div>
    </div>
  );
}

function VideoPreview() {
  return (
    <div className="relative aspect-video w-full max-w-md overflow-hidden rounded-[24px] border border-border bg-[linear-gradient(160deg,#14192b,#322050_58%,#744d4b)] shadow-2xl shadow-violet-950/40">
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_bottom,#bb785d,transparent_65%)]" />
      <div className="absolute left-[12%] top-[24%] h-[1px] w-[76%] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      <div className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/30 text-on-vivid backdrop-blur-md">
        <Icon name="video" className="size-5" />
      </div>
      <div className="absolute inset-x-4 bottom-4 rounded-xl border border-border bg-black/35 p-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-semibold text-on-vivid/70">
            00:00
          </span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/10">
            <div className="h-full w-[38%] rounded-full bg-primary" />
          </div>
          <span className="text-[9px] font-semibold text-on-vivid/45">
            00:05
          </span>
        </div>
      </div>
      <p className="absolute left-4 top-4 text-[9px] font-bold uppercase tracking-[.25em] text-on-vivid/60">
        Storyboard preview
      </p>
    </div>
  );
}

function VoicePreview() {
  const bars = [
    26, 45, 62, 38, 76, 54, 88, 46, 68, 35, 72, 52, 82, 42, 60, 31, 48, 24,
  ];

  return (
    <div className="relative w-full max-w-md rounded-[24px] border border-border bg-[linear-gradient(145deg,#111827,#1e1b4b)] p-6 shadow-2xl shadow-violet-950/40">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-primary/20 text-primary">
          <Icon name="voice" />
        </span>
        <div>
          <p className="text-sm font-semibold text-on-vivid">
            Warm storyteller
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-widest text-on-vivid/55">
            English · Expressive
          </p>
        </div>
      </div>
      <div className="mt-8 flex h-28 items-center justify-center gap-1.5">
        {bars.map((height, index) => (
          <span
            key={`${height}-${index}`}
            className="w-1.5 rounded-full bg-gradient-to-t from-info to-primary"
            style={{ height: `${height}%`, opacity: 0.55 + (index % 4) * 0.12 }}
          />
        ))}
      </div>
      <div className="mt-5 flex items-center gap-3 text-[10px] font-medium text-on-vivid/55">
        <span>0:00</span>
        <div className="h-px flex-1 bg-foreground/10" />
        <span>0:18</span>
      </div>
    </div>
  );
}
