"use client";

import { useMemo, useState } from "react";
import { ModelActions } from "@/components/admin/model-actions";
import {
  DataTable,
  EmptyState,
  StatusBadge,
} from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";

export interface SpeechTrialUsageSummary {
  consumedCharacters: number;
  initialQuota: number;
  remainingCharacters: number;
  consumedPercent: number;
  isWarning: boolean;
  isExhausted: boolean;
  succeededJobsCount: number;
  estimatedCostSavedUsd: number;
}

export interface ModelCatalogRow {
  id: string;
  displayName: string;
  providerModelId: string;
  description: string;
  provider: "BYTEPLUS" | "NVIDIA" | "GROQ" | "GEMINI" | "CLOUDFLARE";
  mediaKind: "IMAGE" | "VIDEO" | "VOICE" | "TEXT" | "REASONING";
  enabled: boolean;
  availableTasks: string[];
  availableTaskLabels: string[];
  runtimeConfigured: boolean;
  customerCreditsLabel: string;
  customerCreditsValue: number | null;
  providerCostMicroUsdLabel: string;
  providerCostMicroUsdValue: number | null;
  status: "PRICED" | "MISSING_PRICE" | "DISABLED";
  isSeedSpeech: boolean;
  capabilities: Record<string, boolean | number | string>;
  price: {
    usageRates: unknown;
    providerCostBasisNote: string | null;
    fxBaisaNumerator: string;
    fxBaisaDenominator: string;
    providerCostMicroUsd: string;
    videoInputRate720p: string | null;
    videoInputRate1080p: string | null;
    customerCredits: string;
    targetMarginBps: number;
    pricingDimension: "REQUEST" | "CHARACTER" | "SECOND" | "TOKEN";
    unitQuantity: number;
  } | null;
}

type SortColumn =
  | "model"
  | "provider"
  | "kind"
  | "availableIn"
  | "runtime"
  | "credits"
  | "cost"
  | "status";

type SortDirection = "asc" | "desc";

function titleCase(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");
}

