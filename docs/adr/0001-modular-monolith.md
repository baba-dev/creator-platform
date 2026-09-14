# ADR 0001: Modular monolith with a worker

- Status: Accepted
- Date: 2026-09-14

## Decision

Use one pnpm/Turborepo repository containing a Next.js application, a BullMQ
worker, and domain packages. Deploy the web and worker as separate containers.

## Consequences

The team gets one type system, one review surface, and low staging overhead.
Long-running and retryable work remains isolated from HTTP. Package boundaries
must be enforced in review so the monolith does not become an unstructured code
base.
