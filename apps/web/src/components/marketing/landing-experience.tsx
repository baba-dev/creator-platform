"use client";

import { useMemo, useState } from "react";

import { Button } from "@aiwa/ui/button";

import { CreativeSurface } from "@/components/ui/creative";
import { Icon } from "@/components/ui/icon";
import { DemoBadge, StatusDot } from "@/components/ui/sketch";
import {
  landingFeatureGroups,
  landingStudioModes,
  type LandingFeatureGroupId,
  type LandingStudioModeId,
} from "@/lib/landing-content";

const previewStyles: Record<
  LandingStudioModeId,
  { glow: string; tile: string; badge: string }
> = {
  image: {
    glow: "bg-primary/20",
    tile:
      "bg-[radial-gradient(circle_at_25%_20%,color-mix(in_oklch,var(--primary)_42%,transparent),transparent_34%),radial-gradient(circle_at_78%_78%,color-mix(in_oklch,var(--accent)_36%,transparent),transparent_38%),linear-gradient(145deg,var(--surface-sunken),var(--card))]",
    badge: "text-primary",
  },
  video: {
    glow: "bg-info/20",
    tile:
      "bg-[radial-gradient(circle_at_72%_18%,color-mix(in_oklch,var(--info)_40%,transparent),transparent_34%),radial-gradient(circle_at_18%_82%,color-mix(in_oklch,var(--primary)_30%,transparent),transparent_38%),linear-gradient(145deg,var(--surface-sunken),var(--card))]",
    badge: "text-info",
  },
  voice: {
    glow: "bg-warning/20",
    tile:
      "bg-[radial-gradient(circle_at_50%_20%,color-mix(in_oklch,var(--warning)_38%,transparent),transparent_34%),radial-gradient(circle_at_82%_78%,color-mix(in_oklch,var(--accent)_25%,transparent),transparent_36%),linear-gradient(145deg,var(--surface-sunken),var(--card))]",
    badge: "text-warning",
  },
  spokesperson: {
    glow: "bg-accent/20",
    tile:
      "bg-[radial-gradient(circle_at_50%_18%,color-mix(in_oklch,var(--accent)_36%,transparent),transparent_32%),radial-gradient(circle_at_18%_82%,color-mix(in_oklch,var(--info)_26%,transparent),transparent_34%),linear-gradient(145deg,var(--surface-sunken),var(--card))]",
    badge: "text-accent",
  },
};

