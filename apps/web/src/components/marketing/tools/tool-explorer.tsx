"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import {
  findPublicTools,
  recommendTools,
  toolCategories,
  toolHref,
  type PublicTool,
  type PublicToolCategory,
  type ToolIntent,
  type ToolSource,
} from "@/lib/public-tools";

export type PublicOperation = {
  id: string;
  name: string;
  description: string;
};

const intents: readonly { value: ToolIntent; label: string }[] = [
  { value: "image", label: "Create an image" },
  { value: "edit-image", label: "Improve a picture" },
  { value: "video", label: "Make a video" },
  { value: "presenter", label: "Create a presenter" },
  { value: "voice", label: "Generate a voiceover" },
  { value: "transcribe", label: "Make a transcript" },
  { value: "plan", label: "Plan a campaign" },
  { value: "finish", label: "Finish existing media" },
];
const sources: readonly { value: ToolSource; label: string }[] = [
  { value: "idea", label: "An idea or some text" },
  { value: "image", label: "An image" },
  { value: "video", label: "A video" },
  { value: "audio", label: "An audio recording" },
];

export function ToolCard({
  tool,
  featured = false,
}: {
  tool: PublicTool;
  featured?: boolean;
}) {
  return (
    <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md">
      <Link
        href={toolHref(tool) as Route}
        aria-label={"Explore " + tool.title}
        className="relative block overflow-hidden bg-surface-sunken"
      >
        <Image
          src={tool.cover}
          alt={tool.title + " original illustrated artwork"}
          width={700}
          height={430}
          className={
            "w-full object-cover transition duration-500 group-hover:scale-[1.035] " +
            (featured ? "aspect-[16/10]" : "aspect-[16/9]")
          }
        />
        <span className="absolute bottom-3 left-3 rounded-full border border-white/35 bg-background/90 px-3 py-1 text-[10px] font-bold text-foreground backdrop-blur-md">
          {
            toolCategories.find((category) => category.id === tool.category)
              ?.label
          }
        </span>
      </Link>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon name={tool.icon} className="size-5" />
          </span>
          <div>
            <h3 className="font-display text-xl font-semibold tracking-tight">
              {tool.title}
            </h3>
            <p className="mt-1 text-sm font-medium text-primary">
              {tool.headline}
            </p>
          </div>
        </div>
        <p className="mt-4 flex-1 text-sm leading-6 text-muted-foreground">
          {tool.summary}
        </p>
        {featured ? (
          <p className="mt-4 text-xs font-medium text-muted-foreground">
            Ideal for: {tool.idealFor}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-1.5">
          {tool.capabilities.slice(0, 3).map((capability) => (
            <span
              key={capability}
              className="rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-[10px] font-semibold"
            >
              {capability}
            </span>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4 text-xs font-bold">
          <Link
            href={toolHref(tool) as Route}
            className="inline-flex min-h-9 items-center gap-1.5 text-primary hover:underline"
          >
            Explore tool <Icon name="arrow" className="size-3.5" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex min-h-9 items-center text-muted-foreground hover:text-foreground"
          >
            Pricing ↗
          </Link>
        </div>
      </div>
    </article>
  );
}
export function ToolDirectory({
  operations,
}: {
  operations: PublicOperation[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<PublicToolCategory | "all">("all");
  const [intent, setIntent] = useState<ToolIntent | "">("");
  const [source, setSource] = useState<ToolSource | "">("");
  const results = useMemo(
    () => findPublicTools(query, category),
    [query, category],
  );
  const ops = useMemo(
    () =>
      operations.filter((operation) => {
        if (category !== "all" && category !== "finishing") return false;
        const search = (
          operation.name +
          " " +
          operation.description +
          " mediakit finishing"
        ).toLocaleLowerCase();
        return search.includes(query.trim().toLocaleLowerCase());
      }),
    [operations, query, category],
  );
  const recommendations =
    intent && source ? recommendTools(intent, source) : [];
  return (
    <>
      <section
        id="directory"
        className="scroll-mt-28 mx-auto max-w-7xl px-5 py-20 sm:px-7 lg:px-10"
      >
        <div className="max-w-3xl">
          <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-primary">
            The complete toolbox
          </p>
          <h2 className="font-display mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Find a tool for the job.
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
            Search by the outcome you want, the material you have, or the Studio
            you already know. Browse every major workspace tool without signing
            in.
          </p>
        </div>
        <div className="sticky top-0 z-20 mt-9 border-y border-border bg-background/95 py-4 backdrop-blur-lg">
          <label htmlFor="tool-search" className="sr-only">
            Search creative tools
          </label>
          <div className="flex min-h-12 items-center gap-3 rounded-xl border border-input bg-card px-4 focus-within:ring-2 focus-within:ring-ring">
            <Icon name="search" className="size-5 text-muted-foreground" />
            <input
              id="tool-search"
              type="search"
              value={query}
              maxLength={100}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try 'animate a photo', 'subtitles', 'product images'..."
              className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-primary focus-visible:outline-2 focus-visible:outline-ring"
              >
                Clear
              </button>
            ) : null}
          </div>
          <div
            role="group"
            aria-label="Filter by category"
            className="mt-3 flex gap-2 overflow-x-auto pb-1"
          >
            {[{ id: "all", label: "All tools" }, ...toolCategories].map(
              (item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={category === item.id}
                  onClick={() =>
                    setCategory(item.id as PublicToolCategory | "all")
                  }
                  className={
                    "shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-ring " +
                    (category === item.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-secondary")
                  }
                >
                  {item.label}
                </button>
              ),
            )}
          </div>
        </div>
        <p
          className="mt-5 text-xs font-semibold text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {results.length + ops.length} matching{" "}
          {results.length + ops.length === 1 ? "tool" : "tools"}
        </p>
        {results.length || ops.length ? (
          <div className="mt-6 space-y-14">
            {toolCategories
              .filter((group) => category === "all" || category === group.id)
              .map((group) => {
                const items = results.filter(
                  (tool) => tool.category === group.id,
                );
                if (!items.length && (group.id !== "finishing" || !ops.length))
                  return null;
                return (
                  <section
                    id={group.id}
                    key={group.id}
                    className="scroll-mt-52"
                  >
                    <div className="mb-5 flex items-center gap-3 border-b border-border pb-4">
                      <span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary">
                        <Icon name={group.icon} className="size-5" />
                      </span>
                      <div>
                        <h3 className="font-display text-2xl font-semibold">
                          {group.label}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {group.description}
                        </p>
                      </div>
                    </div>
                    {items.length ? (
                      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {items.map((tool) => (
                          <ToolCard key={tool.id} tool={tool} />
                        ))}
                      </div>
                    ) : null}
                    {group.id === "finishing" && ops.length ? (
                      <div
                        id="available-operations"
                        className="mt-8 scroll-mt-52"
                      >
                        <h4 className="font-display text-xl font-semibold">
                          Published MediaKit operations
                        </h4>
                        <p className="mt-2 text-xs text-muted-foreground">
                          These entries come from the enabled public customer
                          pricing catalogue, not from an unpublished provider
                          list.
                        </p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {ops.map((op) => (
                            <Link
                              key={op.id}
                              href={
                                ("/tools/operations/" + encodeURIComponent(op.id)) as Route
                              }
                              className="group flex min-w-0 flex-col rounded-xl border border-border bg-card p-4 transition hover:border-primary hover:shadow-sm"
                            >
                              <div className="flex items-start gap-3">
                                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                                  <Icon name="wand" className="size-4" />
                                </span>
                                <div className="min-w-0">
                                  <h5 className="text-sm font-bold group-hover:text-primary">
                                    {op.name}
                                  </h5>
                                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
                                    {op.description}
                                  </p>
                                </div>
                              </div>
                              <span className="mt-4 text-xs font-bold text-primary">
                                Explore operation →
                              </span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </section>
                );
              })}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-9 text-center">
            <Icon name="search" className="mx-auto size-8 text-primary" />
            <h3 className="font-display mt-4 text-xl font-semibold">
              No matching tools yet.
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Try a broader description or choose a different category.
            </p>
            <button
              type="button"
              className="mt-5 rounded-xl bg-secondary px-5 py-2 text-sm font-bold"
              onClick={() => {
                setQuery("");
                setCategory("all");
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </section>
      <section
        id="tool-finder"
        className="scroll-mt-24 border-y border-border bg-sidebar/45"
      >
        <div className="mx-auto grid max-w-7xl gap-9 px-5 py-16 sm:px-7 lg:grid-cols-[.85fr_1.15fr] lg:items-start lg:px-10 lg:py-24">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-primary">
              A little direction
            </p>
            <h2 className="font-display mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              Not sure where to start?
            </h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">
              Tell us the result you want and what you have to work with. This
              local guide recommends real workspace tools. It does not upload
              files or send your answers to an AI provider.
            </p>
            <Image
              src="/tool-art/explorer-hero.svg"
              alt="Original illustrated collage of creative workflows"
              width={920}
              height={690}
              className="mt-7 w-full max-w-md rounded-2xl border border-border"
            />
          </div>
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-8">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon name="sparkles" className="size-5" />
              </span>
              <div>
                <p className="font-display text-lg font-semibold">
                  Find my creative tool
                </p>
                <p className="text-xs text-muted-foreground">
                  Two quick questions. No sign-in required.
                </p>
              </div>
            </div>
            <fieldset className="mt-7">
              <legend className="text-sm font-bold">
                1. What would you like to do?
              </legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {intents.map((item) => (
                  <button
                    type="button"
                    key={item.value}
                    aria-pressed={intent === item.value}
                    onClick={() => {
                      setIntent(item.value);
                      setSource("");
                    }}
                    className={
                      "min-h-12 rounded-xl border p-3 text-left text-xs font-semibold focus-visible:outline-2 focus-visible:outline-ring " +
                      (intent === item.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-secondary")
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </fieldset>
            {intent ? (
              <fieldset className="mt-7">
                <legend className="text-sm font-bold">
                  2. What are you starting with?
                </legend>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {sources.map((item) => (
                    <button
                      type="button"
                      key={item.value}
                      aria-pressed={source === item.value}
                      onClick={() => setSource(item.value)}
                      className={
                        "min-h-12 rounded-xl border p-3 text-left text-xs font-semibold focus-visible:outline-2 focus-visible:outline-ring " +
                        (source === item.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-secondary")
                      }
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {intent && source ? (
              <div
                className="mt-7 rounded-xl border border-border bg-secondary/40 p-4"
                role="status"
                aria-live="polite"
              >
                <p className="text-xs font-bold uppercase tracking-wide text-primary">
                  Your suggested path
                </p>
                {recommendations.length ? (
                  <div className="mt-3 space-y-3">
                    {recommendations.map((tool) => (
                      <div
                        key={tool.id}
                        className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
                      >
                        <div>
                          <p className="text-sm font-bold">{tool.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {tool.headline}
                          </p>
                        </div>
                        <Link
                          href={toolHref(tool) as Route}
                          className="shrink-0 text-xs font-bold text-primary hover:underline"
                        >
                          Explore ↗
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    That combination does not have a dedicated direct workflow.
                    Try another starting material, or browse all tools below.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold">
                  <Link
                    href="/pricing"
                    className="text-primary hover:underline"
                  >
                    Compare pricing →
                  </Link>
                  <Link href="/sign-up" className="hover:underline">
                    Create an account →
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
