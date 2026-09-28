"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export type AdminTemplateRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  mediaKind: "IMAGE" | "VIDEO" | "VOICE";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  promptTemplate: string;
  variables: unknown;
  defaultInput: unknown;
  preferredModelId: string | null;
  thumbnailAssetId: string | null;
  featured: boolean;
  sortOrder: number;
  usageCount: number;
  updatedAt: string;
};

type Draft = {
  id?: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  mediaKind: "IMAGE" | "VIDEO" | "VOICE";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  promptTemplate: string;
  variables: string;
  defaultInput: string;
  preferredModelId: string;
  thumbnailAssetId: string;
  featured: boolean;
  sortOrder: number;
};

const blank: Draft = {
  slug: "",
  name: "",
  description: "",
  category: "Social",
  mediaKind: "IMAGE",
  status: "DRAFT",
  promptTemplate: "",
  variables: "[]",
  defaultInput: "{}",
  preferredModelId: "",
  thumbnailAssetId: "",
  featured: false,
  sortOrder: 0,
};

function toDraft(template: AdminTemplateRow): Draft {
  return {
    id: template.id,
    slug: template.slug,
    name: template.name,
    description: template.description,
    category: template.category,
    mediaKind: template.mediaKind,
    status: template.status,
    promptTemplate: template.promptTemplate,
    variables: JSON.stringify(template.variables, null, 2),
    defaultInput: JSON.stringify(template.defaultInput, null, 2),
    preferredModelId: template.preferredModelId ?? "",
    thumbnailAssetId: template.thumbnailAssetId ?? "",
    featured: template.featured,
    sortOrder: template.sortOrder,
  };
}

