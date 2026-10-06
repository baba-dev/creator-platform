# Pixel workspace operator

Pixel uses the existing modular monolith: short authenticated web requests,
MariaDB for durable state, and canonical generation jobs processed by workers.
It does not run a local language model or add a separate worker queue.

## Capabilities

- Provider-independent help from the versioned application knowledge pack.
- Deterministic balance, recent job, storage, member and model lookups.
- Bounded asset search respecting private reference ownership.
- Current-page context, ordered asset references, authorized
  creative-conversation context, and explicit brand/language/style preferences.
- Safe links to studios, editors, storage, members, history and other app pages.
- Immutable image/video/speech workflows with up to five steps and four image
  outputs per step. Steps may consume an explicitly selected image from an
  earlier completed step. The user reviews and approves each paid step.
- Saved tasks, partial outputs, read-only request recovery, and stopping future
  steps without claiming that approved jobs were cancelled.

Basic help can run in an already-loaded browser while disconnected. It has no
live account information in that mode; this is not a guarantee that an uncached
application can start without internet. When an AI provider is unavailable but
the server is reachable, local help and deterministic lookups remain available.

## Authorization and data

Every tool revalidates the actor's active membership, Pixel thread ownership,
and required organization permission. Organization slugs come from the server.
Job diagnostics expose the actor's jobs and bounded associated wallet entries;
they do not expose provider payloads or credentials. Private reference assets
are visible only to their storage owner, consistent with Asset Library policy.

The model chooses only registered, schema-validated tools. It cannot submit a
paid job itself, grant credits, execute SQL, change permissions or fetch
arbitrary URLs. Member information is role-limited; membership changes and other
sensitive administration use the existing management screens and their
permission gates. Support and reminder tools additionally require an explicit
matching user request. Tool audit entries contain action names and identifiers
rather than prompts, customer media URLs, credentials or provider bodies.

Preference memory is off by default and scoped to user plus organization.
Turning it off deletes the preference row. Historical conversation/job records
remain historical records. Brand selections are revalidated within the tenant.
Retrieved text, names and brand guidelines are data, never authorization.

## Approval, billing and recovery

`PixelWorkflow` owns immutable ordered `PixelAction` drafts. A quote persists
the exact normalized request, signed maximum, source, price version and model.
An approval identifies that exact quote. Quote replacement and cancellation
compete with approval under row locks. Canonical generation admission performs
the usual membership, price, capability, quota, spending-budget and credit
checks.

Each action has a deterministic generation request key, so concurrent approval
or recovery uses the same canonical reservation/job. Uncertain admission stays
`ADMITTING`; it cannot be requoted into a second job. Definitive rejection
without a durable job resets the draft for a fresh quote. Refreshing or
reopening Pixel does not submit generation. Text request reconciliation reads
existing canonical jobs and projects their completed results. Paid reasoning
also requires review.

Later steps wait for previous jobs to succeed. A failure keeps earlier outputs
accessible and stops automatic progression. Future-step cancellation preserves
already approved jobs. `MANUAL_REVIEW` and uncertain provider outcomes never
invite automatic resubmission or unconditional refund claims.

## Deployment and verification

Apply migration `20261006180000_pixel_operator` before starting the new web
release; the existing deployment pipeline applies migrations. The migration adds
workflow/action/preference tables and does not rewrite wallets or assets.

Run formatting, lint, typecheck, tests and build. With
`GENERATION_INTEGRATION_TEST=true`, the assistant integration test verifies real
MariaDB concurrent approval, one reservation, durable linking, cancellation and
preference deletion. Existing generation/ledger integration tests remain
required.

Check desktop and 320px mobile layouts in both themes: local help, storage help,
job diagnostics, workflow approval, source selection, preference save/forget,
keyboard navigation, and reopening Pixel while a job is running.
