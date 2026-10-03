# Provider pricing, quotes and settlement

## Launch configuration

Money remains integer micro-USD, baisa and credits. The platform denomination
for **new model prices and new payment grants is 1 credit per baisa**. Existing
posted payments, price snapshots and ledger entries are never rewritten. Bonus
credits use audited promotional/admin grants rather than a different payment
exchange factor. Existing payment confirmations remain idempotently replayable.

Apply `20260930000000_usage_pricing` before starting the updated web and worker.
The migration is additive; old price versions and in-flight jobs keep their
original policies. Do not roll back to a binary that cannot understand TOKEN
prices while token-priced jobs remain queued or processing.

Admin → Models → Set pricing → Per completion token publishes a new immutable
snapshot containing a versioned estimator and rate selectors. Seedance 2.5
requires TOKEN for **new ordinary-video jobs**; its obsolete block price is
rejected instead of silently causing a loss. Existing legacy jobs can finish.

For the verified AIWA BytePlus account, enter these rates in **micro-USD per
1,000 completion tokens**, not per million:

| Resolution | Text/image input | Video input |
| ---------- | ---------------: | ----------: |
| 720p       |            10700 |        6400 |
| 1080p      |            11700 |        7000 |

10700 micro-USD/1000 tokens means $10.70/million tokens. The rate table does not
invent an audio surcharge. All enabled resolutions require a generation rate;
models supporting video references also require a video-input rate. Duplicate,
zero, overflowing and unsupported selectors are rejected. Adding rate rows does
not activate provider access or unsupported model capabilities.

Seedream Lite: REQUEST, quantity 1, cost 31500. Seedream 4.5: REQUEST, quantity
1, cost 36000. Seedream 4.0: REQUEST, quantity 1, cost 27000. TTS2: CHARACTER,
quantity 1000, cost 30000. UI margin 25 means 2500 basis points and price = cost
/ 0.75 before upward rounding. The default FX is 769/2 baisa/USD. Omitted FX
retains the current version's FX; first publication uses that default. Seed
changes apply only where no active price already exists.

The source defaults use this account's verified paid rates. Seedream 4.0 uses
27,000 micro-USD/image: the verified 10% account discount from the public 30,000
micro-USD/image list price. At the default FX and 25% target margin this still
rounds to 15 customer credits per successful image. Trials are not a zero
production cost. Discount/resource-package expiry and actual consumption must be
checked before publishing a different rate; the contract-note field records its
source, but does **not** automatically expire discounts.

## Rounding and speech

The existing two-step baisa rounding is retained to avoid changing historical
policies. Images round once per image, then multiply by requested count in both
quotes and reservations. Partial settlement charges only successful outputs at
that same per-image price: four Lite images reserve 72 credits, not 66.

Voice text is trimmed consistently with provider submission. Internal spaces,
newlines, punctuation, SSML and Unicode code points count. CHARACTER pricing
continues to use explicitly configured **blocks**: quantity 1000 charges a full
block for a nonempty request, and a second block at 1001 characters. The
configured-character provider cost estimate is recorded separately from customer
block revenue. It is not evidence of exact provider-invoice cost or Unicode
billing reconciliation. Changing to proportional character billing needs a new
explicit policy rather than changing money units casually.

## Quote contract

`POST /api/quotes` accepts model, organization and media parameters. It performs
capability and tenant-owned reference-asset validation without invoking a paid
provider or reserving money. The estimator and admission share pricing helpers.

Response fields include:

- `quoteId`, `quoteToken`, `createdAt`, `expiresAt`, model and price version.
- `estimatedCredits`, `estimatedPriceBaisa`, `estimatedOmr`.
- `reservationCredits`, `maximumChargeCredits`, `maximumChargeBaisa`,
  `maximumChargeOmr` and `chargeRangeCredits`.
- `estimatedUsage` with unit, quantity and whether it is estimated;
  `settlement`, `confidence`, `estimationPolicy` and `roundingPolicy`.
- Wallet affordability, balance after the proposed hold and member spending cap.

Legacy `customerCredits` and `customerPriceBaisa` remain the **reservation**, so
older clients cannot mistake an estimate for sufficient wallet funds. Only
finance-capable roles receive provider costs, margin and contract-note fields.
Responses are `no-store`.

Quotes are HMAC-signed using AUTH_SECRET, valid for five minutes, and bound to
user, organization, model, price version and canonical price-affecting settings.
Speech content is hashed rather than exposed in the token. Studio refreshes its
quote, cancels stale requests, blocks submission until a matching quote exists,
and sends `quoteToken`. Admission recomputes price under the active snapshot and
rejects expiry, tampering, changed settings or a reservation above the accepted
ceiling. The wallet and monthly limit are checked again transactionally.
Existing integrations may omit `quoteToken`; they still receive server-computed
pricing, price-version validation, budget checks and reservations. They do not
receive a guarantee based on an earlier unsigned preview.

