# Asset management architecture

This document defines the P0/P1 asset architecture: canonical media identity,
secure storage/accounting, uploads, derivatives, organization library metadata,
search, favourites, trash and bulk organization workflows.

## Core invariant

`Asset` is the canonical media record for generated output, user uploads,
derived previews, future imports and externally stored media. Features must pass
asset IDs across domain boundaries rather than raw customer-controlled file
paths or arbitrary URLs.

A generation job records historical provenance. Reorganizing an asset later must
not rewrite the generation job that created it.

## Lifecycle

Primary asset states:

```text
PENDING -> READY -> DELETED -> PURGED
              \-> QUARANTINED
```

- **PENDING** reserves storage before provider or upload work starts.
- **READY** means the object is durable and can be served.
- **QUARANTINED** keeps bytes accounted while preventing normal customer use.
- **DELETED** is a recoverable logical deletion; `deletedAt` and `purgeAfter`
  control retention. Customer trash retains bytes for 30 days and therefore
  continues counting against physical storage until purge.
- **PURGED** retains audit/provenance metadata after bytes have been removed.

Generation failure currently sets `purgeAfter` immediately because a failed
PENDING reservation never represented user-visible media. Customer trash uses a
30-day retention window. The worker permanently removes the original and all
variants before changing the row to PURGED and releasing the physical storage
bytes.

## Provenance

Every asset has explicit metadata instead of relying on nullable relations:

- `mediaKind`: IMAGE, VIDEO, AUDIO, DOCUMENT or OTHER.
- `sourceType`: GENERATED, UPLOADED, IMPORTED, DERIVED or EXTERNAL.
- `createdById`: actor responsible for creating the logical asset.
- `uploadedById`: uploader when sourceType is UPLOADED.
- `generationJobId`: immutable generation provenance when generated.
- `storageOwnerUserId`: user to whom storage quota is attributed.

Generated assets created before this migration are backfilled as GENERATED and
their existing storage owner becomes the creation actor.

## Storage abstraction

`@aiwa/assets/storage` defines the provider-neutral `AssetStorage` contract:

- put
- read
- readRange
- stat
- delete

The initial `LocalAssetStorage` backend writes private objects atomically via a
same-directory temporary file and rename. It rejects traversal, absolute paths,
NUL bytes and malformed keys.

New object keys are opaque and server generated:

```text
org/{organizationId}/assets/{shard}/{random-id}.{ext}
```

A customer filename is display metadata only and must never become an object
key. Existing generation keys such as `{jobId}.png` remain supported during the
compatibility migration.

Future S3, Google Drive and OneDrive implementations must satisfy the same
interface. Provider-specific tokens and identifiers must not leak into client
components.

## Variants and derivative pipeline

`AssetVariant` stores THUMBNAIL, PREVIEW and POSTER objects. Variants are
private objects with their own checksum and dimensions and are cascade-owned by
the canonical asset.

The `asset-ingestion` worker produces bounded derivatives:

- IMAGE -> WebP THUMBNAIL and PREVIEW.
- VIDEO -> WebP POSTER, keeping the MP4 out of grid/list rendering.

The library and inspector request variants through authenticated endpoints.
Originals remain private and are fetched only for full
preview/download/playback. Derivative bytes are platform-generated overhead and
are not charged to the customer quota; the canonical original remains the
billing/accounting unit.

## Storage accounting

`AssetStorageUsage` maintains organization-level cached accounting:

- `usedBytes` for READY/QUARANTINED/retained-DELETED original objects
- `reservedBytes` for accepted PENDING allocations
- `readyAssetCount`
- monotonic `version`
- `reconciledAt`

The row is locked before reservations and state transitions. This prevents two
concurrent generation requests from both observing stale free space and
oversubscribing the organization quota.

Member-level usage remains derived from authoritative Asset rows because the
current member limit keeps that query bounded.

The accounting row is a cache, not the source of truth. Maintenance tooling may
call `reconcileAssetStorageUsage` to rebuild it from Asset rows.

## Quotas

Default limits remain:

- member: 1 GiB
- organization: 10 GiB

The canonical constants now live in `@aiwa/assets`; the organizations package
re-exports its existing public names for compatibility.

Reservation rules:

1. Reserve the maximum possible output before accepting billable work.
2. Insert the PENDING Asset in the same transaction.
3. On durable storage, atomically convert reserved bytes to actual used bytes.
4. On failure/cancellation, release the reservation before marking the asset
   deleted.
5. Never silently clamp an inconsistent counter; fail and reconcile instead.

## Security rules

- Storage is private by default.
- Access is authorized by organization membership.
- Inaccessible assets return 404 to avoid cross-tenant existence disclosure.
- Browser-provided MIME types and filenames are untrusted.
- Object keys are server generated and path-independent from display names.
- Preserve existing provider-download SSRF allowlists and content validation.
- Do not log prompts, customer media URLs, storage credentials or raw file
  contents.
- Keep Content-Disposition filenames generated from trusted metadata.
- All future upload mutations require trusted-origin/CSRF protection, explicit
  size limits, binary validation and quota reservation before persistence.

## Library metadata

Folders are organization-scoped and support parent/child relationships.
Generated-asset provenance never changes when an asset is moved between a folder
or project.

Tags are normalized per organization with a unique normalized identity while
preserving display casing. Favourites are per-user joins, so one member's
favourite state never changes another member's library.

Search/filter endpoints are organization-authorized and support media kind,
source, project, folder, tag, favourite and trash filters. Bulk mutations are
bounded to 100 assets per request and revalidate project/folder ownership.

## Upload security

Direct uploads are Node-runtime multipart requests with a hard 100 MB request
object cap and tighter per-media limits. Browser MIME types and extensions are
not trusted. The server accepts only a conservative allowlist after binary
signature inspection: PNG, JPEG, WebP, MP4, MP3, WAV and PDF.

Uploads follow reserve -> PENDING row -> atomic object write -> READY finalize.
Any persistence failure deletes the partial object and releases the reservation.
Production Nginx must enforce a request body ceiling at or below the platform
hard limit to prevent oversized multipart buffering before application checks.

## API compatibility

`GET /api/assets/:assetId` remains the authenticated binary endpoint during P0,
including byte ranges for video/audio. P1 may introduce explicit `/content` and
`/thumbnail` endpoints while retaining this route until all callers migrate.

## P1 product surface

The organization workspace exposes a responsive grid/list Asset Library with
search, media/project/folder/tag filters, favourites, trash, upload drag/drop,
bulk selection and an inspector for preview, rename, project/folder assignment,
tagging, favourite state and download.

Reference-image generation must consume authorized Asset IDs from this library,
not arbitrary remote URLs.
