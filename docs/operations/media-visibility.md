# Media visibility and recovery (Phase D)

Optional previews have their own lifecycle. A failed thumbnail, poster, waveform
or storyboard does not make a READY original fail and does not reverse a paid
provider generation. Downloads remain available through the existing authorized
asset endpoint. The grid and image inspector never silently load a full original
when a preview is absent. Explicit video/audio playback and downloads still
work.

## Customer experience

The asset list includes per-kind `previews` status. Published variants always
win over stale task status, so partial success remains usable. States
distinguish queued, processing, automatic cooldown, exhausted failure, ownership
review and unavailable previews. Completed tasks whose variant is absent are
unavailable, not perpetually preparing. External storage and trashed assets do
not advertise native retry. Image errors degrade to an explicit unavailable
placeholder.

The library polls only pending/processing/cooldown assets, every 10 seconds
while visible, in rotating batches of at most 100. Metadata updates preserve
selection, filters and loaded pages. Poll failures leave downloads usable.
Image-edit and video-export status responses expose durable `processingState`;
REVIEW tells the customer to contact support while keeping reservation/ownership
protections.

`POST /api/assets/:assetId/previews/retry` requires a verified session, trusted
origin, assets:manage on an active organization, task ID and expected cycle.
Membership, target and source eligibility are rechecked inside the locked
transaction. Private reference inputs are restricted to their owner. Existing
variants, wrong tenants/kinds, deleted sources, stale cycles, running tasks,
REVIEW, edits and exports cannot be retried through this action.

Each web retry opens a new cycle with up to three automatic attempts. Both
customer and admin web retries allow at most three total cycles (two additional
manual retries); exhausted tasks require operator investigation. A 10/minute
per-user limiter fails closed when Redis is unavailable. Competing requests
cannot open duplicate cycles. The retry/audit/fence change is atomic and
preserves all attempt history. It never changes wallet, generation or storage
accounting.

## Operations

`/admin/media` and its read APIs require jobs:read. Retrying requires
jobs:manage, trusted origin and the expected cycle. Platform roles are rechecked
in the retry transaction. No web action can reclaim expired native capacity or
confirm that old processes have stopped. Use the Phase B root-only runbook for
those actions.

The screen provides counts, oldest pending/cooldown state age, successful and
failed attempts in a rolling 15-minute window, redacted native-capacity
ownership, latest attention rows, state-filtered cursor browsing and the latest
30 attempts for a selected task. Counts include retained historical tasks. Queue
age measures time since the last durable state change; it is not provider
generation latency or the age of a Redis message. Throughput measures successful
MediaTask attempts, not billable generations. The two additive diagnostic
indexes cover task status/ update time and attempt finish time/outcome. Apply
the migration before activation.

`creator-ops media-status` includes the same durable metrics plus current BullMQ
waiting/active/delayed/failed counts, actual queue pause and global concurrency.
Task payloads never expose prompts, customer URLs, output object keys or
ownership tokens. Detailed attempt history is bounded to 30 and can include
revoked cycles.

Every worker role publishes a role/instance-tagged heartbeat to Redis every 30
seconds, expiring after 90 seconds, and writes matching structured logs.
Telemetry uses separate bounded Redis connections; it cannot indefinitely delay
a web request. Readers use bounded SCAN/MGET, validate records, ignore
malformed/stale samples and show unknown connectivity as unavailable. Redis loss
does not prevent reading MariaDB task history. Heartbeats are diagnostic, never
ownership leases. Only Phase B's database clock/fence determines execution or
publication authority.

Metrics: RSS; event-loop p99/max; stalled locks since that process started;
Linux host available memory, CPU-steal percentage between samples, and
CPU/memory/I/O `some avg10` pressure. Unsupported /proc readings are null, never
a false zero. The first CPU sample has no steal rate. Host readings can repeat
across roles; do not sum them. They are not a cgroup memory quota or a promise
of VPS capacity.

Alerts appear in the operations screen with suggested actions. Resource and lock
alerts also appear in structured worker logs. No mail, webhook or external
notification service is configured by this change. Thresholds are diagnostic:

| Condition                    | Threshold / action                                            |
| ---------------------------- | ------------------------------------------------------------- |
| No fresh media/all heartbeat | Check service, deployment version and Redis                   |
| Media disabled               | Review media service configuration before resuming            |
| Expired capacity or REVIEW   | Confirm old processes stopped; audited root recovery          |
| FAILED tasks                 | Inspect codes/history; only eligible previews offer web retry |
| Backlog                      | Oldest queued state > 10 minutes                              |
| Event loop                   | p99 > 250 ms                                                  |
| Queue lock                   | Any observed stalled lock since process startup               |
| RAM                          | Host available < 15%                                          |
| CPU steal                    | > 20% between samples; investigate VPS entitlement            |
| Resource stalls              | CPU avg10 > 40%, memory > 10%, or I/O > 20%                   |

Automatic alerts do not pause, reclaim capacity, refund, reset budgets or
increase concurrency. A paused worker can still emit a healthy process
heartbeat. After a worker restart, its stalled-lock counter resets; retained
task history does not.

## Acceptance and deployment

Run migrations and deploy web/selected worker roles together. Phase C's topology
remains operator-selected. Retain additive tables/indexes on application
rollback. The tests cover partial preview success, terminal placeholders, web
permission/ origin/budget checks, racing retries, audit/tenant enforcement,
pressure parsing, malformed/stale telemetry and existing
settlement/cleanup/recovery behavior.

Production acceptance still requires a representative backlog with login,
dashboard and security mail, a stopped/expired media worker, an optional-preview
failure with a usable original, and inspection of real VPS pressure. Local tests
and screenshots do not establish production responsiveness or memory headroom.

References:
[Node event-loop metrics](https://nodejs.org/docs/latest-v24.x/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions),
[Linux pressure stall information](https://docs.kernel.org/accounting/psi.html).
