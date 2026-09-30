# Durable media recovery (Phase B)

MariaDB owns execution state and retry budgets. Redis only delivers wakeups;
queue deletion cannot reopen exhausted work. Phase A thread bounds, media pause,
output quality and existing accounting remain.

## Ownership and retry policy

Each target ID + derivative/operation kind + processing version has one task.
Thumbnail, preview, poster, storyboard and waveform have separate budgets. Image
edits and exports use existing operation IDs. Completed variants are reused.
Claims lock a database row and assign an owner UUID, monotonic fence and
five-minute lease, renewed every 15 seconds. Database UTC time determines
eligibility.

Transient errors get three total executions, with 30/60-second backoff and
jitter. Invalid declared inputs and output-limit errors are terminal. Timeouts
retry within the same budget. Expired or revoked owners enter REVIEW; no second
native process starts automatically. Operator retry creates a new audited cycle
and retains old attempt records. The singleton native-media-v1 capacity row
covers FFmpeg/Sharp across worker processes, including mandatory generation
image validation. Provider HTTP and mail do not acquire it. Web upload probes
remain outside this worker gate.

Publication checks ownership and completes the task in the same transaction.
Attempt-specific object keys prevent stale workers overwriting a winner. Keys
are recorded before storage writes. A bounded janitor reclaims unreferenced
failed, abandoned or revoked outputs; active/review outputs are retained. A
preview failure does not fail the original generation or resubmit a paid
provider request.

## Cutover

Apply additive migration 20260930010000_durable_media_tasks through the normal
backed-up release process. Stop ALL old workers before starting new consumers.
On the existing single systemd service, the normal deploy restart stops the old
service and its cgroup children before starting the new worker. With additional
services/hosts, explicitly stop every old consumer first. Never mix releases.

Preserve Redis during legacy discovery: scans and legacy deliveries both import
previous attempts before execution. Failed legacy jobs import exhausted budgets.
History already lost before cutover cannot be reconstructed. After cutover,
MariaDB is authoritative. Redis wakeups use one attempt; database cooldowns and
limits control execution. Scans and terminal storage reconciliation are
paginated.

Keep MEDIA_PROCESSING_ENABLED=false if the host remains overloaded; mandatory
validation, provider orchestration and mail stay enabled. Enable it and restart
when ready, inspect media-status, and verify a known asset before draining
backlog. Check web/SSH responsiveness, native process count and task failures.
CPU entitlement still determines throughput. Pressure control and role isolation
are later work.

Rollback preserves all task/attempt tables. Stop the new worker and its children
before switching releases. Disable media before running Phase A, whose
Redis-only policy cannot enforce durable budgets. Do not drop the additive
migration tables.

## Operator recovery

Use the packaged wrapper; an installed global wrapper may still be Phase A:

```bash
sudo /var/www/creator-platform/current/ops/bin/creator-ops media-status
sudo /var/www/creator-platform/current/ops/bin/creator-ops media-retry <taskId>
```

media-retry now accepts a task ID, not an asset ID. Only failed derivatives get
a new cycle. Edits/exports retain terminal storage release and require a new
product request. Status reports state, cycle, attempts, sanitized errors and
expired capacity.

For lost ownership, stop ALL workers on every participating host and confirm
their native children exited. Freezing a worker is insufficient. Wait for the
five-minute lease to expire; live capacity cannot be cleared. Then:

```bash
sudo /var/www/creator-platform/current/ops/bin/creator-ops media-recover-capacity --confirm-stopped
sudo /var/www/creator-platform/current/ops/bin/creator-ops media-retry <derivativeTaskId> --confirm-stopped
sudo /var/www/creator-platform/current/ops/bin/creator-ops media-abandon <editOrExportTaskId> --confirm-stopped
```

Recover capacity only if status shows an expired occupied slot. It revokes
outstanding processing claims. Abandonment makes an edit/export terminal;
reconciliation releases its pending storage reservation idempotently after the
worker resumes. Each command records an audit before changing ownership. The
operator confirmation assures old processes actually exited; the application
cannot prove that fact across hosts.

## Validation

Database tests cover duplicate claims, exhaustion after queue loss, cooldowns,
partial completion, renewal, stale publication, audited recovery/abandonment and
native capacity across separate Node processes. Existing real FFmpeg,
generation, financial, storage and mail suites remain regression gates.