export function LandingStudioExperience() {
  const [modeId, setModeId] = useState<LandingStudioModeId>("image");
  const [modelId, setModelId] = useState("seedream-5-pro");

  const mode = useMemo(
    () => landingStudioModes.find((item) => item.id === modeId)!,
    [modeId],
  );
  const model =
    mode.models.find((item) => item.id === modelId) ?? mode.models[0]!;
  const style = previewStyles[mode.id];

  function chooseMode(nextMode: LandingStudioModeId) {
    const next = landingStudioModes.find((item) => item.id === nextMode)!;
    setModeId(nextMode);
    setModelId(next.models[0]!.id);
  }

  return (
    <CreativeSurface
      variant="sketch"
      className="relative overflow-hidden rounded-[30px] bg-card/90 p-3 shadow-lg sm:p-4"
    >
      <div\n        className={`pointer-events-none absolute -right-20 -top-24 size-64 rounded-full blur-3xl ${style.glow}`}\n      />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-3 pt-1">
          <div>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-subtle-foreground">
              Interactive product tour
            </p>
            <p className="font-display mt-1 text-lg font-semibold text-foreground">
              Creation workspace
            </p>
          </div>
          <DemoBadge>No generation submitted</DemoBadge>
        </div>

        <div
          className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-background/65 p-1.5 sm:grid-cols-4"
          role="tablist"
          aria-label="Creative modes"
        >
          {landingStudioModes.map((item) => {
            const selected = item.id === mode.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => chooseMode(item.id)}
                className={[
                  "flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-ring",
                  selected
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:bg-card hover:text-foreground",
                ].join(" ")}
              >
                <Icon name={item.icon} className="size-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[.9fr_1.1fr]">
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-background/62 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-primary">
                  {mode.eyebrow}
                </p>
                <StatusDot tone="info">Ready</StatusDot>
              </div>
              <p className="mt-4 text-[10px] font-semibold text-subtle-foreground">
                {mode.promptLabel}
              </p>
              <p className="mt-2 text-xs leading-5 text-foreground/85">
                {mode.prompt}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-background/62 p-3">
              <p className="px-1 text-[10px] font-semibold text-subtle-foreground">
                Pick a model
              </p>
              <div className="mt-2 grid gap-2">
                {mode.models.map((item) => {
                  const selected = item.id === model.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setModelId(item.id)}
                      className={[
                        "rounded-xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-ring",
                        selected
                          ? "border-primary/35 bg-primary/10 shadow-xs"
                          : "border-border bg-card/60 hover:border-primary/25 hover:bg-card",
                      ].join(" ")}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-foreground">
                          {item.name}
                        </span>
                        <span className="rounded-full border border-border bg-background/70 px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                          {item.badge}
                        </span>
                      </span>
                      <span className="mt-1 block text-[10px] text-subtle-foreground">
                        {item.provider}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex min-h-[420px] flex-col overflow-hidden rounded-[24px] border border-border bg-surface-sunken">
            <div\n              className={`relative flex min-h-56 flex-1 overflow-hidden p-5 ${style.tile}`}\n            >
              <div className="paper-grid absolute inset-0 opacity-25" />
              <div className="absolute left-1/2 top-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/10 bg-card/28 shadow-lg backdrop-blur-md" />
              <div className="relative z-10 flex w-full flex-col justify-between">
                <span
                  className={`font-mono text-[9px] font-bold uppercase tracking-[0.18em] ${style.badge}`}
                >
                  {mode.outputDetail}
                </span>
                <div>
                  <div className="mb-4 flex items-end gap-1" aria-hidden="true">
                    {[38, 68, 48, 82, 58, 92, 52, 76, 44, 64].map(
                      (height, index) => (
                        <span
                          key={`${height}-${index}`}
                          className="w-1.5 rounded-full bg-foreground/45"
                          style={{ height: `${height / 2}px` }}
                        />
                      ),
                    )}
                  </div>
                  <p className="font-display max-w-xs text-3xl font-semibold tracking-[-0.035em] text-foreground">
                    {mode.outputTitle}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-border bg-card/88 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {model.name}
                  </p>
                  <p className="mt-1 max-w-sm text-[11px] leading-5 text-muted-foreground">
                    {model.description}
                  </p>
                </div>
                <span className="rounded-full border border-success/20 bg-success/10 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-success">
                  Quote before run
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {model.capabilities.map((capability) => (
                  <span
                    key={capability}
                    className="rounded-full border border-border bg-background/65 px-2.5 py-1 text-[9px] font-semibold text-muted-foreground"
                  >
                    {capability}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </CreativeSurface>
  );
}

export function LandingFeatureExplorer() {
  const [groupId, setGroupId] = useState<LandingFeatureGroupId>("create");
  const group = landingFeatureGroups.find((item) => item.id === groupId)!;

  return (
    <div className="mt-10">
      <div
        className="grid gap-2 rounded-2xl border border-border bg-card/55 p-2 sm:grid-cols-4"
        role="tablist"
        aria-label="Platform feature groups"
      >
        {landingFeatureGroups.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant={item.id === group.id ? "default" : "ghost"}
            size="sm"
            role="tab"
            aria-selected={item.id === group.id}
            onClick={() => setGroupId(item.id)}
            className="w-full"
          >
            {item.label}
          </Button>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[.62fr_1.38fr]">
        <CreativeSurface
          variant="sunken"
          className="relative overflow-hidden p-6 sm:p-7"
        >
          <div className="creative-glow pointer-events-none absolute inset-0 opacity-55" />
          <div className="relative">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              {group.label} with Creators
            </p>
            <h3 className="font-display mt-4 text-3xl font-semibold tracking-[-0.035em] text-foreground">
              One workspace, less context switching.
            </h3>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              {group.description}
            </p>
            <div className="mt-8 rounded-2xl border border-border bg-card/72 p-4">
              <p className="text-xs font-semibold text-foreground">
                The platform keeps the handoff connected
              </p>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                Prompts, models, generated assets, projects, storage, and team
                controls stay attached to the same production context.
              </p>
            </div>
          </div>
        </CreativeSurface>

        <div className="grid gap-3 sm:grid-cols-2">
          {group.features.map((feature) => (
            <CreativeSurface
              as="article"
              key={feature.title}
              className="group p-5 transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-background/65 text-primary transition group-hover:border-primary/25 group-hover:bg-primary/10">
                  <Icon name={feature.icon} className="size-4.5" />
                </span>
                {feature.badge ? (
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-primary">
                    {feature.badge}
                  </span>
                ) : null}
              </div>
              <h4 className="font-display mt-5 text-lg font-semibold text-foreground">
                {feature.title}
              </h4>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {feature.description}
              </p>
            </CreativeSurface>
          ))}
        </div>
      </div>
    </div>
  );
}
