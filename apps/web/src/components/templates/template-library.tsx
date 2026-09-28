"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Icon } from "@/components/ui/icon";

export type TemplateCardData = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  mediaKind: "IMAGE" | "VIDEO" | "VOICE";
  featured: boolean;
  favorite: boolean;
  usageCount: number;
  defaultInput: Record<string, unknown>;
};

function mediaLabel(kind: TemplateCardData["mediaKind"]) {
  return kind === "IMAGE" ? "Image" : kind === "VIDEO" ? "Video" : "Voice";
}

function mediaIcon(kind: TemplateCardData["mediaKind"]) {
  return kind === "IMAGE" ? "image" : kind === "VIDEO" ? "video" : "voice";
}

export function TemplateLibrary({
  templates,
  organizationId,
  organizationSlug,
  recentTemplateIds,
}: {
  templates: TemplateCardData[];
  organizationId: string;
  organizationSlug: string;
  recentTemplateIds: string[];
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"ALL" | TemplateCardData["mediaKind"]>("ALL");
  const [category, setCategory] = useState("All");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteState, setFavoriteState] = useState<Record<string, boolean>>(
    Object.fromEntries(templates.map((template) => [template.id, template.favorite])),
  );
  const categories = useMemo(
    () => ["All", ...Array.from(new Set(templates.map((template) => template.category))).sort()],
    [templates],
  );
  const recent = useMemo(
    () =>
      recentTemplateIds
        .map((id) => templates.find((template) => template.id === id))
        .filter((template): template is TemplateCardData => Boolean(template)),
    [recentTemplateIds, templates],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((template) => {
      if (kind !== "ALL" && template.mediaKind !== kind) return false;
      if (category !== "All" && template.category !== category) return false;
      if (favoritesOnly && !favoriteState[template.id]) return false;
      if (!q) return true;
      return [template.name, template.description, template.category, mediaLabel(template.mediaKind)]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [category, favoriteState, favoritesOnly, kind, query, templates]);

  async function toggleFavorite(template: TemplateCardData) {
    const next = !favoriteState[template.id];
    setFavoriteState((current) => ({ ...current, [template.id]: next }));
    try {
      const response = await fetch(
        `/api/templates/${encodeURIComponent(template.slug)}/favorite`,
        {
          method: next ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId }),
        },
      );
      if (!response.ok) throw new Error();
    } catch {
      setFavoriteState((current) => ({ ...current, [template.id]: !next }));
    }
  }

  return (
    <div>
      {recent.length > 0 ? (
        <section className="mb-8" aria-labelledby="recent-templates">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                Pick up where you left off
              </p>
              <h2 id="recent-templates" className="font-display mt-2 text-2xl font-semibold">
                Recently used
              </h2>
            </div>
          </div>
          <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
            {recent.map((template) => (
              <Link
                key={template.id}
                href={`/app/${organizationSlug}/templates/${template.slug}`}
                className="group min-w-[250px] rounded-2xl border border-border bg-card/85 p-4 shadow-xs transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon name={mediaIcon(template.mediaKind)} className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{template.name}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {mediaLabel(template.mediaKind)} · {template.category}
                    </span>
                  </span>
                  <Icon name="arrow" className="ml-auto size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="template-library">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="relative max-w-2xl">
            <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search thumbnails, product ads, narration…"
              className="min-h-12 w-full rounded-2xl border border-input bg-card pl-11 pr-4 text-sm outline-none transition focus:border-primary/45 focus:ring-4 focus:ring-primary/10"
              aria-label="Search templates"
            />
          </div>
          <label className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-border bg-card px-4 text-xs font-semibold">
            <input
              type="checkbox"
              checked={favoritesOnly}
              onChange={(event) => setFavoritesOnly(event.target.checked)}
              className="size-4 accent-primary"
            />
            Favourites only
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(["ALL", "IMAGE", "VIDEO", "VOICE"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className={`min-h-10 rounded-xl border px-4 text-xs font-semibold transition ${
                kind === value
                  ? "border-primary/25 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {value === "ALL" ? "All formats" : mediaLabel(value)}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
          {categories.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory(value)}
              className={`shrink-0 rounded-lg px-3 py-2 text-[11px] font-semibold transition ${
                category === value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {value}
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div>
            <p id="template-library" className="text-sm font-semibold">
              {visible.length.toLocaleString("en-US")} creative recipes
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Structured starting points. You stay in control of the final generation.
            </p>
          </div>
        </div>

        {visible.length ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {visible.map((template) => (
              <article
                key={template.id}
                className="group relative overflow-hidden rounded-[24px] border border-border bg-card shadow-xs transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"
              >
                <Link
                  href={`/app/${organizationSlug}/templates/${template.slug}`}
                  className="block"
                >
                  <div className="relative aspect-[16/8.7] overflow-hidden border-b border-border bg-surface-sunken">
                    <div className="paper-grid absolute inset-0 opacity-50" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,hsl(var(--primary)/.22),transparent_34%),radial-gradient(circle_at_82%_82%,hsl(var(--info)/.14),transparent_34%)]" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="grid size-16 place-items-center rounded-[22px] border border-white/10 bg-background/70 text-primary shadow-sketch backdrop-blur-xl transition group-hover:rotate-2 group-hover:scale-105">
                        <Icon name={mediaIcon(template.mediaKind)} className="size-7" />
                      </span>
                    </div>
                    <div className="absolute left-4 top-4 flex gap-2">
                      {template.featured ? (
                        <span className="rounded-full border border-primary/20 bg-background/80 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-primary backdrop-blur">
                          Featured
                        </span>
                      ) : null}
                      <span className="rounded-full border border-border bg-background/80 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground backdrop-blur">
                        {mediaLabel(template.mediaKind)}
                      </span>
                    </div>
                  </div>
                  <div className="p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                      {template.category}
                    </p>
                    <h3 className="font-display mt-2 text-xl font-semibold tracking-tight">
                      {template.name}
                    </h3>
                    <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">
                      {template.description}
                    </p>
                    <div className="mt-4 flex items-center gap-2 text-[10px] text-muted-foreground">
                      {typeof template.defaultInput.aspectRatio === "string" ? (
                        <span className="rounded-lg bg-muted px-2 py-1">{template.defaultInput.aspectRatio}</span>
                      ) : null}
                      {typeof template.defaultInput.resolution === "string" ? (
                        <span className="rounded-lg bg-muted px-2 py-1">{template.defaultInput.resolution}</span>
                      ) : null}
                      <span className="ml-auto font-semibold text-primary">
                        Use template →
                      </span>
                    </div>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => void toggleFavorite(template)}
                  aria-label={favoriteState[template.id] ? "Remove from favourites" : "Add to favourites"}
                  aria-pressed={favoriteState[template.id]}
                  className={`absolute right-4 top-4 z-10 grid size-9 place-items-center rounded-full border backdrop-blur transition ${
                    favoriteState[template.id]
                      ? "border-primary/25 bg-primary text-primary-foreground"
                      : "border-border bg-background/80 text-muted-foreground hover:text-primary"
                  }`}
                >
                  <span aria-hidden="true" className="text-base leading-none">
                    {favoriteState[template.id] ? "♥" : "♡"}
                  </span>
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-[24px] border border-dashed border-border bg-card/60 px-6 py-14 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <Icon name="search" className="size-5" />
            </span>
            <h3 className="mt-4 font-display text-xl font-semibold">No matching templates</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Try another format, category, or a shorter search phrase.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
