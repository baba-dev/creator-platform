# Image, video, and voice generation

Studio submits PNG images and asynchronous MP4 video tasks through the verified
BytePlus adapter and synthesizes MP3 speech through the separately credentialed
Seed Speech v3 API. Prompt enhancement targets image and video; it is not shown
for literal voice scripts. Reference-media inputs are not enabled. The
generation integration is exercised in CI with real MariaDB and Redis services.

## Deployment

Use the normal release deployment. The migration maps legacy image catalog IDs
onto `seedream-5-0-260128` and `seedream-4-5-251128`, preserving IDs, prices,
enabled flags and history. A fresh database still requires `pnpm db:seed`.

Both services read the existing `BYTEPLUS_API_KEY`, region and ModelArk URL.
Voice additionally requires `BYTEPLUS_SPEECH_API_KEY`; ModelArk and legacy App
ID/access-token credentials are not interchangeable with that key.
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
   reservation, a pending asset allocation (25 MiB image or 100 MiB video) and
   QUEUED status commit in one database transaction. The browser never sets
   credit amounts.
3. Every ten seconds the worker publishes durable QUEUED/PROCESSING records into
   Redis/BullMQ. Redis failures do not lose accepted jobs.
4. An atomic QUEUED → SUBMITTED claim permits only one provider submission.
   Image output metadata or the asynchronous video task ID is persisted before
   recovery continues. Video task status is polled without resubmission.
5. The worker validates the HTTPS CDN destination against explicit BytePlus and
   documented ModelArk object-storage hosts, resolves and pins a public IPv4
   address, revalidates up to three redirects, limits downloads to 25 MiB, and
   verifies the PNG or MP4 signature before persistence. It atomically writes
   media into shared storage. A second database transaction marks the asset
   READY, captures reserved credits and marks the job SUCCEEDED.
6. Studio polls job history and balance. Previews/downloads authorize current
   membership on every request; provider URLs and filesystem paths are private.

Definite provider rejection releases credits and the pending storage allocation.
Storage retries reuse saved output metadata without another generation call.
Failures are recorded on the job with sanitized storage error codes/messages and
are retried with queue backoff plus a one-minute redispatch cooldown rather than
a tight loop. Synchronous provider timeouts and interrupted submissions enter
MANUAL_REVIEW with credits reserved: BytePlus does not provide a verified
image-submission idempotency/retrieval guarantee, so retrying could incur
another provider charge. After 24 hours, unresolved image or voice storage
failures require review; video tasks enter review after a two-hour recovery
window. An operator must reconcile the provider outcome before
refunding/releasing a reservation or restoring PROCESSING for storage recovery;
do not requeue uncertain submissions. There is no automated manual-review
resolution UI in this flow.

## Verification

CI uses disposable MariaDB and Redis services to verify concurrent admission,
reservation, real BullMQ delivery, asset writing, capture, duplicate processing,
insufficient funds, spending caps and access checks. Only the external provider
response and CDN download are mocked; no credentials or paid calls are required.
Unit tests cover definite failures, uncertain timeouts and storage retries.

After deployment, use a funded workspace with enabled, priced image, video and
voice models. Generate one of each, wait for Ready, verify in-browser MP4
seeking and MP3 playback, and download the PNG/MP4/MP3. Confirm one RESERVATION
and one CAPTURE per successful job and the corresponding wallet decreases. This
live Studio acceptance check requires the deployed server's provider key; the
adapter smoke test alone does not prove the complete deployed flow.

## Production storage origins

ModelArk output URLs are provider-managed signed object URLs. AP Southeast image
generation can use Volcengine TOS origins such as
`ark-acg-ap-southeast-1.tos-ap-southeast-1.volces.com`. The downloader trusts
only the documented generated-media bucket hosts plus existing BytePlus CDN/TOS
domains; it does not trust the whole `volces.com` namespace. When BytePlus adds
or changes an output origin, verify it against BytePlus documentation before
changing the allowlist.

The worker never logs or exposes signed provider URLs. Storage/download failures
may log the job ID, safe error class/message, and retry count only.
