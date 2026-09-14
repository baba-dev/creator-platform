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

## Quality and security

- Validate every external boundary with Zod or an equally explicit schema.
- Do not log prompts, credentials, payment references, or customer media URLs.
- Add tests for ledger, pricing, authentication, and generation state changes.
- Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
  `pnpm build` before opening a pull request.
- Do not commit `.env` files, generated media, database dumps, or real customer
  information.
