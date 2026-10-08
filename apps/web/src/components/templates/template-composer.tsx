"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { TemplateVariable } from "@/lib/templates";
import {
  CreativeLocaleButton,
  useCreativeLocale,
} from "@/components/studio/creative-locale-selector";

type ReferenceAsset = {
  id: string;
  name: string | null;
  originalFilename: string | null;
};

export function TemplateComposer({
  organizationId,
  organizationSlug,
  template,
  variables,
  referenceAssets,
}: {
  organizationId: string;
  organizationSlug: string;
  template: {
    slug: string;
    name: string;
    mediaKind: "IMAGE" | "VIDEO" | "VOICE";
    defaultInput: Record<string, unknown>;
  };
  variables: TemplateVariable[];
  referenceAssets: ReferenceAsset[];
}) {
  const router = useRouter();
  const [localeIntent, setLocaleIntent] = useCreativeLocale(organizationId);
  const initial = useMemo(
    () =>
      Object.fromEntries(
        variables
          .filter((variable) => variable.defaultValue !== undefined)
          .map((variable) => [variable.key, variable.defaultValue]),
      ) as Record<string, string | number | boolean>,
    [variables],
  );
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setValue(key: string, value: string | number | boolean) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function openTemplate() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/templates/${encodeURIComponent(template.slug)}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId, values, localeIntent }),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        resolved?: Record<string, unknown>;
      };
      if (!response.ok || !body.resolved) {
        throw new Error(body.error ?? "Template could not be prepared.");
      }
      const handoffId = crypto.randomUUID();
      sessionStorage.setItem(
        `aiwa-template-handoff:${handoffId}`,
        JSON.stringify(body.resolved),
      );
      router.push(
        `/app/${organizationSlug}?templateHandoff=${encodeURIComponent(handoffId)}#create`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Template could not be prepared.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[28px] border border-border bg-card/90 p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon name="wand" className="size-5" />
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold">Make it yours</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Fill the creative brief. Creator will resolve the prompt and select
            a compatible live model.
          </p>
        </div>
      </div>

      <div className="mt-4 flex justify-end"><CreativeLocaleButton value={localeIntent} onChange={setLocaleIntent} disabled={busy} /></div>
      <div className="mt-6 space-y-5">
        {variables.map((variable) => {
          const id = `template-variable-${variable.key}`;
          const value = values[variable.key] ?? "";
          return (
            <div key={variable.key}>
              <label htmlFor={id} className="text-sm font-semibold">
                {variable.label}
                {variable.required ? (
                  <span className="ml-1 text-primary">*</span>
                ) : null}
              </label>
              {variable.helpText ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {variable.helpText}
                </p>
              ) : null}

              {variable.type === "textarea" ? (
                <textarea
                  id={id}
                  value={String(value)}
                  onChange={(event) =>
                    setValue(variable.key, event.target.value)
                  }
                  placeholder={variable.placeholder}
                  maxLength={2000}
                  className="mt-2 min-h-28 w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none transition focus:border-primary/45 focus:ring-4 focus:ring-primary/10"
                />
              ) : variable.type === "select" ? (
                <select
                  id={id}
                  value={String(value)}
                  onChange={(event) =>
                    setValue(variable.key, event.target.value)
                  }
                  className="mt-2 min-h-12 w-full rounded-xl border border-input bg-background px-3 text-sm"
                >
                  {(variable.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : variable.type === "toggle" ? (
                <label className="mt-2 flex min-h-12 items-center gap-3 rounded-xl border border-input bg-background px-4 text-sm">
                  <input
                    id={id}
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(event) =>
                      setValue(variable.key, event.target.checked)
                    }
                    className="size-4 accent-primary"
                  />
                  Enabled
                </label>
              ) : variable.type === "number" ? (
                <input
                  id={id}
                  type="number"
                  value={typeof value === "number" ? value : String(value)}
                  onChange={(event) =>
                    setValue(variable.key, Number(event.target.value))
                  }
                  className="mt-2 min-h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
                />
              ) : variable.type === "reference-image" ? (
                <select
                  id={id}
                  value={String(value)}
                  onChange={(event) =>
                    setValue(variable.key, event.target.value)
                  }
                  className="mt-2 min-h-12 w-full rounded-xl border border-input bg-background px-3 text-sm"
                >
                  <option value="">Choose a reference image</option>
                  {referenceAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name ??
                        asset.originalFilename ??
                        "Reference image"}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={id}
                  value={String(value)}
                  onChange={(event) =>
                    setValue(variable.key, event.target.value)
                  }
                  placeholder={variable.placeholder}
                  maxLength={2000}
                  className="mt-2 min-h-12 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none transition focus:border-primary/45 focus:ring-4 focus:ring-primary/10"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-surface-sunken p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          Prepared output
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-card px-2.5 py-1.5 font-semibold">
            {template.mediaKind === "IMAGE"
              ? "Image"
              : template.mediaKind === "VIDEO"
                ? "Video"
                : "Voice"}
          </span>
          {typeof template.defaultInput.aspectRatio === "string" ? (
            <span className="rounded-lg bg-card px-2.5 py-1.5">
              {template.defaultInput.aspectRatio}
            </span>
          ) : null}
          {typeof template.defaultInput.resolution === "string" ? (
            <span className="rounded-lg bg-card px-2.5 py-1.5">
              {template.defaultInput.resolution}
            </span>
          ) : null}
          {typeof template.defaultInput.durationSeconds === "number" ? (
            <span className="rounded-lg bg-card px-2.5 py-1.5">
              {template.defaultInput.durationSeconds}s
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        onClick={() => void openTemplate()}
        disabled={busy}
        aria-busy={busy}
        className="mt-5 w-full"
      >
        <Icon name="sparkles" className="size-4" />
        {busy ? "Preparing template…" : "Open in Studio"}
      </Button>
      <p className="mt-3 text-center text-[10px] leading-4 text-muted-foreground">
        Nothing is charged until you confirm generation in Studio.
      </p>
    </div>
  );
}
