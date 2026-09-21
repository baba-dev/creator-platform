# Image generation

Studio now submits one 2K PNG through the verified BytePlus adapter. Video,
voice, reference images and prompt enhancement are not enabled in this flow. The
generation integration is exercised in CI with real MariaDB and Redis services.
Studio requests PNG output so asset validation and serving remain deterministic.

## Deployment

Use the normal release deployment. The migration maps legacy image catalog IDs
onto `seedream-5-0-260128` and `seedream-4-5-251128`, preserving IDs, prices,
enabled flags and history. A fresh database still requires `pnpm db:seed`.

Both services read the existing `BYTEPLUS_API_KEY`, region and ModelArk URL.
`ASSET_STORAGE_ROOT` defaults to `/var/www/creator-platform/shared/assets`. The
directory must be writable by `aiwa-creator`, live outside immutable releases,
and be backed up with the database. The standard bootstrap already creates its
parent with the correct ownership. Multi-host deployments must mount the same
shared filesystem on web and worker.

The worker uses the generated Prisma runtime shipped in the isolated operations
package. No server-side dependency installation is required.

## Flow and accounting

1. Authenticated submission validates origin, input, active organization,
   membership, model, current price version, spending cap and storage quota.
2. An organization row lock serializes admission. Job creation, credit
   reservation, a 25 MiB pending asset allocation and QUEUED status commit in
   one database transaction. The browser never sets credit amounts.
3. Every ten seconds the worker publishes durable QUEUED/PROCESSING records into
   Redis/BullMQ. Redis failures do not lose accepted jobs.
4. An atomic QUEUED → SUBMITTED claim permits only one provider submission.
   Provider output metadata is saved before downloading.
5. The worker validates the HTTPS CDN destination, pins a public IPv4 address,
   rejects redirects and limits downloads to 25 MiB. It atomically writes a PNG
   into persistent storage. A second database transaction marks the asset READY,
   captures reserved credits and marks the job SUCCEEDED.
6. Studio polls job history and balance. Previews/downloads authorize current
   membership on every request; provider URLs and filesystem paths are private.

Definite provider rejection releases credits and the pending storage allocation.
Storage retries reuse saved output metadata without another generation call.
Synchronous provider timeouts and interrupted submissions enter MANUAL_REVIEW
with credits reserved: BytePlus does not provide a verified image-submission
idempotency/retrieval guarantee, so retrying could incur another provider
charge. After 24 hours, unresolved storage failures also require review. An
operator must reconcile the provider outcome before refunding/releasing a
reservation or restoring PROCESSING for storage recovery; do not requeue
uncertain submissions. There is no automated manual-review resolution UI in this
PR.

## Verification

CI uses disposable MariaDB and Redis services to verify concurrent admission,
reservation, real BullMQ delivery, asset writing, capture, duplicate processing,
insufficient funds, spending caps and access checks. Only the external provider
response and CDN download are mocked; no credentials or paid calls are required.
Unit tests cover definite failures, uncertain timeouts and storage retries.

After deployment, use a funded workspace with an enabled, priced image model:
enter a prompt in Studio, generate, wait for Ready, and download the PNG.
Confirm one RESERVATION and one CAPTURE for the job and a corresponding wallet
decrease. This live Studio acceptance check requires the deployed server's
provider key; the earlier adapter smoke test alone does not prove the complete
deployed flow.
