"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icon";
import {
  pricingCategories,
  type PricingCategory,
  type PublicPricingCatalogue,
  type PublicPricingItem,
} from "@/lib/public-pricing-contract";

const icons: Record<PricingCategory, IconName> = {
  chat: "chat",
  image: "image",
  video: "video",
  speech: "voice",
  audio: "activity",
  transcription: "script",
  avatar: "director",
  tools: "wand",
};
const dimensionLabels: Record<string, string> = {
  REQUEST: "request",
  CHARACTER: "characters",
  SECOND: "seconds",
  TOKEN: "tokens",
  INPUT_SECOND: "input seconds",
  OUTPUT_SECOND: "output seconds",
  INPUT_BYTE: "input bytes",
};
function priceLabel(item: PublicPricingItem) {
  if (item.tiers.length) return "Tiered token rates";
  const unit = dimensionLabels[item.dimension] ?? item.dimension.toLowerCase();
  return (
    item.baseCredits +
    " credits / " +
    item.unitQuantity.toLocaleString("en-US") +
    " " +
    unit
  );
}

export function PricingExplorer({
  catalogue,
}: {
  catalogue: PublicPricingCatalogue;
}) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [selected, setSelected] = useState<PublicPricingItem | null>(null);
  const [compared, setCompared] = useState<string[]>([]);
  const [calculatorId, setCalculatorId] = useState(
    catalogue.models.find((item) => item.calculator !== "reference")?.id ?? "",
  );
  const [units, setUnits] = useState("1000");
  const [promptTokens, setPromptTokens] = useState("2000");
  const [completionTokens, setCompletionTokens] = useState("500");
  const [cachedPromptTokens, setCachedPromptTokens] = useState("0");
  const [estimate, setEstimate] = useState<{
    estimatedCredits: string;
    estimatedOmr: string;
    basis: string;
    note: string;
  } | null>(null);
  const [estimateError, setEstimateError] = useState("");
  const [pending, setPending] = useState(false);
  const providers = useMemo(
    () =>
      Array.from(new Set(catalogue.models.map((item) => item.provider))).sort(),
    [catalogue.models],
  );
  const filtered = useMemo(
    () =>
      catalogue.models.filter(
        (item) =>
          (provider === "all" || item.provider === provider) &&
          [
            item.name,
            item.provider,
            item.description,
            ...item.availableIn,
            ...item.capabilities,
          ]
            .join(" ")
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ),
    [catalogue.models, provider, query],
  );
  const calculatorItems = catalogue.models.filter(
    (item) => item.calculator !== "reference",
  );
  const calculatorModel = calculatorItems.find(
    (item) => item.id === calculatorId,
  );
  const comparedItems = catalogue.models.filter((item) =>
    compared.includes(item.id),
  );
  function toggleCompare(item: PublicPricingItem) {
    setCompared((current) =>
      current.includes(item.id)
        ? current.filter((id) => id !== item.id)
        : current.length < 3
          ? [...current, item.id]
          : current,
    );
  }
  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!calculatorModel) return;
    setPending(true);
    setEstimate(null);
    setEstimateError("");
    const payload =
      calculatorModel.calculator === "text"
        ? {
            id: calculatorModel.id,
            version: calculatorModel.priceVersionId,
            promptTokens: Number(promptTokens),
            completionTokens: Number(completionTokens),
            cachedPromptTokens: Number(cachedPromptTokens),
          }
        : {
            id: calculatorModel.id,
            version: calculatorModel.priceVersionId,
            units: Number(units),
          };
    try {
      const response = await fetch("/api/public/pricing/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        estimatedCredits?: string;
        estimatedOmr?: string;
        basis?: string;
        note?: string;
        error?: string;
      };
      if (
        !response.ok ||
        !result.estimatedCredits ||
        !result.estimatedOmr ||
        !result.basis ||
        !result.note
      )
        throw new Error(result.error ?? "Could not calculate this estimate.");
      setEstimate({
        estimatedCredits: result.estimatedCredits,
        estimatedOmr: result.estimatedOmr,
        basis: result.basis,
        note: result.note,
      });
    } catch (error) {
      setEstimateError(
        error instanceof Error
          ? error.message
          : "The estimate could not be calculated.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <section
        id="catalogue"
        className="scroll-mt-24 mx-auto max-w-7xl px-5 py-16 sm:px-7 lg:px-10 lg:py-24"
        aria-labelledby="catalogue-title"
      >
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[.18em] text-primary">
              The model atlas
            </p>
            <h2
              id="catalogue-title"
              className="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-5xl"
            >
              Find the right tool for the job.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              Every listed rate comes from an enabled, published pricing
              version. Select a row to see more details; exact generation quotes
              appear inside your workspace.
            </p>
          </div>
          <span className="rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold tabular-nums text-muted-foreground">
            {catalogue.models.length} published entries
          </span>
        </div>
        <div className="sticky top-0 z-20 -mx-5 mt-9 border-y border-border bg-background/95 px-5 py-3 backdrop-blur-lg sm:-mx-7 sm:px-7 lg:-mx-10 lg:px-10">
          <div
            className="flex gap-2 overflow-x-auto pb-1"
            aria-label="Pricing categories"
          >
            {pricingCategories.map((category) => (
              <a
                key={category.id}
                href={"#" + category.id}
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Icon
                  name={icons[category.id]}
                  className="size-4 text-primary"
                />
                {category.label}
              </a>
            ))}
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_220px]">
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-input bg-card px-4 focus-within:ring-2 focus-within:ring-ring">
            <Icon name="search" className="size-4 text-muted-foreground" />
            <span className="sr-only">Search models or capabilities</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models, workflows, capabilities…"
              className="min-w-0 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              type="search"
            />
          </label>
          <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-input bg-card px-4 text-sm">
            <span className="sr-only">Filter provider</span>
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              className="w-full bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">All providers</option>
              {providers.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        {pricingCategories.map((category) => {
          const entries = filtered.filter(
            (item) => item.category === category.id,
          );
          return (
            <section
              id={category.id}
              key={category.id}
              className="scroll-mt-44 mt-14 sm:mt-20"
              aria-labelledby={category.id + "-heading"}
            >
              <div className="mb-5 flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-primary/10 text-primary">
                  <Icon name={icons[category.id]} className="size-5" />
                </span>
                <div className="min-w-0">
                  <h3
                    id={category.id + "-heading"}
                    className="font-display text-2xl font-semibold tracking-tight sm:text-3xl"
                  >
                    {category.label}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {category.description}
                  </p>
                </div>
                <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {entries.length}
                </span>
              </div>
              {entries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card/50 p-7 text-sm text-muted-foreground">
                  {query || provider !== "all"
                    ? "No matching published entries. Try clearing your search or filter."
                    : "No currently available, published entries in this category."}
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[800px] border-collapse text-left text-sm">
                      <thead className="bg-secondary/70 text-xs font-semibold text-muted-foreground">
                        <tr>
                          <th className="px-5 py-4">Model / tool</th>
                          <th className="px-4 py-4">Billing & retail price</th>
                          <th className="px-4 py-4">Available in</th>
                          <th className="px-4 py-4 text-right">Explore</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {entries.map((item) => (
                          <tr
                            key={item.kind + item.id}
                            className="align-top transition hover:bg-secondary/40"
                          >
                            <td className="px-5 py-5">
                              <div className="font-semibold text-foreground">
                                {item.name}
                              </div>
                              <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-primary">
                                {item.provider}
                              </div>
                              <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
                                {item.description}
                              </p>
                            </td>
                            <td className="px-4 py-5">
                              <p className="font-semibold tabular-nums">
                                {priceLabel(item)}
                              </p>
                              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                                {item.tiers.length
                                  ? "See individual token tiers"
                                  : item.baseOmr +
                                    (item.exampleOnly
                                      ? " · reference rate"
                                      : "")}
                              </p>
                            </td>
                            <td className="px-4 py-5">
                              <div className="flex max-w-[180px] flex-wrap gap-1">
                                {item.availableIn.map((name) => (
                                  <span
                                    key={name}
                                    className="rounded-md bg-secondary px-2 py-1 text-[10px] font-semibold text-secondary-foreground"
                                  >
                                    {name}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-5">
                              <div className="flex items-center justify-end gap-2">
                                <label
                                  className="sr-only"
                                  htmlFor={"compare-" + item.id}
                                >
                                  Compare {item.name}
                                </label>
                                <input
                                  id={"compare-" + item.id}
                                  type="checkbox"
                                  checked={compared.includes(item.id)}
                                  onChange={() => toggleCompare(item)}
                                  disabled={
                                    !compared.includes(item.id) &&
                                    compared.length >= 3
                                  }
                                  className="size-4 accent-primary"
                                />
                                <button
                                  type="button"
                                  onClick={() => setSelected(item)}
                                  className="min-h-10 rounded-xl border border-border px-3 text-xs font-semibold hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
                                >
                                  Details
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="divide-y divide-border md:hidden">
                    {entries.map((item) => (
                      <article key={item.kind + item.id} className="p-5">
                        <div className="flex justify-between gap-3">
                          <div>
                            <h4 className="font-semibold">{item.name}</h4>
                            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-primary">
                              {item.provider}
                            </p>
                          </div>
                          <label className="flex shrink-0 items-start gap-2 text-xs text-muted-foreground">
                            <input
                              aria-label={"Compare " + item.name}
                              type="checkbox"
                              checked={compared.includes(item.id)}
                              onChange={() => toggleCompare(item)}
                              disabled={
                                !compared.includes(item.id) &&
                                compared.length >= 3
                              }
                              className="size-4 accent-primary"
                            />{" "}
                            Compare
                          </label>
                        </div>
                        <p className="mt-3 text-xs leading-5 text-muted-foreground">
                          {item.description}
                        </p>
                        <div className="mt-4 rounded-xl bg-secondary/60 p-3">
                          <p className="text-xs font-semibold tabular-nums">
                            {priceLabel(item)}
                          </p>
                          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                            {item.tiers.length
                              ? "See individual token tiers"
                              : item.baseOmr + (item.exampleOnly ? " · reference rate" : "")}
                          </p>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">
                          Available in: {item.availableIn.join(", ")}
                        </p>
                        <button
                          type="button"
                          onClick={() => setSelected(item)}
                          className="mt-4 min-h-11 w-full rounded-xl border border-border text-xs font-semibold hover:border-primary focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          View model details <span aria-hidden="true">→</span>
                        </button>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </section>
      {comparedItems.length > 0 && (
        <aside
          className="fixed inset-x-3 bottom-3 z-30 mx-auto max-w-3xl rounded-2xl border border-border bg-card p-4 shadow-lg"
          aria-label="Comparison selection"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold">
              Compare ({comparedItems.length}/3):{" "}
              <span className="font-normal text-muted-foreground">
                {comparedItems.map((item) => item.name).join(", ")}
              </span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCompared([])}
                className="min-h-10 rounded-lg px-3 text-xs font-semibold hover:bg-secondary"
              >
                Clear
              </button>
              <button
                onClick={() => setSelected(comparedItems[0] ?? null)}
                className="min-h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground"
              >
                Inspect selection
              </button>
            </div>
          </div>
          {comparedItems.length > 1 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {comparedItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl bg-secondary/70 p-3 text-xs"
                >
                  <p className="font-semibold">{item.name}</p>
                  <p className="mt-1 tabular-nums text-muted-foreground">
                    {priceLabel(item)}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {item.tiers.length ? "See token tiers" : item.baseOmr}
                  </p>
                  <button
                    onClick={() => setSelected(item)}
                    className="mt-2 font-semibold text-primary underline underline-offset-4"
                  >
                    Full details
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>
      )}
      {selected && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-foreground/35"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="model-dialog-title"
            className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-background p-5 shadow-xl sm:p-8"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-xs font-bold uppercase tracking-widest text-primary">
                Model details
              </p>
              <button
                autoFocus
                aria-label="Close model details"
                onClick={() => setSelected(null)}
                className="grid size-11 place-items-center rounded-xl border border-border text-xl hover:bg-secondary"
              >
                ×
              </button>
            </div>
            <h2
              id="model-dialog-title"
              className="font-display mt-7 text-3xl font-semibold tracking-tight"
            >
              {selected.name}
            </h2>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-primary">
              {selected.provider} · {selected.category}
            </p>
            <p className="mt-5 leading-7 text-muted-foreground">
              {selected.description}
            </p>
            <div className="mt-8 rounded-2xl border border-border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Published reference price
              </p>
              <p className="mt-2 text-xl font-semibold tabular-nums">
                {priceLabel(selected)}
              </p>
              <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                {selected.tiers.length ? "See customer token tiers below" : selected.baseOmr}
              </p>
              {selected.tiers.length === 0 && <details className="mt-3 rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer font-semibold">
                  Detailed retail equivalence (µUSD)
                </summary>
                <p className="mt-2 tabular-nums">
                  Approximately{" "}
                  {Number(selected.retailMicroUsdApprox).toLocaleString(
                    "en-US",
                  )}{" "}
                  microUSD at this price snapshot. This is the customer retail
                  equivalent, not the provider purchase cost.
                </p>
              </details>}
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {selected.exampleOnly
                  ? "Reference rate only. Resolution, input assets, additional references and usage can change the final quote."
                  : "This is the published base-unit price. Your Studio confirms the applicable quote before submission."}
              </p>
            </div>
            {selected.tiers.length > 0 && (
              <div className="mt-8">
                <h3 className="font-display text-xl font-semibold">
                  Customer token rates
                </h3>
                <p className="mt-2 text-xs text-muted-foreground">
                  Credit-rate equivalents per 1 million tokens; each prompt is
                  billed against the applicable context tier, with job-level
                  rounding.
                </p>
                <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[430px] text-left text-xs tabular-nums">
                    <thead className="bg-secondary">
                      <tr>
                        <th className="p-3">Prompt tier</th>
                        <th className="p-3">Input</th>
                        <th className="p-3">Cached</th>
                        <th className="p-3">Output</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selected.tiers.map((tier) => (
                        <tr key={tier.maxPromptTokens}>
                          <td className="p-3">
                            ≤ {tier.maxPromptTokens.toLocaleString("en-US")}
                          </td>
                          <td className="p-3">{tier.inputCreditsPerMillion}</td>
                          <td className="p-3">
                            {tier.cachedInputCreditsPerMillion ?? "N/A"}
                          </td>
                          <td className="p-3">
                            {tier.outputCreditsPerMillion}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <h3 className="font-display mt-8 text-xl font-semibold">
              Available in
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {selected.availableIn.map((task) => (
                <span
                  key={task}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold"
                >
                  {task}
                </span>
              ))}
            </div>
            {selected.capabilities.length > 0 && (
              <>
                <h3 className="font-display mt-8 text-xl font-semibold">
                  Specifications & capabilities
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selected.capabilities.map((capability) => (
                    <span
                      key={capability}
                      className="rounded-lg bg-secondary px-3 py-2 text-xs font-semibold"
                    >
                      {capability}
                    </span>
                  ))}
                </div>
              </>
            )}
            <p className="mt-7 text-xs text-muted-foreground">
              Pricing effective{" "}
              {new Date(selected.effectiveFrom).toLocaleDateString("en-GB", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
              . Figures are customer-facing only; final charges are based on the
              signed in-workspace quote.
            </p>
            <Link
              href="/sign-up"
              className="mt-7 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
            >
              Start creating <Icon name="arrow" className="size-4" />
            </Link>
          </section>
        </div>
      )}
      <section
        id="calculator"
        className="scroll-mt-28 border-y border-border bg-sidebar/55 py-16 sm:py-24"
      >
        <div className="mx-auto grid max-w-7xl gap-9 px-5 sm:px-7 lg:grid-cols-[.8fr_1.2fr] lg:items-start lg:px-10">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[.18em] text-primary">
              Plan with confidence
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
              Calculate before you create.
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-7 text-muted-foreground">
              Explore a representative cost using active retail pricing. Models
              with variable media or tool charges require your real project
              settings and assets, so those receive an exact quote after signing
              in.
            </p>
            <div className="mt-7 flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-xs leading-5 text-muted-foreground">
              <Icon name="shield" className="size-6 shrink-0 text-primary" />{" "}
              This public calculator cannot reserve credits, access a wallet or
              submit a generation.
            </div>
          </div>
          <form
            onSubmit={calculate}
            className="rounded-3xl border border-border bg-card p-5 shadow-md sm:p-8"
          >
            <h3 className="font-display text-2xl font-semibold">
              Quick estimate
            </h3>
            {calculatorItems.length === 0 ? (
              <p className="mt-5 text-sm text-muted-foreground">
                No simple-usage models are currently available for a public
                estimate. Explore the published reference prices above.
              </p>
            ) : (
              <>
                <label
                  htmlFor="estimate-model"
                  className="mt-6 block text-xs font-semibold"
                >
                  Choose a model
                </label>
                <select
                  id="estimate-model"
                  value={calculatorId}
                  onChange={(event) => {
                    setCalculatorId(event.target.value);
                    setEstimate(null);
                    setEstimateError("");
                  }}
                  className="mt-2 min-h-12 w-full rounded-xl border border-input bg-background px-4 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {calculatorItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.provider}
                    </option>
                  ))}
                </select>
                {calculatorModel?.calculator === "text" ? (
                  <div className="mt-5 grid gap-4 sm:grid-cols-3">
                    {(
                      [
                        {
                          label: "Prompt tokens",
                          value: promptTokens,
                          setter: setPromptTokens,
                          max:
                            calculatorModel.tiers[
                              calculatorModel.tiers.length - 1
                            ]?.maxPromptTokens ?? 1048576,
                        },
                        {
                          label: "Cached prompt",
                          value: cachedPromptTokens,
                          setter: setCachedPromptTokens,
                          max: Number(promptTokens) || 0,
                        },
                        {
                          label: "Output tokens",
                          value: completionTokens,
                          setter: setCompletionTokens,
                          max: 1048576,
                        },
                      ] as const
                    ).map((field) => (
                      <label
                        className="block text-xs font-semibold"
                        key={field.label}
                      >
                        {field.label}
                        <input
                          type="number"
                          min="0"
                          max={field.max}
                          step="1"
                          required
                          value={field.value}
                          onChange={(event) => field.setter(event.target.value)}
                          className="mt-2 min-h-12 w-full rounded-xl border border-input bg-background px-3 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-ring"
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <label className="mt-5 block text-xs font-semibold">
                    Billable{" "}
                    {dimensionLabels[calculatorModel?.dimension ?? ""] ??
                      "units"}
                    <input
                      type="number"
                      min="1"
                      max="100000"
                      step="1"
                      required
                      value={units}
                      onChange={(event) => setUnits(event.target.value)}
                      className="mt-2 min-h-12 w-full rounded-xl border border-input bg-background px-4 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-ring"
                    />
                  </label>
                )}
                <button
                  disabled={pending}
                  type="submit"
                  className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                >
                  {pending ? "Calculating…" : "Calculate example cost"}
                  <Icon name="arrow" className="size-4" />
                </button>
                {estimateError && (
                  <p
                    role="alert"
                    className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
                  >
                    {estimateError}
                  </p>
                )}
                {estimate && (
                  <output
                    aria-live="polite"
                    className="mt-5 block rounded-xl border border-primary/25 bg-primary/5 p-5"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                      {estimate.basis}
                    </p>
                    <p className="mt-3 font-display text-4xl font-semibold tabular-nums">
                      {Number(estimate.estimatedCredits).toLocaleString(
                        "en-US",
                      )}{" "}
                      <span className="text-base text-muted-foreground">
                        credits
                      </span>
                    </p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-primary">
                      {estimate.estimatedOmr}
                    </p>
                    <p className="mt-4 text-xs leading-5 text-muted-foreground">
                      {estimate.note}
                    </p>
                  </output>
                )}
              </>
            )}
          </form>
        </div>
      </section>
    </>
  );
}
