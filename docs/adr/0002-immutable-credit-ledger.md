# ADR 0002: Immutable credit ledger

- Status: Accepted
- Date: 2026-09-14

## Decision

Customer credit balances are derived from immutable ledger entries. The wallet's
cached balance and version are updated transactionally with each new entry.
Corrections create linked reversal or adjustment entries.

Money is represented as integer baisa or micro-USD. Quotes store the selected
model price version and exchange-rate rational so historical charges can always
be reproduced.

## Consequences

Finance actions remain auditable and concurrent spending can be controlled with
row-level transactions. Administrative screens must never expose a direct
"overwrite balance" operation.
