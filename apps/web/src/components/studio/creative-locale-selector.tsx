"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  CREATIVE_LOCALE_PRESETS,
  DEFAULT_CREATIVE_LOCALE,
  creativeLocaleIntentSchema,
  type CreativeLocaleIntent,
} from "@aiwa/generation/locale";

const CHANGE_EVENT = "aiwa:creative-locale-changed";
function storageKey(organizationId: string) {
  return `aiwa:creative-locale:v1:${organizationId}`;
}

/** One browser-wide preference per workspace, shared by all Studio surfaces. */
export function useCreativeLocale(organizationId: string) {
  const [intent, setIntent] = useState<CreativeLocaleIntent>(
    DEFAULT_CREATIVE_LOCALE,
  );

  useEffect(() => {
    const key = storageKey(organizationId);
    const load = () => {
      try {
        const stored = window.localStorage.getItem(key);
        const parsed = stored
          ? creativeLocaleIntentSchema.safeParse(JSON.parse(stored))
          : null;
        setIntent(parsed?.success ? parsed.data : DEFAULT_CREATIVE_LOCALE);
      } catch {
        setIntent(DEFAULT_CREATIVE_LOCALE);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) load();
    };
    const onLocalChange = (event: Event) => {
      if ((event as CustomEvent<{ key: string }>).detail?.key === key) load();
    };
    load();
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onLocalChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onLocalChange);
    };
  }, [organizationId]);

  const update = useCallback(
    (next: CreativeLocaleIntent) => {
      const parsed = creativeLocaleIntentSchema.parse(next);
      setIntent(parsed);
      try {
        const key = storageKey(organizationId);
        if (
          parsed.preset === "auto" &&
          parsed.tone === "natural" &&
          parsed.culturalContext === "auto"
        ) {
          window.localStorage.removeItem(key);
        } else {
          window.localStorage.setItem(key, JSON.stringify(parsed));
        }
        window.dispatchEvent(
          new CustomEvent(CHANGE_EVENT, { detail: { key } }),
        );
      } catch {
        // Storage can be disabled by browser policy; in-memory selection still works.
      }
    },
    [organizationId],
  );

  return [intent, update] as const;
}

type LocalePreset = (typeof CREATIVE_LOCALE_PRESETS)[number];

function LocaleFlag({
  preset,
  size = "small",
}: {
  preset: LocalePreset;
  size?: "small" | "large";
}) {
  if (!preset.countryCode) {
    return (
      <span
        className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"
        aria-hidden="true"
      >
        <Icon name="globe" className="size-5" />
      </span>
    );
  }

  // Local vector flags render reliably on Windows, where emoji often become country codes.
  return (
    <Image
      unoptimized
      src={"/flags/4x3/" + preset.countryCode.toLowerCase() + ".svg"}
      alt=""
      width={size === "large" ? 48 : 36}
      height={size === "large" ? 36 : 27}
      className="aspect-4/3 rounded-md border border-border/60 object-cover shadow-xs"
    />
  );
}

function HelpTooltip({
  label,
  explanation,
}: {
  label: string;
  explanation: string;
}) {
  const tooltipId = useId();

  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={"About " + label}
        aria-describedby={tooltipId}
        title={explanation}
        className="grid size-5 place-items-center rounded-full border border-border bg-muted/70 text-[11px] font-bold text-muted-foreground outline-offset-2 transition hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
      >
        ?
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-xl border border-border bg-popover px-3 py-2 text-left text-xs font-normal leading-5 text-popover-foreground opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {explanation}
      </span>
    </span>
  );
}