export function ModelCatalogTable({
  models,
  trialUsage,
  canManage,
  initialSearch = "",
  initialStatus = "",
}: {
  models: ModelCatalogRow[];
  trialUsage: SpeechTrialUsageSummary;
  canManage: boolean;
  initialSearch?: string;
  initialStatus?: string;
}) {
  // Filter state
  const [search, setSearch] = useState(initialSearch);
  const [providerFilter, setProviderFilter] = useState<string>("");
  const [kindFilter, setKindFilter] = useState<string>("");
  const [taskFilter, setTaskFilter] = useState<string>("");
  const [runtimeFilter, setRuntimeFilter] = useState<string>("");
  const [creditsFilter, setCreditsFilter] = useState<string>("");
  const [costFilter, setCostFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);

  // Sorting state
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  function handleSort(column: SortColumn) {
    if (sortColumn === column) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortColumn(null);
        setSortDirection("asc");
      }
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  }

  const hasActiveFilters = Boolean(
    search.trim() ||
    providerFilter ||
    kindFilter ||
    taskFilter ||
    runtimeFilter ||
    creditsFilter ||
    costFilter ||
    statusFilter,
  );

  function resetFilters() {
    setSearch("");
    setProviderFilter("");
    setKindFilter("");
    setTaskFilter("");
    setRuntimeFilter("");
    setCreditsFilter("");
    setCostFilter("");
    setStatusFilter("");
  }

  // Collect unique tasks for dropdown
  const allAvailableTaskLabels = useMemo(() => {
    const set = new Set<string>();
    for (const m of models) {
      for (const t of m.availableTaskLabels) {
        set.add(t);
      }
    }
    return Array.from(set).sort();
  }, [models]);

  // Filtering
  const filteredModels = useMemo(() => {
    return models.filter((row) => {
      // Search
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        const matchesName = row.displayName.toLowerCase().includes(query);
        const matchesId = row.providerModelId.toLowerCase().includes(query);
        const matchesDesc = row.description.toLowerCase().includes(query);
        if (!matchesName && !matchesId && !matchesDesc) return false;
      }

      // Provider
      if (providerFilter && row.provider !== providerFilter) {
        return false;
      }

      // Media Kind
      if (kindFilter && row.mediaKind !== kindFilter) {
        return false;
      }

      // Available in (task)
      if (taskFilter) {
        if (taskFilter === "NO_SURFACE") {
          if (row.availableTaskLabels.length > 0) return false;
        } else if (!row.availableTaskLabels.includes(taskFilter)) {
          return false;
        }
      }

      // Runtime
      if (runtimeFilter) {
        if (runtimeFilter === "READY" && !row.runtimeConfigured) return false;
        if (runtimeFilter === "MISSING" && row.runtimeConfigured) return false;
      }

      // Customer credits
      if (creditsFilter) {
        if (
          creditsFilter === "USAGE_BASED" &&
          row.customerCreditsLabel !== "Usage-based"
        )
          return false;
        if (
          creditsFilter === "UNCHARGED" &&
          row.customerCreditsLabel !== "Uncharged"
        )
          return false;
        if (
          creditsFilter === "FIXED" &&
          (row.customerCreditsLabel === "Usage-based" ||
            row.customerCreditsLabel === "Uncharged" ||
            row.customerCreditsLabel === "—")
        )
          return false;
        if (creditsFilter === "MISSING" && row.customerCreditsLabel !== "—")
          return false;
      }

      // Provider micro-USD cost
      if (costFilter) {
        if (
          costFilter === "HAS_COST" &&
          (row.providerCostMicroUsdValue === null ||
            row.providerCostMicroUsdValue <= 0)
        )
          return false;
        if (costFilter === "ZERO" && row.providerCostMicroUsdValue !== 0)
          return false;
        if (costFilter === "MISSING" && row.providerCostMicroUsdValue !== null)
          return false;
      }

      // Status
      if (statusFilter) {
        if (statusFilter === "ENABLED" && !row.enabled) return false;
        if (statusFilter === "DISABLED" && row.enabled) return false;
        if (statusFilter === "PRICED" && row.status !== "PRICED") return false;
        if (statusFilter === "MISSING_PRICE" && row.status !== "MISSING_PRICE")
          return false;
      }

      return true;
    });
  }, [
    models,
    search,
    providerFilter,
    kindFilter,
    taskFilter,
    runtimeFilter,
    creditsFilter,
    costFilter,
    statusFilter,
  ]);

  // Sorting
  const sortedModels = useMemo(() => {
    if (!sortColumn) return filteredModels;

    const list = [...filteredModels];
    list.sort((a, b) => {
      let comparison = 0;

      switch (sortColumn) {
        case "model":
          comparison = a.displayName.localeCompare(b.displayName);
          break;
        case "provider":
          comparison = a.provider.localeCompare(b.provider);
          break;
        case "kind":
          comparison = a.mediaKind.localeCompare(b.mediaKind);
          break;
        case "availableIn": {
          const aTasks = a.availableTaskLabels.join(", ");
          const bTasks = b.availableTaskLabels.join(", ");
          comparison = aTasks.localeCompare(bTasks);
          break;
        }
        case "runtime":
          comparison =
            a.runtimeConfigured === b.runtimeConfigured
              ? 0
              : a.runtimeConfigured
                ? -1
                : 1;
          break;
        case "credits": {
          const aVal = a.customerCreditsValue ?? -999;
          const bVal = b.customerCreditsValue ?? -999;
          comparison = aVal - bVal;
          break;
        }
        case "cost": {
          const aCost = a.providerCostMicroUsdValue ?? -999;
          const bCost = b.providerCostMicroUsdValue ?? -999;
          comparison = aCost - bCost;
          break;
        }
        case "status": {
          const statusOrder = { PRICED: 0, MISSING_PRICE: 1, DISABLED: 2 };
          comparison = statusOrder[a.status] - statusOrder[b.status];
          break;
        }
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return list;
  }, [filteredModels, sortColumn, sortDirection]);

  function getAriaSort(
    column: SortColumn,
  ): "ascending" | "descending" | "none" {
    if (sortColumn !== column) return "none";
    return sortDirection === "asc" ? "ascending" : "descending";
  }

  function renderSortIndicator(column: SortColumn) {
    if (sortColumn !== column) {
      return (
        <span
          className="ml-1 inline-block text-[10px] text-muted-foreground/40 transition-colors group-hover:text-foreground/70"
          aria-hidden="true"
        >
          ↕
        </span>
      );
    }
    return (
      <span
        className="ml-1 inline-block text-[10px] font-bold text-primary"
        aria-hidden="true"
      >
        {sortDirection === "asc" ? "▲" : "▼"}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      {/* BytePlus Seed Speech TTS Trial Quota Banner */}
      <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                BytePlus Seed Speech TTS 2.0 Trial Quota
              </h2>
              <StatusBadge
                tone={
                  trialUsage.isExhausted
                    ? "danger"
                    : trialUsage.isWarning
                      ? "warning"
                      : "success"
                }
              >
                {trialUsage.isExhausted
                  ? "Trial Cap Exhausted"
                  : trialUsage.isWarning
                    ? "Quota Warning (>80%)"
                    : "Active Trial Quota"}
              </StatusBadge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Internal provider subsidy tracking (19,968 characters initial
              pool). Customer billing remains standard (16 credits per 1,000
              characters).
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-muted-foreground">Used: </span>
              <strong className="text-foreground">
                {trialUsage.consumedCharacters.toLocaleString()}
              </strong>
              <span className="text-muted-foreground">
                {" "}
                / {trialUsage.initialQuota.toLocaleString()} chars
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Remaining: </span>
              <strong className="text-foreground">
                {trialUsage.remainingCharacters.toLocaleString()}
              </strong>
            </div>
          </div>
        </div>
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all duration-300 ${
                trialUsage.isExhausted
                  ? "bg-destructive"
                  : trialUsage.isWarning
                    ? "bg-warning"
                    : "bg-primary"
              }`}
              style={{
                width: `${Math.min(100, trialUsage.consumedPercent)}%`,
              }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
            <span>
              {trialUsage.consumedPercent}% consumed (
              {trialUsage.succeededJobsCount} succeeded jobs)
            </span>
            <span>
              Provider cost saved: $
              {trialUsage.estimatedCostSavedUsd.toFixed(4)} USD
            </span>
          </div>
        </div>
      </div>

      {/* Multi-category Filter Controls Bar */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* 1. Search */}
          <div>
            <label
              htmlFor="model-filter-search"
              className="block text-xs font-semibold text-foreground mb-1"
            >
              Search
            </label>
            <input
              id="model-filter-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name, ID or notes..."
              className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* 2. Provider */}
          <div>
            <label
              htmlFor="model-filter-provider"
              className="block text-xs font-semibold text-foreground mb-1"
            >
              Provider
            </label>
            <select
              id="model-filter-provider"
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All providers</option>
              <option value="BYTEPLUS">BytePlus</option>
              <option value="GEMINI">Gemini</option>
              <option value="GROQ">Groq</option>
              <option value="NVIDIA">NVIDIA</option>
              <option value="CLOUDFLARE">Cloudflare</option>
            </select>
          </div>

          {/* 3. Media Kind */}
          <div>
            <label
              htmlFor="model-filter-kind"
              className="block text-xs font-semibold text-foreground mb-1"
            >
              Kind
            </label>
            <select
              id="model-filter-kind"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All kinds</option>
              <option value="TEXT">Text</option>
              <option value="IMAGE">Image</option>
              <option value="VIDEO">Video</option>
              <option value="VOICE">Voice</option>
              <option value="REASONING">Reasoning</option>
            </select>
          </div>

          {/* 4. Available in / Surface */}
          <div>
            <label
              htmlFor="model-filter-task"
              className="block text-xs font-semibold text-foreground mb-1"
            >
              Available in
            </label>
            <select
              id="model-filter-task"
              value={taskFilter}
              onChange={(e) => setTaskFilter(e.target.value)}
              className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All feature surfaces</option>
              {allAvailableTaskLabels.map((task) => (
                <option key={task} value={task}>
                  {task}
                </option>
              ))}
              <option value="NO_SURFACE">No frontend surface</option>
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* 5. Runtime Readiness */}
          <div>
            <label
              htmlFor="model-filter-runtime"
              className="block text-xs font-semibold text-foreground mb-1"
            >
              Runtime
            </label>
            <select
              id="model-filter-runtime"
              value={runtimeFilter}
              onChange={(e) => setRuntimeFilter(e.target.value)}
              className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All runtime states</option>
              <option value="READY">Ready</option>
              <option value="MISSING">Credentials missing</option>
            </select>
          </div>

          {/* 6. Customer Credits */}
          <div>
            <label
              htmlFor="model-filter-credits"
              className="block text-xs font-semibold text-foreground mb-1"
            >
              Customer credits
            </label>
            <select
              id="model-filter-credits"
              value={creditsFilter}
              onChange={(e) => setCreditsFilter(e.target.value)}
              className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All billing types</option>
              <option value="USAGE_BASED">Usage-based</option>
              <option value="FIXED">Fixed credits</option>
              <option value="UNCHARGED">Uncharged</option>
              <option value="MISSING">Missing price</option>
            </select>
          </div>

          {/* 7. Provider micro-USD */}
          <div>
            <label
              htmlFor="model-filter-cost"
              className="block text-xs font-semibold text-foreground mb-1"
            >
              Provider micro-USD
            </label>
            <select
              id="model-filter-cost"
              value={costFilter}
              onChange={(e) => setCostFilter(e.target.value)}
              className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All costs</option>
              <option value="HAS_COST">Has provider cost (&gt; 0)</option>
              <option value="ZERO">Zero cost</option>
              <option value="MISSING">Unpriced</option>
            </select>
          </div>

          {/* 8. Status */}
          <div>
            <label
              htmlFor="model-filter-status"
              className="block text-xs font-semibold text-foreground mb-1"
            >
              Status
            </label>
            <select
              id="model-filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All statuses</option>
              <option value="PRICED">Priced</option>
              <option value="MISSING_PRICE">Missing price</option>
              <option value="DISABLED">Disabled</option>
              <option value="ENABLED">Enabled</option>
            </select>
          </div>
        </div>

        {/* Filter Action & Results Count */}
        <div className="flex flex-col gap-2 pt-2 border-t border-border/60 sm:flex-row sm:items-center sm:justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">
              Showing {sortedModels.length} of {models.length} models
            </span>
            {hasActiveFilters && (
              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                Filtered
              </span>
            )}
            {sortColumn && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                Sorted by {sortColumn} ({sortDirection})
              </span>
            )}
          </div>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={resetFilters}
              className="h-8 text-xs self-start sm:self-auto"
            >
              Reset all filters
            </Button>
          )}
        </div>
      </div>

      {/* Model Catalog Table (No pagination - all models rendered) */}
      {sortedModels.length === 0 ? (
        <EmptyState
          icon="sparkles"
          title="No models match these filters"
          description="Clear or adjust your filters to see provider models."
          action={
            <Button variant="secondary" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <DataTable label="Model catalog">
          <thead>
            <tr className="border-b border-border text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {/* 1. Model */}
              <th
                scope="col"
                aria-sort={getAriaSort("model")}
                className="pb-3 text-left"
              >
                <button
                  type="button"
                  onClick={() => handleSort("model")}
                  className="group flex items-center hover:text-foreground focus:outline-none"
                >
                  <span>Model</span>
                  {renderSortIndicator("model")}
                </button>
              </th>

              {/* 2. Provider */}
              <th
                scope="col"
                aria-sort={getAriaSort("provider")}
                className="pb-3 text-left"
              >
                <button
                  type="button"
                  onClick={() => handleSort("provider")}
                  className="group flex items-center hover:text-foreground focus:outline-none"
                >
                  <span>Provider</span>
                  {renderSortIndicator("provider")}
                </button>
              </th>

              {/* 3. Kind */}
              <th
                scope="col"
                aria-sort={getAriaSort("kind")}
                className="pb-3 text-left"
              >
                <button
                  type="button"
                  onClick={() => handleSort("kind")}
                  className="group flex items-center hover:text-foreground focus:outline-none"
                >
                  <span>Kind</span>
                  {renderSortIndicator("kind")}
                </button>
              </th>

              {/* 4. Available in */}
              <th
                scope="col"
                aria-sort={getAriaSort("availableIn")}
                className="pb-3 text-left"
              >
                <button
                  type="button"
                  onClick={() => handleSort("availableIn")}
                  className="group flex items-center hover:text-foreground focus:outline-none"
                >
                  <span>Available in</span>
                  {renderSortIndicator("availableIn")}
                </button>
              </th>

              {/* 5. Runtime */}
              <th
                scope="col"
                aria-sort={getAriaSort("runtime")}
                className="pb-3 text-left"
              >
                <button
                  type="button"
                  onClick={() => handleSort("runtime")}
                  className="group flex items-center hover:text-foreground focus:outline-none"
                >
                  <span>Runtime</span>
                  {renderSortIndicator("runtime")}
                </button>
              </th>

              {/* 6. Customer credits */}
              <th
                scope="col"
                aria-sort={getAriaSort("credits")}
                className="pb-3 text-right"
              >
                <button
                  type="button"
                  onClick={() => handleSort("credits")}
                  className="group ml-auto flex items-center hover:text-foreground focus:outline-none"
                >
                  <span>Customer credits</span>
                  {renderSortIndicator("credits")}
                </button>
              </th>

              {/* 7. Provider micro-USD */}
              <th
                scope="col"
                aria-sort={getAriaSort("cost")}
                className="pb-3 text-right"
              >
                <button
                  type="button"
                  onClick={() => handleSort("cost")}
                  className="group ml-auto flex items-center hover:text-foreground focus:outline-none"
                >
                  <span>Provider micro-USD</span>
                  {renderSortIndicator("cost")}
                </button>
              </th>

              {/* 8. Status */}
              <th
                scope="col"
                aria-sort={getAriaSort("status")}
                className="pb-3 text-left pl-3"
              >
                <button
                  type="button"
                  onClick={() => handleSort("status")}
                  className="group flex items-center hover:text-foreground focus:outline-none"
                >
                  <span>Status</span>
                  {renderSortIndicator("status")}
                </button>
              </th>

              {/* 9. Actions */}
              {canManage ? (
                <th scope="col" className="pb-3 text-left">
                  Actions
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedModels.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-muted/20">
                {/* 1. Model */}
                <td className="py-4 pr-4 text-xs text-muted-foreground">
                  <strong className="text-foreground">{row.displayName}</strong>
                  <span className="mt-1 block font-mono text-[9px] text-muted-foreground">
                    {row.providerModelId}
                  </span>
                  <p
                    className="mt-1 max-w-[200px] truncate text-[10px] text-muted-foreground"
                    title={row.description}
                  >
                    {row.description}
                  </p>
                  {row.isSeedSpeech ? (
                    <div className="mt-1.5">
                      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                        Trial pool:{" "}
                        {trialUsage.consumedCharacters.toLocaleString()} /{" "}
                        {trialUsage.initialQuota.toLocaleString()} chars (
                        {trialUsage.consumedPercent}%)
                      </span>
                    </div>
                  ) : null}
                </td>

                {/* 2. Provider */}
                <td className="py-4 pr-4 text-xs text-muted-foreground">
                  {titleCase(row.provider)}
                </td>

                {/* 3. Kind */}
                <td className="py-4 pr-4 text-xs text-muted-foreground">
                  {titleCase(row.mediaKind)}
                </td>

                {/* 4. Available in */}
                <td className="py-4 pr-4 text-xs text-muted-foreground">
                  {row.availableTaskLabels.length > 0
                    ? row.availableTaskLabels.join(", ")
                    : "No frontend surface"}
                </td>

                {/* 5. Runtime */}
                <td className="py-4 pr-4 text-xs">
                  <StatusBadge
                    tone={row.runtimeConfigured ? "success" : "warning"}
                  >
                    {row.runtimeConfigured ? "Ready" : "Credentials missing"}
                  </StatusBadge>
                </td>

                {/* 6. Customer credits */}
                <td className="py-4 pr-4 text-right font-mono text-xs font-semibold tabular-nums text-foreground">
                  {row.customerCreditsLabel}
                </td>

                {/* 7. Provider micro-USD */}
                <td className="py-4 pr-4 text-right font-mono text-xs font-semibold tabular-nums text-foreground">
                  {row.providerCostMicroUsdLabel}
                </td>

                {/* 8. Status */}
                <td className="py-4 pr-4 pl-3 text-xs">
                  <StatusBadge
                    tone={
                      row.status === "DISABLED"
                        ? "neutral"
                        : row.status === "PRICED"
                          ? "success"
                          : "warning"
                    }
                  >
                    {row.status === "DISABLED"
                      ? "Disabled"
                      : row.status === "PRICED"
                        ? "Priced"
                        : "Missing price"}
                  </StatusBadge>
                </td>

                {/* 9. Actions */}
                {canManage ? (
                  <td className="py-4 pr-4 text-xs">
                    <ModelActions
                      modelId={row.id}
                      providerModelId={row.providerModelId}
                      displayName={row.displayName}
                      provider={row.provider}
                      enabled={row.enabled}
                      currentUsageRates={row.price?.usageRates}
                      currentProviderCostBasisNote={
                        row.price?.providerCostBasisNote
                      }
                      currentFxBaisaNumerator={row.price?.fxBaisaNumerator}
                      currentFxBaisaDenominator={row.price?.fxBaisaDenominator}
                      currentProviderCostMicroUsd={
                        row.price?.providerCostMicroUsd
                      }
                      currentVideoInputRate720p={
                        row.price?.videoInputRate720p ?? undefined
                      }
                      currentVideoInputRate1080p={
                        row.price?.videoInputRate1080p ?? undefined
                      }
                      currentCustomerCredits={row.price?.customerCredits}
                      currentTargetMarginBps={row.price?.targetMarginBps}
                      currentPricingDimension={row.price?.pricingDimension}
                      currentUnitQuantity={row.price?.unitQuantity}
                      canManage={canManage}
                      mediaKind={row.mediaKind}
                      transcription={row.capabilities.transcription === true}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
