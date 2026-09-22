"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

export function ModelActions({
  modelId,
  displayName,
  enabled,
  currentProviderCostMicroUsd,
  currentCustomerCredits,
  currentTargetMarginBps,
  currentPricingDimension,
  currentUnitQuantity,
  canManage,
}: {
  modelId: string;
  displayName: string;
  enabled: boolean;
  currentProviderCostMicroUsd?: string;
  currentCustomerCredits?: string;
  currentTargetMarginBps?: number;
  currentPricingDimension?: "REQUEST" | "CHARACTER";
  currentUnitQuantity?: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pricingOpen, setPricingOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const defaultCost = currentProviderCostMicroUsd ?? "50000";
  const defaultMargin = currentTargetMarginBps
    ? (currentTargetMarginBps / 100).toString()
    : "25";
  const [costMicroUsd, setCostMicroUsd] = useState(defaultCost);
  const [marginPercent, setMarginPercent] = useState(defaultMargin);
  const [pricingDimension, setPricingDimension] = useState<
    "REQUEST" | "CHARACTER"
  >(currentPricingDimension ?? "REQUEST");
  const [unitQuantity, setUnitQuantity] = useState(
    String(currentUnitQuantity ?? 1000),
  );

  const dialogTitleId = useId();

  if (!canManage) return null;

  const estimatedCredits = (() => {
    try {
      const cost = BigInt(costMicroUsd || "0");
      const marginBps = Math.round(parseFloat(marginPercent || "0") * 100);
      if (marginBps < 0 || marginBps >= 10000 || cost <= 0n) return null;

      const convertedCostBaisa = (cost * 769n + 2000000n - 1n) / 2000000n;
      const marginDivisor = BigInt(10000 - marginBps);
      const customerPriceBaisa =
        (convertedCostBaisa * 10000n + marginDivisor - 1n) / marginDivisor;
      return customerPriceBaisa.toString();
    } catch {
      return null;
    }
  })();

  async function handleToggleAvailability() {
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/models/${modelId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update model availability.");
      }
      setFeedback(enabled ? "Model disabled." : "Model enabled.");
      startTransition(() => router.refresh());
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Update failed.");
    }
  }

  async function handlePublishPricing(event: React.FormEvent) {
    event.preventDefault();
    setFeedback(null);
    try {
      const marginBps = Math.round(parseFloat(marginPercent) * 100);
      if (marginBps < 0 || marginBps >= 10000) {
        throw new Error("Margin percentage must be between 0% and 99.99%.");
      }
      const costBigInt = BigInt(costMicroUsd);
      if (costBigInt <= 0n) {
        throw new Error("Provider cost must be positive.");
      }

      const res = await fetch(`/api/admin/models/${modelId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerCostMicroUsd: costMicroUsd,
          targetMarginBps: marginBps,
          pricingDimension,
          unitQuantity: pricingDimension === "CHARACTER" ? unitQuantity : "1",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to publish price version.");
      }
      setFeedback("New pricing version published.");
      setPricingOpen(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : "Pricing update failed.",
      );
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={enabled ? "secondary" : "default"}
        size="sm"
        disabled={pending}
        onClick={handleToggleAvailability}
        className="min-h-10 text-xs"
      >
        {enabled ? "Disable" : "Enable"}
      </Button>

      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => {
          setPricingOpen(true);
          setFeedback(null);
        }}
        className="min-h-10 text-xs"
      >
        Set pricing
      </Button>

      {pricingOpen ? (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPricingOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
          >
            <h3
              id={dialogTitleId}
              className="font-display text-lg font-semibold text-foreground"
            >
              Publish pricing: {displayName}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Configure provider cost and gross margin. A new active price
              version will be published immediately.
            </p>

            <form onSubmit={handlePublishPricing} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor={`dimension-${modelId}`}
                  className="block text-xs font-semibold text-foreground"
                >
                  Pricing basis
                </label>
                <select
                  id={`dimension-${modelId}`}
                  value={pricingDimension}
                  onChange={(event) =>
                    setPricingDimension(
                      event.target.value as "REQUEST" | "CHARACTER",
                    )
                  }
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="REQUEST">Per request</option>
                  <option value="CHARACTER">Per character block</option>
                </select>
              </div>

              {pricingDimension === "CHARACTER" ? (
                <div>
                  <label
                    htmlFor={`unit-${modelId}`}
                    className="block text-xs font-semibold text-foreground"
                  >
                    Characters per billing unit
                  </label>
                  <input
                    id={`unit-${modelId}`}
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={unitQuantity}
                    onChange={(event) => setUnitQuantity(event.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm"
                  />
                </div>
              ) : null}

              <div>
                <label
                  htmlFor={`cost-${modelId}`}
                  className="block text-xs font-semibold text-foreground"
                >
                  Provider Cost (micro-USD)
                </label>
                <input
                  id={`cost-${modelId}`}
                  type="text"
                  required
                  value={costMicroUsd}
                  onChange={(e) =>
                    setCostMicroUsd(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="e.g. 54000"
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  1 USD = 1,000,000 micro-USD (e.g. $0.054 = 54,000)
                </p>
              </div>

              <div>
                <label
                  htmlFor={`margin-${modelId}`}
                  className="block text-xs font-semibold text-foreground"
                >
                  Target Gross Margin (%)
                </label>
                <input
                  id={`margin-${modelId}`}
                  type="number"
                  step="0.5"
                  min="0"
                  max="99.9"
                  required
                  value={marginPercent}
                  onChange={(e) => setMarginPercent(e.target.value)}
                  placeholder="e.g. 25"
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Typical studio margin is 25% (2,500 bps).
                </p>
              </div>

              <div className="rounded-xl border border-border bg-surface-sunken p-3">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">
                    Calculated Customer Price:
                  </span>
                  <span className="font-semibold text-foreground">
                    {estimatedCredits
                      ? `${estimatedCredits} credits / ${
                          pricingDimension === "CHARACTER"
                            ? `${unitQuantity || "—"} characters`
                            : "request"
                        }`
                      : "Invalid input"}
                  </span>
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>Current effective:</span>
                  <span>
                    {currentCustomerCredits
                      ? `${currentCustomerCredits} credits`
                      : "Unpriced"}
                  </span>
                </div>
              </div>

              {feedback ? (
                <p role="status" className="text-xs text-primary">
                  {feedback}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() => setPricingOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={pending || !estimatedCredits}
                >
                  {pending ? "Publishing..." : "Publish price version"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {feedback && !pricingOpen ? (
        <span className="text-[11px] text-muted-foreground">{feedback}</span>
      ) : null}
    </div>
  );
}
