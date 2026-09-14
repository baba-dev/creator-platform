# Architecture overview

The first release is a modular monolith with a separately deployed worker. This
keeps deployment affordable on the staging VPS while preserving clear module
boundaries for later extraction.

## Runtime boundaries

- `apps/web` owns rendering, authentication endpoints, short API operations,
  quotes, uploads, and administrative workflows.
- `apps/worker` owns queues, provider submissions, polling, reconciliation, and
  asset ingestion.
- MariaDB is the durable source of truth.
- Redis provides queues, locks, throttles, and ephemeral progress only.
- S3-compatible storage holds customer inputs and generated assets.

No provider request may run inside a browser request when it can outlive a
normal HTTP timeout. The web app writes the job and its credit reservation
transaction, then enqueues work after the database transaction commits.

## Package boundaries

| Package               | Responsibility                          |
| --------------------- | --------------------------------------- |
| `@aiwa/core`          | Domain states and invariants            |
| `@aiwa/credits`       | Integer pricing and credit calculations |
| `@aiwa/db`            | Prisma schema and database client       |
| `@aiwa/providers`     | BytePlus and NVIDIA ports/adapters      |
| `@aiwa/config`        | Validated server environment            |
| `@aiwa/validation`    | Shared boundary schemas                 |
| `@aiwa/observability` | Redacted structured logging             |
| `@aiwa/ui`            | shadcn-compatible UI primitives         |
| `@aiwa/testkit`       | Deterministic test helpers              |
