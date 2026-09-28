# Image generation references foundation

This document describes the image-generation foundation introduced for Seedream
5.0 Lite and Seedream 4.5. It is intentionally provider-aware at the adapter
boundary and provider-neutral in the application domain.

## Supported image capabilities

Seedream 5.0 Lite publishes the common aspect ratios `1:1`, `4:3`, `3:4`,
`16:9`, `9:16`, `3:2`, `2:3`, and `21:9`, with `2K`, `3K`, and
`4K` output.

Seedream 4.5 publishes the same common aspect ratios with `2K` and `4K`
output. The provider adapter rejects `3K` for 4.5 even if an internal caller
bypasses Studio admission.

Studio reads these values from persisted `ProviderModel.capabilities`; the
database migration normalizes existing model rows so deployed environments do
not require a seed run to expose the new controls.

## Private reference images

Reference images are normal `Asset` records with
`purpose = REFERENCE_INPUT`. They are not public objects and are never stored
as provider URLs inside a generation request.

Uploads use `POST /api/assets/references` with multipart form fields:

- `organizationId`
- `file`

The endpoint requires an authenticated, verified workspace member with
`generation:create`, validates the mutation origin, enforces workspace storage
quota, and records an audit event. Accepted upload formats are deliberately
limited to JPEG, PNG, and WebP.

The server decodes every upload with Sharp, rejects unsafe dimensions and pixel
counts, applies EXIF orientation, re-encodes the image to remove incidental
metadata, generates a random private object key, and records the checksum,
normalized dimensions, MIME type, and byte size.

`GET /api/assets/references?organizationId=...` returns only the current
user's READY reference inputs. Generic asset delivery also treats reference
inputs as owner-private and returns 404 to other workspace members.

## Generation linkage

Image requests accept up to 14 unique `referenceAssetIds`. Admission verifies
that every referenced asset:

- belongs to the active organization;
- belongs to the submitting user;
- has `purpose = REFERENCE_INPUT`;
- is READY;
- satisfies the selected model's advertised reference-image capability; and
- keeps the bounded reference set within the application safety limit.

An ordered `GenerationInputAsset` relation preserves reference order without
embedding file bytes or expiring URLs in `GenerationJob.requestPayload`.
Reference asset IDs are included in image-job idempotency semantics.

Immediately before provider submission the worker reloads and revalidates each
linked asset. Only then does it read the private bytes and construct a Base64
data URI for BytePlus. Missing, deleted, quarantined, reassigned, or corrupt
references fail before provider dispatch, preserving the existing rule that a
definite local failure releases the credit reservation rather than creating an
uncertain provider outcome.

## Security boundaries

Do not add arbitrary external image URLs to the public generation API. Doing so
would create a new SSRF and content-fetching boundary. Provider URLs, signed
storage URLs, and Base64 image data must not be persisted in
`GenerationJob.requestPayload`.

Reference inputs stay private and are supplied to BytePlus only at worker
execution time. Any future storage backend must preserve the same ownership,
quota, validation, and pre-submit revalidation invariants.

## Follow-up work

Tasks 4-6 should build on this foundation:

1. multi-output/sequential generation should create one output Asset per
   successful provider image while retaining the ordered input relations;
2. reservation and settlement should reserve the requested maximum and capture
   only actual successful outputs, releasing the remainder idempotently; and
3. Studio should use the reference API for drag/drop, thumbnails, reordering,
   removal, and capability-driven controls without sending file bytes as part
   of the generation request itself.

Streaming is a later concern. Persist each provider output before publishing a
progress event; MariaDB remains authoritative and Redis/SSE should only deliver
ephemeral progress.
