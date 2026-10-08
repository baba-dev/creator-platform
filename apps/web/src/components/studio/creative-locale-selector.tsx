"use client";

import { useCallback, useEffect, useState } from "react";
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

export function CreativeLocaleSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: CreativeLocaleIntent;
  onChange: (value: CreativeLocaleIntent) => void;
  disabled?: boolean;
}) {
  const current =
    CREATIVE_LOCALE_PRESETS.find((entry) => entry.id === value.preset) ??
    CREATIVE_LOCALE_PRESETS[0];
  const selectPreset = (preset: (typeof CREATIVE_LOCALE_PRESETS)[number]) => {
    onChange({
      ...value,
      preset: preset.id,
      language: preset.languages[0].code,
    });
  };

  return (
    <details className="group my-4 rounded-2xl border border-border bg-card shadow-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-background text-2xl"
            aria-hidden="true"
          >
            {current.flag}
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Creative locale
            </span>
            <span className="block truncate text-sm font-semibold text-foreground">
              {current.name} ·{" "}
              {value.language === "auto"
                ? "Auto-detect"
                : (current.languages.find(
                    (entry) => entry.code === value.language,
                  )?.label ?? value.language)}{" "}
              · {value.tone}
            </span>
          </span>
        </span>
        <span
          className="shrink-0 text-xs font-semibold text-primary group-open:rotate-180"
          aria-hidden="true"
        >
          ⌄
        </span>
      </summary>
      <div className="space-y-4 border-t border-border px-4 pb-4 pt-4">
        <p className="text-xs leading-5 text-muted-foreground">
          Choose your audience and language. Saved for this workspace across all
          creation tools until you reset it. Accents depend on the selected
          voice model.
        </p>
        <div
          className="flex gap-2 overflow-x-auto pb-2"
          role="group"
          aria-label="Creative locale country"
        >
          {CREATIVE_LOCALE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() => selectPreset(preset)}
              aria-pressed={preset.id === value.preset}
              aria-label={preset.name}
              title={preset.name}
              className={`flex min-w-16 shrink-0 flex-col items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 ${
                preset.id === value.preset
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-foreground hover:border-primary/50"
              }`}
            >
              <span className="text-2xl" aria-hidden="true">
                {preset.flag}
              </span>
              <span className="max-w-20 truncate">{preset.name}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
            Language
            <select
              disabled={disabled || value.preset === "auto"}
              aria-label="Creative locale language"
              value={value.language}
              onChange={(event) =>
                onChange({ ...value, language: event.target.value })
              }
              className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm"
            >
              {current.languages.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
            Tone
            <select
              disabled={disabled}
              aria-label="Creative locale tone"
              value={value.tone}
              onChange={(event) =>
                onChange({
                  ...value,
                  tone: event.target.value as CreativeLocaleIntent["tone"],
                })
              }
              className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm"
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
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
            Cultural context
            <select
              disabled={disabled}
              aria-label="Cultural context influence"
              value={value.culturalContext}
              onChange={(event) =>
                onChange({
                  ...value,
                  culturalContext: event.target
                    .value as CreativeLocaleIntent["culturalContext"],
                })
              }
              className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="auto">As relevant</option>
              <option value="on">Include when appropriate</option>
              <option value="off">Off</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(DEFAULT_CREATIVE_LOCALE)}
          className="min-h-11 rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground hover:border-primary focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
        >
          Reset to automatic
        </button>
      </div>
    </details>
  );
}