export function TemplateManager({
  templates,
  canManage,
}: {
  templates: AdminTemplateRow[];
  canManage: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(templates[0]?.id ?? null);
  const selected = useMemo(
    () => templates.find((template) => template.id === selectedId) ?? null,
    [selectedId, templates],
  );
  const [draft, setDraft] = useState<Draft>(() => selected ? toDraft(selected) : blank);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function choose(template: AdminTemplateRow | null) {
    setSelectedId(template?.id ?? null);
    setDraft(template ? toDraft(template) : { ...blank });
    setMessage(null);
  }

  async function save() {
    if (!canManage || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      let variables: unknown;
      let defaultInput: unknown;
      try {
        variables = JSON.parse(draft.variables);
        defaultInput = JSON.parse(draft.defaultInput);
      } catch {
        throw new Error("Variables and defaults must be valid JSON.");
      }
      const payload = {
        slug: draft.slug.trim(),
        name: draft.name.trim(),
        description: draft.description.trim(),
        category: draft.category.trim(),
        mediaKind: draft.mediaKind,
        status: draft.status,
        promptTemplate: draft.promptTemplate.trim(),
        variables,
        defaultInput,
        preferredModelId: draft.preferredModelId.trim() || null,
        thumbnailAssetId: draft.thumbnailAssetId.trim() || null,
        featured: draft.featured,
        sortOrder: Number(draft.sortOrder),
      };
      const response = await fetch(
        draft.id ? `/api/admin/templates/${draft.id}` : "/api/admin/templates",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Template could not be saved.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Template could not be saved.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(280px,.65fr)_minmax(0,1.35fr)]">
      <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 px-1 pb-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Catalog</h2>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {templates.length} templates
            </p>
          </div>
          {canManage ? (
            <Button size="sm" onClick={() => choose(null)}>
              <Icon name="plus" className="size-4" /> New
            </Button>
          ) : null}
        </div>
        <div className="max-h-[72vh] space-y-2 overflow-y-auto pr-1">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => choose(template)}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                selectedId === template.id
                  ? "border-primary/25 bg-primary/[0.06]"
                  : "border-border bg-background/50 hover:bg-muted/60"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-primary">
                  <Icon
                    name={
                      template.mediaKind === "IMAGE"
                        ? "image"
                        : template.mediaKind === "VIDEO"
                          ? "video"
                          : "voice"
                    }
                    className="size-4"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{template.name}</span>
                  <span className="mt-1 block text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                    {template.status} · {template.category}
                  </span>
                </span>
                {template.featured ? (
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-[8px] font-bold uppercase text-primary">
                    Featured
                  </span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
              {draft.id ? "Edit template" : "New template"}
            </p>
            <h2 className="font-display mt-2 text-2xl font-semibold">
              {draft.id ? draft.name : "Create a creative recipe"}
            </h2>
          </div>
          {selected ? (
            <p className="text-[10px] text-muted-foreground">
              {selected.usageCount.toLocaleString("en-US")} generations · updated{" "}
              {new Date(selected.updatedAt).toLocaleDateString("en-GB")}
            </p>
          ) : null}
        </div>

        <fieldset disabled={!canManage || busy} className="mt-6 space-y-5 disabled:opacity-70">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="field" />
            </Field>
            <Field label="Slug">
              <input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} className="field font-mono" />
            </Field>
            <Field label="Category">
              <input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="field" />
            </Field>
            <Field label="Media kind">
              <select value={draft.mediaKind} onChange={(e) => setDraft({ ...draft, mediaKind: e.target.value as Draft["mediaKind"] })} className="field">
                <option value="IMAGE">Image</option>
                <option value="VIDEO">Video</option>
                <option value="VOICE">Voice</option>
              </select>
            </Field>
            <Field label="Status">
              <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Draft["status"] })} className="field">
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </Field>
            <Field label="Sort order">
              <input type="number" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} className="field" />
            </Field>
          </div>

          <Field label="Description">
            <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="field min-h-24 py-3" />
          </Field>
          <Field label="Prompt template" hint="Use {{variableName}} placeholders only. No executable template language is supported.">
            <textarea value={draft.promptTemplate} onChange={(e) => setDraft({ ...draft, promptTemplate: e.target.value })} className="field min-h-36 py-3 font-mono text-xs" />
          </Field>

          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Variables JSON">
              <textarea value={draft.variables} onChange={(e) => setDraft({ ...draft, variables: e.target.value })} className="field min-h-60 py-3 font-mono text-[11px]" />
            </Field>
            <Field label="Default input JSON">
              <textarea value={draft.defaultInput} onChange={(e) => setDraft({ ...draft, defaultInput: e.target.value })} className="field min-h-60 py-3 font-mono text-[11px]" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Preferred provider model ID" hint="Preference only; the resolver still enforces live compatibility.">
              <input value={draft.preferredModelId} onChange={(e) => setDraft({ ...draft, preferredModelId: e.target.value })} className="field font-mono text-xs" />
            </Field>
            <Field label="Thumbnail asset ID" hint="Optional READY image asset.">
              <input value={draft.thumbnailAssetId} onChange={(e) => setDraft({ ...draft, thumbnailAssetId: e.target.value })} className="field font-mono text-xs" />
            </Field>
          </div>

          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-surface-sunken px-4 text-sm font-semibold">
            <input
              type="checkbox"
              checked={draft.featured}
              onChange={(e) => setDraft({ ...draft, featured: e.target.checked })}
              className="size-4 accent-primary"
            />
            Feature this template in discovery
          </label>
        </fieldset>

        {message ? (
          <p role="alert" className="mt-5 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
            {message}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-5">
          {!canManage ? (
            <p className="mr-auto text-xs text-muted-foreground">Read-only access</p>
          ) : null}
          <Button type="button" onClick={() => void save()} disabled={!canManage || busy}>
            <Icon name="check" className="size-4" />
            {busy ? "Saving…" : draft.id ? "Save changes" : "Create template"}
          </Button>
        </div>
      </section>

      <style jsx>{`
        :global(.field) {
          min-height: 3rem;
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid hsl(var(--input));
          background: hsl(var(--background));
          padding-left: 0.875rem;
          padding-right: 0.875rem;
          font-size: 0.875rem;
          outline: none;
        }
        :global(.field:focus) {
          border-color: hsl(var(--primary) / 0.45);
          box-shadow: 0 0 0 4px hsl(var(--primary) / 0.1);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold">{label}</span>
      {hint ? <span className="ml-2 text-[9px] font-normal text-muted-foreground">{hint}</span> : null}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}