function CreativeLocaleDialog({
  value,
  onApply,
  onClose,
}: {
  value: CreativeLocaleIntent;
  onApply: (value: CreativeLocaleIntent) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const current =
    CREATIVE_LOCALE_PRESETS.find((item) => item.id === draft.preset) ??
    CREATIVE_LOCALE_PRESETS[0];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const selectPreset = (preset: LocalePreset) => {
    setDraft({
      ...draft,
      preset: preset.id,
      language: preset.languages[0].code,
    });
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby={titleId}
      aria-describedby={titleId + "-description"}
      className="fixed inset-0 m-auto max-h-[min(90dvh,820px)] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto rounded-[28px] border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm"
    >
      <div className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary/10 via-card to-card px-5 pb-5 pt-6 sm:px-7">
        <div className="pointer-events-none absolute -right-10 -top-20 size-56 rounded-full border border-primary/10 bg-primary/5" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <Icon name="globe" className="size-6" />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
                Your creative direction
              </p>
              <h2
                id={titleId}
                className="font-display mt-1 text-2xl font-semibold tracking-tight sm:text-3xl"
              >
                Creative locale
              </h2>
              <p
                id={titleId + "-description"}
                className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground"
              >
                Choose who you&apos;re creating for. We&apos;ll carry your
                selection across studios without changing your original prompt.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close locale settings without saving"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-background text-xl text-muted-foreground transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            ×
          </button>
        </div>
        <div className="relative mt-5 inline-flex max-w-full items-center gap-3 rounded-2xl border border-primary/20 bg-background/80 px-3 py-2 shadow-xs">
          <LocaleFlag preset={current} size="large" />
          <span className="min-w-0 text-sm">
            <span className="block font-semibold">{current.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {current.languages.find((item) => item.code === draft.language)
                ?.label ?? "Automatic"}{" "}
              · {draft.tone}
            </span>
          </span>
          <span className="ml-2 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
            Preview
          </span>
        </div>
      </div>

      <div className="space-y-6 px-5 py-5 sm:px-7 sm:py-6">
        <section aria-label="Target country">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold text-foreground">
              Where is your audience?
            </h3>
            <span className="text-xs text-muted-foreground">
              Select a country or let the model decide
            </span>
          </div>
          <div
            className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4 md:grid-cols-5"
            role="group"
            aria-label="Creative locale country"
          >
            {CREATIVE_LOCALE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-pressed={preset.id === draft.preset}
                aria-label={preset.name}
                title={preset.name}
                onClick={() => selectPreset(preset)}
                className={
                  "relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 text-center text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-ring " +
                  (preset.id === draft.preset
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/20"
                    : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-muted/40")
                }
              >
                {preset.id === draft.preset && (
                  <span
                    className="absolute right-2 top-2 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground"
                    aria-hidden="true"
                  >
                    <Icon name="check" className="size-3" />
                  </span>
                )}
                <LocaleFlag preset={preset} />
                <span className="line-clamp-2">{preset.name}</span>
              </button>
            ))}
          </div>
        </section>

        <section
          className="grid gap-4 border-t border-border pt-5 sm:grid-cols-3"
          aria-label="Creative language and style"
        >
          <div className="flex min-w-0 flex-col gap-2 text-xs font-semibold">
            <span className="flex items-center gap-2">
              Language
              <HelpTooltip
                label="language"
                explanation="Choose the language used for generated words or speech. Image-only requests aren't translated; voice accents depend on the selected model."
              />
            </span>
            <select
              aria-label="Creative locale language"
              disabled={draft.preset === "auto"}
              value={draft.language}
              onChange={(event) =>
                setDraft({ ...draft, language: event.target.value })
              }
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
            >
              {current.languages.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-2 text-xs font-semibold">
            <span className="flex items-center gap-2">
              Tone
              <HelpTooltip
                label="tone"
                explanation="Sets the overall creative voice: natural, relaxed, professional, energetic, warm, premium, or authoritative. Your explicit prompt always wins."
              />
            </span>
            <select
              aria-label="Creative locale tone"
              value={draft.tone}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  tone: event.target.value as CreativeLocaleIntent["tone"],
                })
              }
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {(
                [
                  "natural",
                  "casual",
                  "professional",
                  "energetic",
                  "warm",
                  "luxury",
                  "authoritative",
                ] as const
              ).map((tone) => (
                <option key={tone} value={tone}>
                  {tone.charAt(0).toUpperCase() + tone.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-2 text-xs font-semibold">
            <span className="flex items-center gap-2">
              Cultural context
              <HelpTooltip
                label="cultural context"
                explanation="Controls whether generation should draw on local culture when relevant. It won't inject stereotypes, landmarks, or costumes into unrelated prompts."
              />
            </span>
            <select
              aria-label="Cultural context influence"
              value={draft.culturalContext}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  culturalContext: event.target
                    .value as CreativeLocaleIntent["culturalContext"],
                })
              }
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <option value="auto">As relevant</option>
              <option value="on">Include when appropriate</option>
              <option value="off">Off</option>
            </select>
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card/95 px-5 py-4 backdrop-blur sm:px-7">
        <button
          type="button"
          onClick={() => setDraft(DEFAULT_CREATIVE_LOCALE)}
          className="min-h-10 text-xs font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          Reset to automatic
        </button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={() => onApply(draft)}>
            <Icon name="check" className="size-4" /> Apply locale
          </Button>
        </div>
      </div>
    </dialog>
  );
}

/** Compact, shared entry point. Locale stays in the workspace hook, not in visible chat. */
export function CreativeLocaleButton({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: CreativeLocaleIntent;
  onChange: (value: CreativeLocaleIntent) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const current =
    CREATIVE_LOCALE_PRESETS.find((entry) => entry.id === value.preset) ??
    CREATIVE_LOCALE_PRESETS[0];

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled}
        className={className}
        aria-label={"Choose creative locale. Current: " + current.name}
        title={"Creative locale: " + current.name}
        onClick={() => setIsOpen(true)}
      >
        <Icon name="globe" className="size-4" />
        <span>Locale{current.id === "auto" ? "" : " · " + current.name}</span>
      </Button>
      {isOpen && (
        <CreativeLocaleDialog
          value={value}
          onClose={() => setIsOpen(false)}
          onApply={(next) => {
            onChange(next);
            setIsOpen(false);
          }}
        />
      )}
    </>
  );
}
