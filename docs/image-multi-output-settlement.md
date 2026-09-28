# Multi-output image generation and settlement

This document defines the invariants for related-image generation built on top
of the private reference-image and asset foundations.

## Provider contract

Seedream 5.0 Lite and Seedream 4.5 can generate a related sequence when
`sequential_image_generation = auto`. The application exposes this as
`outputCount`.

The admission layer enforces:

- `outputCount >= 1`;
- `outputCount <= model.maxGeneratedImages`;
- reference images plus requested outputs do not exceed
  `model.maxTotalInputOutputImages`; and
- multi-output requests require `sequentialImages = true`.

A one-image request explicitly sends sequential generation as disabled.

## Reservation model

The request reserves the worst case before provider dispatch:

- credit reservation = per-image customer quote × requested output count;
- storage reservation = maximum image bytes × requested output count; and
- one PENDING generated Asset row is created for every possible output.

Each generated Asset has an immutable zero-based `generationOutputIndex`.
This is the canonical ordering key for a related set. The provider response
order maps directly to these indices.

## Provider result and partial success

The provider may return fewer successful images than the requested maximum.
This is a valid partial success because billing is per successful output.

The worker persists the ordered provider URL manifest before downloading any
output. It then stores each successful image independently:

1. READY slots are skipped during recovery.
2. PENDING slots are downloaded and stored.
3. Storage accounting is finalized for each durable object.
4. A failure leaves the job PROCESSING with credits still reserved.
5. A later worker pass resumes only the missing slots and never resubmits the
   provider generation request.

Provider output greater than the reserved maximum fails closed into
MANUAL_REVIEW because the financial reservation may no longer cover the
provider charge.

## Settlement

Financial settlement happens only after every provider-success output is
durably stored.

The transaction:

1. verifies all successful output slots are READY;
2. releases storage reservations for unused PENDING slots;
3. marks unused slots DELETED for auditability;
4. calculates the exact per-image credit amount from the immutable reservation
   snapshot;
5. captures only `successfulOutputs × creditsPerImage`;
6. relies on the ledger partial-capture primitive to atomically return the
   unused credit reservation;
7. records `actualUnits`, `billableQuantity`, and actual provider cost; and
8. marks the job SUCCEEDED.

A partial set is represented by `actualUnits < quotedUnits` plus
`outputPayload.partialSuccess = true`. No separate terminal status is needed;
the job succeeded with fewer billable outputs.

## Idempotency and recovery

The original request idempotency includes `outputCount`. Reusing a request key
with a different maximum output count is rejected.

Storage retry is safe because completed slots are READY and skipped. Credit
capture remains one idempotent ledger mutation per job. Administrative
multi-output recovery must use `resume_processing` and the original ordered
provider manifest; immediate recovery is intentionally restricted to legacy
single-output jobs.

## Task 6 handoff

Studio can now add UI without changing the financial/storage model:

- output-count selector bounded from capability metadata;
- quote preview = displayed per-image credits × selected output count;
- reference count dynamically reduces the maximum output count;
- result sets render Assets ordered by `generationOutputIndex`;
- partial results compare `actualUnits` with `quotedUnits`; and
- job details can show reserved, charged, and released credits.
