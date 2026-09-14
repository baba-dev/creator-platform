# Contributing

1. Create a short-lived branch from `main`.
2. Install Node.js 24 and enable Corepack.
3. Run `pnpm install` and copy `.env.example` to `.env`.
4. Start dependencies with `docker compose -f compose.dev.yml up -d`.
5. Make a focused change with tests.
6. Run
   `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
7. Open a pull request and complete the checklist.

Use Conventional Commits such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:`,
and `chore:`. Financial-ledger, authentication, provider, and pricing changes
require explicit review.