Pricing publication requires an `idempotencyKey` UUID. Reusing the same key and
payload returns the existing version; a changed payload conflicts. Row locking
and a unique publication key prevent duplicate versions on retry. Never submit
provider keys or customer media URLs in the pricing source note.

## Video measurement and recovery

The registered `byteplus-video-v1` estimator uses output dimensions, 24 fps and
output plus applicable source-video duration. Normal ratios estimate actual
area; adaptive inputs use a conservative 2.5:1 envelope. The hold covers that
envelope plus 25% token variance. Video references retain the full 30-second
output envelope because provider reference workflows can affect output duration.
Expected cost and maximum hold are shown separately.

Successful token-priced videos require positive, safe-integer
`completion_tokens`. Missing/invalid usage leaves the reservation in manual
review. The worker records usage before storage, prices it with the **job's
original rate snapshot**, and charges min(actual-priced credits, disclosed
hold). Unused credits return atomically through the existing capture primitive.
An above-cap provider overrun is platform cost, never an undisclosed wallet
debit.

Immediate recovery follows the same usage pricing. It can use persisted/provider
usage or an explicitly audited administrator-reconciled cost. It refuses to
capture a token-priced video when both are unavailable. Recovery does not
resubmit synthesis/generation. Customer history shows actual completion tokens,
final OMR equivalent and unused returned holds without exposing commercial
costs.

`providerCostBasis` distinguishes PROVIDER_USAGE, CONFIGURED_RATE,
CONFIGURED_CHARACTERS and MANUAL_RECONCILIATION. These costs are rate-based
estimates or usage-priced costs, **not net invoices after trials or package
credits**. Accounting must reconcile provider bills separately.

## Extending providers and reviewing historical exposure

`usageRates` stores JSON with decimal-integer rate strings, resolution/workflow
selectors and an estimator version. The API validates a bounded table. Add a
registered estimator and media admission/settlement support for a new billing
policy; never execute formulas from configuration. Future video rates such as
480p/4K use additional selectors after provider capabilities are validated.
Existing REQUEST, CHARACTER and SECOND policies remain available for appropriate
models. A rate entry alone does not make ASR, embeddings or chat callable.

Before launch, review historical payment credit factors and active model factors
that differ from 1. Previously granted credits retain their ledger identity;
reconcile any corrections through explicit adjustments/reversals, never SQL
updates to posted money. Provider trials, promotional credits, hosting, storage,
delivery and uncharged NVIDIA enhancement also affect realized margin.

Read-only investigation queries:

```sql
SELECT id, organizationId, amountBaisa, creditsGranted, creditsPerBaisa
FROM ManualPayment
WHERE status = 'CONFIRMED' AND creditsPerBaisa <> 1;

SELECT id, providerModelId, pricingDimension, creditsPerBaisa
FROM ModelPriceVersion
WHERE effectiveTo IS NULL AND creditsPerBaisa <> 1;
```

### Seedream 5.0 Pro tiered image pricing

The Pro active price version stores the verified discounted `<=1.5K` output rate
as its base `providerCostMicroUsd` (40,500 µUSD). Runtime quote, reservation and
settlement code all derive the same request cost:

- 1K / 1.5K output: base rate;
- 2K output: 2 × base rate;
- first input image: included;
- each additional input image: 1/15 × base rate.

At the default 769/2 baisa-per-USD FX snapshot and 25% target gross margin, an
output with one reference is 22 credits at 1K/1.5K and 43 credits at 2K.
Additional references increase the quote and reservation before submission. The
worker records the same tiered amount as actual provider cost on successful
settlement, so finance reporting does not fall back to the base price.

Provider-native layer decomposition is not priced through the normal image
generation estimator because it has separate per-layer billing and variable
output cardinality. It must use a dedicated quote/reserve/settle contract before
being enabled.

## External text provider pricing

Token-priced text models use provider-family estimator identifiers so a price
snapshot cannot be accidentally published with BytePlus semantics:

- BytePlus TEXT: `byteplus-text-v1`
- Groq, Gemini and Cloudflare TEXT: `text-token-v1`

Both estimators store integer micro-USD rates per 1,000,000 input, cached-input
and output tokens. The generic `text-token-v1` policy is provider-neutral; it
does not reuse BytePlus video or text estimator labels.

The admin pricing editor reloads either text estimator from the current
immutable price snapshot. Republishing an external text price always writes
`text-token-v1`. Server publication and model-enable paths reject an estimator
that does not match the model provider.

Quotes expose the estimator recorded in the active price version rather than a
hard-coded BytePlus estimator name. Text quote usage is labelled `TOKEN` because
the estimate contains prompt plus requested completion tokens.

Settlement continues to use the job's immutable price snapshot and
provider-reported token usage. Groq and Gemini OpenAI-compatible usage and
Cloudflare Workers AI `result.usage` are normalized to prompt, completion and
total tokens before settlement. If reliable token usage is unavailable, the
existing conservative reservation fallback remains in effect; the platform does
not invent token counts.
