"use client";

import {
  createCreditQuote,
  DEFAULT_FX_RATE,
  parseMarginPercent,
  formatMarginPercent,
} from "@aiwa/credits/pricing";
import type { UsageRate } from "@aiwa/credits";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

export function ModelActions({
  modelId,
  providerModelId,
  displayName,
  enabled,
  currentUsageRates,
  currentFxBaisaNumerator,
  currentFxBaisaDenominator,
  currentProviderCostBasisNote,
  currentProviderCostMicroUsd,
  currentVideoInputRate720p,
  currentVideoInputRate1080p,
  currentCustomerCredits,
  currentTargetMarginBps,
  currentPricingDimension,
  currentUnitQuantity,
  canManage,
  mediaKind,
}: {
  modelId: string;
  providerModelId?: string;
  displayName: string;
  enabled: boolean;
  mediaKind?: "IMAGE" | "VIDEO" | "VOICE" | "REASONING" | "TEXT";
  currentUsageRates?: unknown;
  currentFxBaisaNumerator?: string;
  currentFxBaisaDenominator?: string;
  currentProviderCostBasisNote?: string | null;
  currentProviderCostMicroUsd?: string;
  currentVideoInputRate720p?: string;
  currentVideoInputRate1080p?: string;
  currentCustomerCredits?: string;
  currentTargetMarginBps?: number;
  currentPricingDimension?: "REQUEST" | "CHARACTER" | "SECOND" | "TOKEN";
  currentUnitQuantity?: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pricingOpen, setPricingOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const defaultCost = currentProviderCostMicroUsd ?? "50000";
  const defaultMargin =
    currentTargetMarginBps !== undefined
      ? formatMarginPercent(currentTargetMarginBps)
      : "25";
  const [costMicroUsd, setCostMicroUsd] = useState(defaultCost);
  const [videoRate720p, setVideoRate720p] = useState(
    currentVideoInputRate720p ?? "",
  );
  const [videoRate1080p, setVideoRate1080p] = useState(
    currentVideoInputRate1080p ?? "",
  );
  const [marginPercent, setMarginPercent] = useState(defaultMargin);
  const [pricingDimension, setPricingDimension] = useState<
    "REQUEST" | "CHARACTER" | "SECOND" | "TOKEN"
  >(
    currentPricingDimension ??
      (mediaKind === "VIDEO"
        ? "SECOND"
        : mediaKind === "TEXT"
          ? "TOKEN"
          : "REQUEST"),
  );
  const [unitQuantity, setUnitQuantity] = useState(
    String(currentUnitQuantity ?? (mediaKind === "VIDEO" ? 5 : 1000)),
  );

  const initialRates =
    currentUsageRates &&
    typeof currentUsageRates === "object" &&
    "rates" in currentUsageRates
      ? (currentUsageRates as { rates: UsageRate[] }).rates
      : providerModelId?.startsWith("dreamina-seedance-2-5-")
        ? ([
            {
              resolution: "720p",
              workflow: "GENERATE",
              microUsdPerThousandTokens: "10700",
            },
            {
              resolution: "1080p",
              workflow: "GENERATE",
              microUsdPerThousandTokens: "11700",
            },
            {
              resolution: "720p",
              workflow: "VIDEO_INPUT",
              microUsdPerThousandTokens: "6400",
            },
            {
              resolution: "1080p",
              workflow: "VIDEO_INPUT",
              microUsdPerThousandTokens: "7000",
            },
          ] as UsageRate[])
        : [];
  const [usageRows, setUsageRows] = useState<UsageRate[]>(initialRates);
  const [costNote, setCostNote] = useState(currentProviderCostBasisNote ?? "");
  const publicationKey = useRef<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!pricingOpen) return;
    const opener = openerRef.current;
    dialogRef.current
      ?.querySelector<HTMLElement>("select,input,button")
      ?.focus();
    return () => {
      opener?.focus();
    };
  }, [pricingOpen]);
  const dialogTitleId = useId();

  if (!canManage) return null;

  const estimatedCredits = (() => {
    try {
      const cost = BigInt(costMicroUsd || "0");
      const marginBps = parseMarginPercent(marginPercent || "0");
      if (cost <= 0n) return null;
      return createCreditQuote({
        providerCostMicroUsd: cost,
        exchangeRate: {
          baisaNumerator: BigInt(
            currentFxBaisaNumerator ?? DEFAULT_FX_RATE.baisaNumerator,
          ),
          baisaDenominator: BigInt(
            currentFxBaisaDenominator ?? DEFAULT_FX_RATE.baisaDenominator,
          ),
        },
        targetGrossMarginBps: marginBps,
        creditsPerBaisa: 1n,
      }).customerCredits.toString();
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
    if (saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const marginBps = parseMarginPercent(marginPercent);
      if (marginBps < 0 || marginBps >= 10000) {
        throw new Error("Margin percentage must be between 0% and 99.99%.");
      }
      const costBigInt = BigInt(
        mediaKind === "VIDEO" && pricingDimension === "TOKEN"
          ? (usageRows[0]?.microUsdPerThousandTokens ?? "0")
          : costMicroUsd,
      );
      if (costBigInt <= 0n) {
        throw new Error("Provider cost must be positive.");
      }
      if (
        mediaKind === "VIDEO" &&
        pricingDimension !== "TOKEN" &&
        Boolean(videoRate720p) !== Boolean(videoRate1080p)
      )
        throw new Error("Set both video-input token rates together.");

      const res = await fetch(`/api/admin/models/${modelId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey:
            publicationKey.current ??
            (publicationKey.current = crypto.randomUUID()),
          providerCostMicroUsd: costBigInt.toString(),
          ...(mediaKind === "VIDEO" && pricingDimension === "TOKEN"
            ? {
                usageRates: {
                  estimator: "byteplus-video-v1",
                  rates: usageRows,
                },
              }
            : {}),
          providerCostBasisNote: costNote,
          ...(mediaKind === "VIDEO" &&
          pricingDimension !== "TOKEN" &&
          videoRate720p &&
          videoRate1080p
            ? {
                videoInputRate720p: videoRate720p,
                videoInputRate1080p: videoRate1080p,
              }
            : {}),
          targetMarginBps: marginBps,
          pricingDimension,
          unitQuantity:
            pricingDimension === "TOKEN"
              ? "1000"
              : pricingDimension === "REQUEST"
                ? "1"
                : unitQuantity,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to publish price version.");
      }
      publicationKey.current = null;
      setFeedback("New pricing version published.");
      setPricingOpen(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : "Pricing update failed.",
      );
    } finally {
      setSaving(false);
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
        onClick={(event) => {
          openerRef.current = event.currentTarget;
          publicationKey.current = null;
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
            ref={dialogRef}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !saving) {
                event.preventDefault();
                setPricingOpen(false);
              }
              if (event.key === "Tab") {
                const controls = Array.from(
                  dialogRef.current?.querySelectorAll<HTMLElement>(
                    "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])",
                  ) ?? [],
                );
                const first = controls[0],
                  last = controls.at(-1);
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first?.focus();
                }
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl"
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

            <form onSubmit={handlePublishPricing} className="mt-4">
              <fieldset disabled={saving} className="space-y-4">
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
                        event.target.value as
                          "REQUEST" | "CHARACTER" | "SECOND" | "TOKEN",
                      )
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  >
                    {(!mediaKind ||
                      mediaKind === "IMAGE" ||
                      mediaKind === "VIDEO" ||
                      mediaKind === "VOICE" ||
                      mediaKind === "REASONING") && (
                      <option value="REQUEST">
                        Per request{mediaKind === "VIDEO" ? " (flat)" : ""}
                      </option>
                    )}
                    {(!mediaKind ||
                      mediaKind === "VIDEO" ||
                      mediaKind === "TEXT") && (
                      <option value="TOKEN">
                        {mediaKind === "TEXT"
                          ? "Per token block"
                          : "Per completion token"}
                      </option>
                    )}
                    {(!mediaKind || mediaKind === "VIDEO") && (
                      <option value="SECOND">
                        Per duration block (seconds)
                      </option>
                    )}
                    {(!mediaKind || mediaKind === "VOICE") && (
                      <option value="CHARACTER">Per character block</option>
                    )}
                  </select>
                </div>

                {pricingDimension === "CHARACTER" ||
                pricingDimension === "SECOND" ? (
                  <div>
                    <label
                      htmlFor={`unit-${modelId}`}
                      className="block text-xs font-semibold text-foreground"
                    >
                      {pricingDimension === "SECOND"
                        ? "Seconds per billing unit"
                        : "Characters per billing unit"}
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

                {(pricingDimension !== "TOKEN" || mediaKind === "TEXT") && (
                  <div>
                    <label
                      htmlFor={`cost-${modelId}`}
                      className="block text-xs font-semibold text-foreground"
                    >
                      {mediaKind === "TEXT" && pricingDimension === "TOKEN"
                        ? "Provider Cost per 1,000 tokens (micro-USD)"
                        : "Provider Cost (micro-USD)"}
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
                      {mediaKind === "TEXT" && pricingDimension === "TOKEN"
                        ? "Blended settlement rate per 1,000 total tokens. Use a conservative rate that covers your provider contract."
                        : "1 USD = 1,000,000 micro-USD (e.g. $0.054 = 54,000)"}
                    </p>
                  </div>
                )}

                {mediaKind === "VIDEO" && pricingDimension !== "TOKEN" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(
                      [
                        ["720p", videoRate720p, setVideoRate720p],
                        ["1080p", videoRate1080p, setVideoRate1080p],
                      ] as const
                    ).map(([resolution, value, setter]) => (
                      <div key={resolution}>
                        <label
                          htmlFor={`input-rate-${resolution}-${modelId}`}
                          className="block text-xs font-semibold text-foreground"
                        >
                          Video input {resolution}: micro-USD / 1,000 tokens
                        </label>
                        <input
                          id={`input-rate-${resolution}-${modelId}`}
                          type="text"
                          inputMode="numeric"
                          value={value}
                          onChange={(event) =>
                            setter(event.target.value.replace(/\D/g, ""))
                          }
                          placeholder={resolution === "720p" ? "6400" : "7000"}
                          className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm"
                        />
                      </div>
                    ))}
                    <p className="text-[11px] text-muted-foreground sm:col-span-2">
                      Publish both rates to price reference-video inputs. Leave
                      both empty to keep that mode unavailable. Verify rates
                      against your provider contract.
                    </p>
                  </div>
                ) : null}

                {mediaKind === "VIDEO" && pricingDimension === "TOKEN" && (
                  <fieldset className="space-y-3 rounded-xl border border-border p-4">
                    <legend className="px-1 text-sm font-semibold">
                      Completion token rates
                    </legend>
                    <p className="text-xs text-muted-foreground">
                      Micro-USD per 1,000 tokens. 10700 means $10.70 per million
                      tokens. Defaults are Seedance 2.5 rates; verify your model
                      contract before publishing. Audio has no automatic
                      surcharge.
                    </p>
                    {usageRows.map((row, index) => (
                      <div
                        key={index}
                        className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
                      >
                        <label className="text-xs">
                          Resolution
                          <select
                            aria-label={`Rate ${index + 1} resolution`}
                            value={row.resolution}
                            onChange={(event) =>
                              setUsageRows((rows) =>
                                rows.map((r, i) =>
                                  i === index
                                    ? {
                                        ...r,
                                        resolution: event.target
                                          .value as UsageRate["resolution"],
                                      }
                                    : r,
                                ),
                              )
                            }
                            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2"
                          >
                            {["480p", "720p", "1080p", "4K"].map((r) => (
                              <option key={r}>{r}</option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs">
                          Input workflow
                          <select
                            aria-label={`Rate ${index + 1} workflow`}
                            value={row.workflow}
                            onChange={(event) =>
                              setUsageRows((rows) =>
                                rows.map((r, i) =>
                                  i === index
                                    ? {
                                        ...r,
                                        workflow: event.target
                                          .value as UsageRate["workflow"],
                                      }
                                    : r,
                                ),
                              )
                            }
                            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2"
                          >
                            <option value="GENERATE">Text / image input</option>
                            <option value="VIDEO_INPUT">Video input</option>
                          </select>
                        </label>
                        <label className="text-xs">
                          Micro-USD / 1,000
                          <input
                            aria-label={`Rate ${index + 1} amount`}
                            required
                            inputMode="numeric"
                            value={row.microUsdPerThousandTokens}
                            onChange={(event) =>
                              setUsageRows((rows) =>
                                rows.map((r, i) =>
                                  i === index
                                    ? {
                                        ...r,
                                        microUsdPerThousandTokens:
                                          event.target.value.replace(/\D/g, ""),
                                      }
                                    : r,
                                ),
                              )
                            }
                            className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 font-mono"
                          />
                        </label>
                        <Button
                          type="button"
                          variant="secondary"
                          aria-label={`Remove rate ${index + 1}`}
                          onClick={() =>
                            setUsageRows((rows) =>
                              rows.filter((_, i) => i !== index),
                            )
                          }
                          className="self-end"
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={usageRows.length >= 8}
                      onClick={() =>
                        setUsageRows((rows) => [
                          ...rows,
                          {
                            resolution: "480p",
                            workflow: "GENERATE",
                            microUsdPerThousandTokens: "",
                          },
                        ])
                      }
                    >
                      Add rate
                    </Button>
                  </fieldset>
                )}
                <label className="block text-xs font-semibold">
                  Rate source / contract note
                  <input
                    value={costNote}
                    maxLength={255}
                    onChange={(event) => setCostNote(event.target.value)}
                    placeholder="Contract reference and discount expiry, if applicable"
                    className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  />
                </label>
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
                    step="0.01"
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
                      {pricingDimension === "TOKEN"
                        ? "Calculated from actual completion tokens; see Studio estimate"
                        : estimatedCredits
                          ? `${estimatedCredits} credits / ${
                              pricingDimension === "CHARACTER"
                                ? `${unitQuantity || "—"} characters`
                                : pricingDimension === "SECOND"
                                  ? `${unitQuantity || "—"}s block`
                                  : "request"
                            }`
                          : "Invalid input"}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                    <span>Current effective:</span>
                    <span>
                      {currentPricingDimension === "TOKEN"
                        ? "Usage-based"
                        : currentCustomerCredits
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
              </fieldset>
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
