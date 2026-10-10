"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

/** Customer-facing quote fields only. Provider purchase rates and margin do not belong here. */
export type CostPreviewQuote = {
  estimatedCredits: string;
  reservationCredits: string;
  estimatedOmr?: string;
  maximumChargeOmr?: string;
  creditsPerBaisa?: string;
  expiresAt?: string;
  settlement?: "FIXED" | "ACTUAL_USAGE";
  pricingDimension?: string;
  unitQuantity?: string;
  billableSeconds?: number;
  billingUnits?: string;
  quotedQuantity?: number;
  estimatedUsage?: { unit: string; quantity: string; isEstimate: boolean };
  pricingBreakdown?: {
    estimatedRetailMicroUsdApprox: string;
    maximumRetailMicroUsdApprox: string;
    fxBaisaNumerator: string;
    fxBaisaDenominator: string;
  };
};

export type CostPreviewProps = {
  quote?: CostPreviewQuote | null;
  modelName?: string | null;
  providerName?: string | null;
  mediaKind?: string;
  details?: string[];
  walletCredits?: string | null;
  canAfford?: boolean;
  canSpend?: boolean;
  pending?: boolean;
  error?: string | null;
  className?: string;
};

const integer = (value: string | undefined): bigint | null => {
  if (!value || !/^[0-9]+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
};
const digits = (value: string | undefined) => {
  const amount = integer(value);
  return amount === null ? "—" : amount.toLocaleString("en-US");
};
const omr = (credits: string | undefined, rate: string | undefined) => {
  const count = integer(credits);
  const perBaisa = integer(rate);
  if (
    count === null ||
    perBaisa === null ||
    perBaisa === 0n ||
    count % perBaisa !== 0n
  )
    return null;
  const baisa = count / perBaisa;
  return `${(baisa / 1000n).toLocaleString("en-US")}.${(baisa % 1000n).toString().padStart(3, "0")} OMR`;
};
const usageName = (unit: string) =>
  ({
    COMPLETION_TOKEN: "video tokens",
    TOKEN: "tokens",
    CHARACTER: "characters",
    SECOND: "seconds",
    INPUT_SECOND: "input seconds",
    OUTPUT_SECOND: "output seconds",
    INPUT_BYTE: "input bytes",
    IMAGE: "images",
    REQUEST: "requests",
  })[unit] ?? unit.toLowerCase().replaceAll("_", " ");
const billingIcon = (kind?: string) =>
  kind === "VIDEO"
    ? ("video" as const)
    : kind === "IMAGE"
      ? ("image" as const)
      : kind === "VOICE" || kind === "AUDIO"
        ? ("voice" as const)
        : ("activity" as const);

export function GenerationCostPreview({
  quote,
  modelName,
  providerName,
  mediaKind,
  details = [],
  walletCredits,
  canAfford,
  canSpend,
  pending = false,
  error,
  className,
}: CostPreviewProps) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);
  const estimatedOmr =
    quote?.estimatedOmr ?? omr(quote?.estimatedCredits, quote?.creditsPerBaisa);
  const reservedOmr =
    quote?.maximumChargeOmr ??
    omr(quote?.reservationCredits, quote?.creditsPerBaisa);
  const fixed = quote?.settlement === "FIXED";
  const max = quote?.reservationCredits ?? "0";
  const wallet = integer(walletCredits ?? undefined);
  const reserved = integer(max);
  const remaining =
    wallet !== null && reserved !== null ? wallet - reserved : null;
  const usage = quote?.estimatedUsage;
  const micro = quote?.pricingBreakdown;
  const rate = micro
    ? Number(micro.fxBaisaNumerator) / Number(micro.fxBaisaDenominator) / 1000
    : null;
  const rateText =
    rate !== null && Number.isFinite(rate) ? rate.toFixed(6) : null;
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const check = () => setExpired(Boolean(quote?.expiresAt && Date.parse(quote.expiresAt) <= Date.now()));
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [quote?.expiresAt]);
  return (
    <>
      <section
        aria-label="Generation cost preview"
        className={`rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5 ${className ?? ""}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon name="credits" className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Generation cost
              </h3>
              <p className="text-xs text-muted-foreground">
                {modelName ?? "Review your generation estimate"}
              </p>
            </div>
          </div>
          {quote ? (
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${expired ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}
            >
              {expired
                ? "Quote expired"
                : fixed
                  ? "Fixed quote"
                  : "Usage estimate"}
            </span>
          ) : null}
        </div>
        {quote ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="min-w-0 rounded-xl border border-border bg-surface-sunken p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon name="credits" className="size-4" aria-hidden="true" />
                  Estimated charge
                </div>
                <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-foreground">
                  {digits(quote.estimatedCredits)}{" "}
                  <span className="text-xs font-medium text-muted-foreground">
                    credits
                  </span>
                </p>
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {estimatedOmr ?? "OMR unavailable"}
                </p>
              </div>
              <div className="min-w-0 rounded-xl border border-border bg-surface-sunken p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon name="shield" className="size-4" aria-hidden="true" />
                  {fixed ? "Confirmed quote" : "Maximum hold"}
                </div>
                <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-foreground">
                  {digits(max)}{" "}
                  <span className="text-xs font-medium text-muted-foreground">
                    credits
                  </span>
                </p>
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {reservedOmr ?? "OMR unavailable"}
                </p>
              </div>
            </div>
            {walletCredits !== undefined && walletCredits !== null && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-1.5 rounded-lg bg-primary/5 px-3 py-2 text-xs">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Icon name="assets" className="size-4" aria-hidden="true" />{" "}
                  Available wallet
                </span>
                <span className="font-semibold tabular-nums text-foreground">
                  {digits(walletCredits)} credits
                </span>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Icon
                  name={billingIcon(mediaKind)}
                  className="size-4"
                  aria-hidden="true"
                />
                {usage
                  ? `${digits(usage.quantity)} ${usage.isEstimate ? "estimated " : ""}${usageName(usage.unit)}`
                  : quote.billableSeconds
                    ? `${quote.billableSeconds} billable seconds`
                    : quote.quotedQuantity
                      ? `${quote.quotedQuantity} billable ${usageName(quote.pricingDimension ?? "REQUEST")}`
                      : "Model-specific billing"}
              </span>
              <span>{fixed ? "Fixed rate" : "Settles on actual usage"}</span>
            </div>
            {canAfford === false && (
              <p
                role="alert"
                className="mt-3 text-xs font-medium text-destructive"
              >
                Insufficient balance to cover the maximum hold.
              </p>
            )}
            {canSpend === false && (
              <p
                role="alert"
                className="mt-2 text-xs font-medium text-destructive"
              >
                This job exceeds your spending allowance.
              </p>
            )}
            {expired && (
              <p className="mt-2 text-xs text-destructive">
                Quote expired. Refresh your estimate before generating.
              </p>
            )}
            <Button
              type="button"
              variant="secondary"
              className="mt-4 w-full justify-between gap-2"
              onClick={() => setOpen(true)}
            >
              <span className="flex items-center gap-2">
                <Icon name="activity" className="size-4" aria-hidden="true" />{" "}
                View pricing breakdown
              </span>
              <Icon name="chevron" className="size-4" aria-hidden="true" />
            </Button>
          </>
        ) : (
          <div
            className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground"
            role="status"
          >
            {pending
              ? "Calculating your quote…"
              : (error ??
                "Choose a model and generation settings to see your estimate.")}
          </div>
        )}
        {quote && error && (
          <p role="status" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </section>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        aria-labelledby={titleId}
        className="m-auto max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-xl overflow-y-auto rounded-3xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-foreground/50"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-primary/10 p-2 text-primary">
              <Icon name="credits" className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id={titleId} className="font-display text-xl font-semibold">
                Pricing breakdown
              </h2>
              <p className="text-xs text-muted-foreground">
                Before you generate · customer charges
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            aria-label="Close pricing breakdown"
            onClick={() => setOpen(false)}
          >
            Close
          </Button>
        </div>
        {quote && (
          <div className="space-y-5 p-5">
            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Icon
                  name={billingIcon(mediaKind)}
                  className="size-4 text-primary"
                  aria-hidden="true"
                />{" "}
                Model and usage
              </h3>
              <p className="text-sm">
                {modelName ?? "Selected model"}
                {providerName ? ` · ${providerName}` : ""}
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {usage && (
                  <span className="rounded-full bg-surface-sunken px-2.5 py-1">
                    {digits(usage.quantity)} {usageName(usage.unit)}
                  </span>
                )}
                {quote.pricingDimension && (
                  <span className="rounded-full bg-surface-sunken px-2.5 py-1">
                    {usageName(quote.pricingDimension)} billing
                  </span>
                )}
                {details.filter(Boolean).map((detail, i) => (
                  <span
                    className="rounded-full bg-surface-sunken px-2.5 py-1"
                    key={i}
                  >
                    {detail}
                  </span>
                ))}
              </div>
            </section>
            <div className="h-px bg-border" />
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Icon
                  name="activity"
                  className="size-4 text-primary"
                  aria-hidden="true"
                />{" "}
                Cost conversion
              </h3>
              <dl className="space-y-2 text-sm">
                {usage && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Billable usage</dt>
                    <dd className="text-right tabular-nums">
                      {digits(usage.quantity)} {usageName(usage.unit)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Customer OMR price</dt>
                  <dd className="text-right tabular-nums font-semibold">
                    {estimatedOmr ?? "Not available"}
                  </dd>
                </div>
                {micro ? (
                  <>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">
                        Retail microUSD equivalent
                      </dt>
                      <dd className="text-right tabular-nums">
                        ≈ {digits(micro.estimatedRetailMicroUsdApprox)} μUSD
                      </dd>
                    </div>
                    {rateText && (
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">
                          Quote FX snapshot
                        </dt>
                        <dd className="text-right tabular-nums">
                          1 USD ≈ {rateText} OMR
                        </dd>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    MicroUSD equivalence is unavailable for this quote. No
                    supplier rate is inferred.
                  </p>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Credit conversion</dt>
                  <dd className="text-right">
                    {quote.creditsPerBaisa
                      ? `${digits(quote.creditsPerBaisa)} credits / baisa`
                      : "Not provided"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-border pt-2 font-semibold">
                  <dt>Total estimated charge</dt>
                  <dd className="tabular-nums">
                    {digits(quote.estimatedCredits)} credits
                  </dd>
                </div>
              </dl>
              <p className="text-xs leading-5 text-muted-foreground">
                1 USD = 1,000,000 microUSD. Retail microUSD is an approximate
                conversion of your rounded customer price using the quote&apos;s FX
                snapshot, not the provider&apos;s wholesale cost or token rate. 1 OMR
                = 1,000 baisa.
              </p>
            </section>
            <div className="h-px bg-border" />
            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Icon
                  name="shield"
                  className="size-4 text-primary"
                  aria-hidden="true"
                />{" "}
                Wallet protection
              </h3>
              <dl className="space-y-2 text-sm">
                {wallet !== null && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Available balance</dt>
                    <dd className="tabular-nums">
                      {digits(walletCredits ?? undefined)} credits
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">
                    {fixed ? "Fixed charge" : "Maximum reservation"}
                  </dt>
                  <dd className="tabular-nums">
                    {digits(max)} credits
                    {reservedOmr ? ` · ${reservedOmr}` : ""}
                  </dd>
                </div>
                {remaining !== null && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">
                      Available after hold
                    </dt>
                    <dd className="tabular-nums">
                      {remaining.toLocaleString("en-US")} credits
                    </dd>
                  </div>
                )}
              </dl>
              <p className="rounded-xl bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
                {fixed
                  ? "The price is fixed for these quoted inputs. Failed or cancelled jobs follow the platform's ledger settlement rules."
                  : "The wallet reserves up to the maximum quote. Successful usage is settled at actual billable usage within the approved ceiling; unused reserved credits are released in accordance with ledger rules."}
              </p>
              {quote.expiresAt && (
                <p className="text-xs text-muted-foreground">
                  Quote expires:{" "}
                  {Number.isFinite(Date.parse(quote.expiresAt))
                    ? new Date(quote.expiresAt).toLocaleString()
                    : "Unavailable"}
                  . Changing model or settings requires a fresh quote.
                </p>
              )}
            </section>
            <Button
              type="button"
              className="w-full"
              onClick={() => setOpen(false)}
            >
              Return to Studio
            </Button>
          </div>
        )}
      </dialog>
    </>
  );
}
