"use client";
import Link from "next/link";
import type { TemplateVariable } from "@/lib/templates";
export type TemplateBriefState = {
  slug: string;
  name: string;
  mediaKind: "IMAGE" | "VIDEO" | "VOICE";
  variables: TemplateVariable[];
  values: Record<string, string | number | boolean>;
};
export function TemplateInlineBrief({
  brief,
  busy,
  error,
  onChange,
  organizationSlug,
}: {
  brief: TemplateBriefState;
  busy: boolean;
  error: string | null;
  onChange: (key: string, value: string | number | boolean) => void;
  organizationSlug: string;
}) {
  const primary =
    brief.variables.find((v) => v.type === "textarea" || v.type === "text") ??
    brief.variables[0];
  const rest = brief.variables.filter((v) => v.key !== primary?.key);
  function field(variable: TemplateVariable) {
    const value = brief.values[variable.key] ?? "";
    const id = `inline-template-${variable.key}`;
    return (
      <div key={variable.key} className="min-w-0 space-y-1.5">
        <label
          htmlFor={id}
          className="block text-xs font-semibold text-foreground"
        >
          {variable.label}
          {variable.required && (
            <span className="ml-1 text-primary" aria-label="required">
              *
            </span>
          )}
        </label>
        {variable.type === "toggle" ? (
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-input bg-card px-3">
            <input
              id={id}
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => onChange(variable.key, e.target.checked)}
              disabled={busy}
              className="accent-primary"
            />
            Enabled
          </label>
        ) : variable.type === "select" ? (
          <select
            id={id}
            value={String(value)}
            onChange={(e) => onChange(variable.key, e.target.value)}
            disabled={busy}
            className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-sm"
          >
            <option value="" disabled>
              Select {variable.label.toLowerCase()}
            </option>
            {(variable.options ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : variable.type === "reference-image" ? (
          <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs">
            <Link
              className="font-semibold text-primary underline"
              href={`/app/${organizationSlug}/templates/${brief.slug}`}
            >
              Select a secure reference image →
            </Link>
          </div>
        ) : variable.type === "textarea" ? (
          <textarea
            id={id}
            value={String(value)}
            onChange={(e) => onChange(variable.key, e.target.value)}
            disabled={busy}
            maxLength={2000}
            placeholder={variable.placeholder}
            aria-describedby={variable.helpText ? `${id}-help` : undefined}
            className="min-h-28 w-full rounded-xl border border-input bg-card px-3 py-3 text-sm outline-none focus:border-primary/45 focus:ring-4 focus:ring-primary/10"
          />
        ) : (
          <input
            id={id}
            type={variable.type === "number" ? "number" : "text"}
            value={String(value)}
            onChange={(e) =>
              onChange(
                variable.key,
                variable.type === "number" && e.target.value !== ""
                  ? Number(e.target.value)
                  : e.target.value,
              )
            }
            disabled={busy}
            maxLength={2000}
            placeholder={variable.placeholder}
            aria-describedby={variable.helpText ? `${id}-help` : undefined}
            className="min-h-11 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary/45 focus:ring-4 focus:ring-primary/10"
          />
        )}
        {variable.helpText && (
          <p id={`${id}-help`} className="text-[11px] text-muted-foreground">
            {variable.helpText}
          </p>
        )}
      </div>
    );
  }
  return (
    <div
      className="mt-5 space-y-4 rounded-2xl border border-primary/20 bg-primary/[.035] p-4 sm:p-5"
      aria-label={`${brief.name} creative brief`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">
            Template selected
          </p>
          <h3 className="font-display mt-1 text-lg font-semibold">
            {brief.name}
          </h3>
        </div>
        <span
          className="text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {busy
            ? "Preparing your Studio…"
            : error
              ? "Needs attention"
              : "Ready when you are"}
        </span>
      </div>
      {primary && field(primary)}
      {rest.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">{rest.map(field)}</div>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <p className="text-[11px] leading-5 text-muted-foreground">
        Your answers prepare the normal Studio prompt and compatible settings.
        You can review or edit the full prompt below. Selecting a template does
        not cost credits.
      </p>
    </div>
  );
}
