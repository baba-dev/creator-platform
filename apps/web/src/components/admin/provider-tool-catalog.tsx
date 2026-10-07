"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DataTable, EmptyState, StatusBadge } from "./primitives";

export type ProviderToolCatalogRow = {
  id: string;
  providerToolId: string;
  displayName: string;
  description: string;
  category: string;
  executionMode: "ASYNC" | "SYNC";
  pricingMetric: "REQUEST" | "INPUT_SECOND" | "OUTPUT_SECOND";
  enabled: boolean;
  executionCount: number;
  price: null | {
    providerCostMicroUsd: string;
    customerCredits: string;
    unitQuantity: number;
    targetMarginBps: number;
    providerCostBasisNote: string | null;
  };
};

async function apiPatch(toolId: string, body: unknown) {
  const response = await fetch(`/api/admin/tools/${toolId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    priceVersion?: { customerCredits?: string };
  };
  if (!response.ok)
    throw new Error(payload.error ?? "MediaKit admin request failed.");
  return payload;
}

export function ProviderToolCatalog({
  initialRows,
  canManage,
  runtimeConfigured,
}: {
  initialRows: ProviderToolCatalogRow[];
  canManage: boolean;
  runtimeConfigured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pricingTool, setPricingTool] = useState<ProviderToolCatalogRow | null>(
    null,
  );

  async function sync() {
    setBusy("sync");
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/tools/sync", { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        count?: number;
      };
      if (!response.ok) throw new Error(payload.error ?? "Tool sync failed.");
      setFeedback(`Synchronized ${payload.count ?? 0} audited MediaKit tools.`);
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Tool sync failed.");
    } finally {
      setBusy(null);
    }
  }

  async function toggle(row: ProviderToolCatalogRow) {
    setBusy(row.id);
    setFeedback(null);
    try {
      await apiPatch(row.id, { enabled: !row.enabled });
      setFeedback(
        `${row.displayName} ${row.enabled ? "disabled" : "enabled"}.`,
      );
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Availability update failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function publishPrice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pricingTool) return;
    const data = new FormData(event.currentTarget);
    setBusy(`price:${pricingTool.id}`);
    setFeedback(null);
    try {
      const payload = await apiPatch(pricingTool.id, {
        idempotencyKey: crypto.randomUUID(),
        providerCostMicroUsd: String(data.get("providerCostMicroUsd") ?? ""),
        targetMarginBps: Math.round(Number(data.get("marginPercent")) * 100),
        unitQuantity:
          pricingTool.pricingMetric === "REQUEST"
            ? 1
            : Number(data.get("unitQuantity")),
        providerCostBasisNote: String(data.get("providerCostBasisNote") ?? ""),
      });
      setFeedback(
        `Price published for ${pricingTool.displayName}: ${payload.priceVersion?.customerCredits ?? "—"} credits per billing block.`,
      );
      setPricingTool(null);
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Price publication failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Audited tool registry</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Runtime endpoints come only from the server registry; database rows
            cannot redirect the worker to arbitrary URLs.
          </p>
        </div>
        {canManage ? (
          <Button onClick={sync} disabled={busy !== null}>
            {busy === "sync" ? "Synchronizing…" : "Sync MediaKit registry"}
          </Button>
        ) : null}
      </div>

      {feedback ? (
        <p role="status" className="mb-4 rounded-xl bg-muted px-3 py-2 text-xs">
          {feedback}
        </p>
      ) : null}

      {initialRows.length === 0 ? (
        <EmptyState
          icon="wand"
          title="MediaKit registry is not synchronized"
          description="Synchronize the audited server registry to create disabled tool records. No tool is enabled automatically."
          action={
            canManage ? (
              <Button onClick={sync}>Sync registry</Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable label="MediaKit provider tools">
          <thead className="border-b border-border text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Tool</th>
              <th className="px-3 py-3">Execution</th>
              <th className="px-3 py-3">Pricing</th>
              <th className="px-3 py-3">Usage</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3 text-right">Controls</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {initialRows.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="px-3 py-4">
                  <p className="font-semibold">{row.displayName}</p>
                  <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                    {row.description}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {row.providerToolId}
                  </p>
                </td>
                <td className="px-3 py-4 text-xs">
                  <p>{row.executionMode}</p>
                  <p className="mt-1 capitalize text-muted-foreground">
                    {row.category}
                  </p>
                </td>
                <td className="px-3 py-4 text-xs">
                  <p>{row.pricingMetric.replaceAll("_", " ")}</p>
                  {row.price ? (
                    <>
                      <p className="mt-1 font-mono">
                        {row.price.customerCredits} credits /{" "}
                        {row.price.unitQuantity}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {row.price.targetMarginBps / 100}% margin
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-warning">Unpriced</p>
                  )}
                </td>
                <td className="px-3 py-4 font-mono text-xs">
                  {row.executionCount}
                </td>
                <td className="px-3 py-4">
                  <StatusBadge tone={row.enabled ? "success" : "neutral"}>
                    {row.enabled ? "Enabled" : "Disabled"}
                  </StatusBadge>
                  {!runtimeConfigured ? (
                    <p className="mt-2 text-[10px] text-warning">
                      Credential missing
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-4">
                  {canManage ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setPricingTool(row)}
                        disabled={busy !== null}
                      >
                        Price
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => toggle(row)}
                        disabled={
                          busy !== null ||
                          (!row.enabled && (!row.price || !runtimeConfigured))
                        }
                      >
                        {row.enabled ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      {pricingTool ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/75 p-4 backdrop-blur-sm">
          <form
            onSubmit={publishPrice}
            className="w-full max-w-xl rounded-3xl border border-border bg-card p-6 shadow-xl"
          >
            <h2 className="font-display text-2xl font-semibold">
              Price {pricingTool.displayName}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Provider cost is stored as integer micro-USD. Customer credits are
              calculated server-side with exact integer arithmetic.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold">
                Provider cost (micro-USD)
                <input
                  name="providerCostMicroUsd"
                  required
                  inputMode="numeric"
                  pattern="[1-9][0-9]*"
                  defaultValue={pricingTool.price?.providerCostMicroUsd ?? ""}
                  className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 font-mono font-normal"
                />
              </label>
              <label className="text-xs font-semibold">
                Target gross margin (%)
                <input
                  name="marginPercent"
                  required
                  type="number"
                  min="0"
                  max="99.99"
                  step="0.01"
                  defaultValue={
                    pricingTool.price
                      ? pricingTool.price.targetMarginBps / 100
                      : 20
                  }
                  className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 font-mono font-normal"
                />
              </label>
              <label className="text-xs font-semibold">
                Billing block (
                {pricingTool.pricingMetric === "REQUEST"
                  ? "request"
                  : "seconds"}
                )
                <input
                  name="unitQuantity"
                  required
                  type="number"
                  min="1"
                  max="86400"
                  disabled={pricingTool.pricingMetric === "REQUEST"}
                  defaultValue={
                    pricingTool.pricingMetric === "REQUEST"
                      ? 1
                      : (pricingTool.price?.unitQuantity ?? 1)
                  }
                  className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 font-mono font-normal disabled:opacity-60"
                />
              </label>
              <label className="text-xs font-semibold sm:col-span-2">
                Rate source / contract note
                <input
                  name="providerCostBasisNote"
                  maxLength={255}
                  defaultValue={pricingTool.price?.providerCostBasisNote ?? ""}
                  placeholder="MediaKit list price, contract reference, promotion expiry…"
                  className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 font-normal"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPricingTool(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy !== null}>
                {busy === `price:${pricingTool.id}`
                  ? "Publishing…"
                  : "Publish immutable price"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
