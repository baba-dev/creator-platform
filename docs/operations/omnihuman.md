# OmniHuman connection and recovery

OmniHuman 1.5 uses the BytePlus Vision signed API, separately from ModelArk and
MediaKit. Set `BYTEPLUS_VISION_ACCESS_KEY_ID` and
`BYTEPLUS_VISION_SECRET_ACCESS_KEY` in the server environment consumed by both
web and generation workers. Restart both services after changing credentials.
Never place these values in browser variables or logs. The MediaKit API key is
not an OmniHuman credential.

Use **Admin → Models → Verify OmniHuman connection** for a bounded, read-only
`CVGetResult` authentication probe. It does not submit a video. A verified
result confirms signed result access from the web process, not worker
environment parity, submission entitlement, quota or a completed generation. An
unverified response shows a sanitized code; verify IAM access, Vision activation
and server clock. The signer uses service `cv`, region `ap-singapore-1` and
version `2024-06-06`, independently of the ModelArk region.

For a controlled end-to-end test, use a consented portrait and a short MP3/WAV
speech track, select 720p, review the current credit quote, and submit once.
Confirm the durable provider task ID, saved private video asset and one credit
capture. This is billable unless an applicable provider trial covers it. Audio
must be shorter than 60 seconds. Pricing uses trusted stored audio duration
rounded up to whole seconds and the published price snapshot.

Provider video links last one hour. Storage recovery polls the existing task to
refresh output metadata; never resubmit generation to recover a download.
Missing or expired task results cannot prove an unbilled failure: move to
`MANUAL_REVIEW`, retain the reservation and reconcile with provider evidence. A
cancel rejection (`VISION_50217`) is not a successful cancellation. An ambiguous
submit retains credits and requires review; no automatic resubmit.

API contract:
https://docs.byteplus.com/en/docs/byteplus-vision/omnihuman-video_generation

## MediaKit finishing tools

Completed OmniHuman videos can use three BytePlus MediaKit tools: portrait
matting, VQScore assessment and smoothness detection/repair. Configure
`BYTEPLUS_MEDIAKIT_API_KEY` on both web and the worker deployment. The worker
role must own the `provider-tools` queue (`all`, `core` or `orchestration`). The
base URL and bounded request/idle timeouts are documented in `.env.example`.

Roll out the tools in this order:

1. Apply the database migration and deploy web and workers together.
2. In **Admin → MediaKit tools**, sync the allow-listed registry.
3. Publish an immutable price for each tool. Smoothness requires both its repair
   ceiling and its lower detection-only provider cost.
4. Enable each tool explicitly only after the corresponding BytePlus product is
   active for the production account.
5. Run one short consented OmniHuman output through assessment, MP4 matting,
   transparent WebM matting and smoothness. Confirm one reservation and one
   capture per execution, a private durable output where expected, and released
   storage reservation for a detection-only smoothness result.

The browser supplies only an Asset ID. Workers exchange it for a short-lived,
execution-bound HTTPS capability after rechecking tenant, owner and asset state.
Never copy capability or provider output URLs into logs or operator notes.
Smoothness repair accepts at most 35 seconds and always requests source-FPS
alignment.

Provider success is persisted before output download. Storage recovery must
reuse that result and must never resubmit billable work. `MANUAL_REVIEW` keeps
the credit reservation when provider acceptance, authoritative usage or output
durability is ambiguous. Verify the provider task and stored object before any
ledger adjustment; use an audited reversal or adjustment rather than editing
ledger history. Do not clear a review row merely to bypass the per-source
unsettled-work guard.
