# Repository instructions

These rules apply to every contributor and coding agent.

## Architecture

- Preserve the modular-monolith boundary: `apps/web` handles UI and short HTTP
  work; `apps/worker` handles provider calls and long-running jobs.
- Keep business rules in packages, not route handlers or React components.
- Access BytePlus and NVIDIA only through `@aiwa/providers` adapters.
- Never import server credentials into a client component or use a
  `NEXT_PUBLIC_` provider secret.

## Money and credits

- Store OMR as integer baisa, provider USD cost as integer micro-USD, platform
  credits as integers, and margin/rates as rational integers.
- Never use JavaScript `number` arithmetic for monetary values.
- Wallet history is immutable. Correct mistakes with reversal or adjustment
  entries; never rewrite or delete a posted entry.
- Reserve customer credits before submitting a billable provider request.
- Require idempotency keys on generation and financial mutations.

## Assets and media

- Treat `Asset` as the canonical media identity; pass asset IDs across product
  boundaries instead of raw customer-controlled paths or URLs.
- Keep user filenames as display metadata only. Storage object keys must be
  opaque, server-generated and tenant scoped.
- Reserve storage before accepting uploads or billable generation work, then
  atomically finalize or release that reservation with the asset state change.
- The `AssetStorageUsage` row is a cache; Asset rows remain authoritative and
  reconciliation must be safe to run repeatedly.
- Do not bypass `@aiwa/assets` storage/accounting primitives when adding new
  upload, derivative or external-storage flows.
- Generated-asset provenance is immutable: moving an asset must not rewrite the
  generation job that originally produced it.
- Keep original media private. Grid/list UIs must use bounded derivatives, never
  full originals, once variants are available.
- Never trust upload filenames, extensions, or browser MIME declarations; verify
  supported content by binary signature before persistence.
- Customer trash is a recoverable 30-day lifecycle state. Do not delete bytes or
  free used storage until purge succeeds for the original and all variants.
- Favourites are per-user; folders and tags are organization-scoped. Every
  assignment mutation must revalidate tenant ownership.
- Bound bulk asset mutations to 100 IDs per request and keep generated
  provenance immutable during project/folder/tag changes.

## Generation templates

- Templates are an orchestration/configuration layer only; never submit provider
  work or reserve credits from a template route.
- Resolve template placeholders server-side using inert declared variables.
  Never introduce executable template expressions or eval-like behavior.
- A GenerationJob may reference only a PUBLISHED template whose media kind
  matches the job.
- Validate template defaults against the current enabled ProviderModel
  capabilities and active price rather than assuming seeded provider support.
- Reference-image template inputs remain Asset IDs and must pass the existing
  organization/user/reference-purpose authorization checks.

## Quality and security

- Validate every external boundary with Zod or an equally explicit schema.
- Do not log prompts, credentials, payment references, or customer media URLs.
- Add tests for ledger, pricing, authentication, and generation state changes.
- Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
  `pnpm build` before opening a pull request.
- Do not commit `.env` files, generated media, database dumps, or real customer
  information.

## Brand media

- Product identity assets live only in `apps/web/public/brand/`; do not place
  them in `packages/assets` or the customer Asset Library.
- Use the approved Creative Cursor mark. Prefer the horizontal logo for
  navigation and the symbol/PWA variants for compact surfaces.
- Keep filenames stable because metadata and installed PWAs reference them
  directly.

## Interface and design system

- Read `docs/design-system.md` before creating or changing user interface.
- Use the Pencil & Pixel semantic tokens from `apps/web/src/app/globals.css`; do
  not add fixed palette colours when a semantic token exists.
- Every UI change must work in both `data-theme="light"` and
  `data-theme="dark"`.
- Reuse shared primitives before creating a local substitute, including the
  creative and sketch primitives in `apps/web/src/components/ui`.
- Use Bricolage Grotesque for display headings, Manrope for product text, and
  Caveat only for short annotations.
- Keep sketch treatments sparse: one focal hand-drawn gesture per major
  viewport.
- Preserve keyboard focus, reduced-motion support, and honest demo labels.
- Treat `/design-system` as the living visual reference.
