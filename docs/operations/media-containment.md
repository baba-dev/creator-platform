# Media processing containment

The worker keeps provider orchestration, credit/storage settlement and mail
separate from optional media admission. Heavy asset tasks use one globally
active BullMQ job and one shared native-media slot inside each worker process.
FFmpeg decoder/encoder/filter threads default to one. Worker Sharp concurrency
also defaults to one, with a 32 MB operation cache.

## Settings

Set these in `/etc/aiwa-creators/creator.env`, then restart `creator-worker`.
Defaults apply to existing installations without an environment migration.

| Setting                       | Default | Bounds and behavior                                                                                                                               |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MEDIA_PROCESSING_ENABLED`    | `true`  | `false` pauses the shared asset queue and its dispatcher; provider polling, mandatory output validation, settlement, reasoning and mail continue. |
| `MEDIA_THREADS`               | `1`     | Integer 1–2; applied to each FFmpeg decoder, output encoder, filter pool and worker Sharp concurrency.                                            |
| `MEDIA_DERIVATIVE_TIMEOUT_MS` | `60000` | 15000–120000 ms; bounded poster, storyboard and waveform execution. Video export keeps its existing 300-second limit.                             |

The queue limit is set before the asset worker starts, so already queued jobs
are contained too. All worker replicas must use the same enabled setting.
Disabling processing does not interrupt work already executing in another
replica. The supported host profile for this containment release remains one
worker service: the native-media gate includes generation image validation
within that process, while Redis global concurrency coordinates asset tasks
across workers. A cross-process gate for every native-media path belongs to the
durable scheduler phase.

Changing the environment requires a restart. Use normal graceful shutdown;
briefly freezing the entire worker is an emergency diagnostic only, as it also
pauses mail and provider recovery. On an overloaded host, change the media flag
while frozen, thaw, and restart so shutdown can drain outstanding work.

## Retry behavior

Asset jobs have three attempts with exponential backoff starting at 30 seconds.
Exhausted failures are retained without count-based eviction. The dispatcher
never deletes failed tasks or recreates their attempt budget. Retained failed
image edits/exports also invoke idempotent terminal cleanup on later scans if
the initial failure handler was interrupted.

Derivative scanning advances through bounded ID-ordered pages. An old page of
failed tasks cannot permanently prevent newer assets from being considered.
Originals remain READY if only optional derivatives fail. Generation prices,
provider requests, credit ledger rules and media output quality are unchanged.

Queue retention survives ordinary worker restarts when Redis persistence is
healthy. It is not a database-backed execution history: deleting failed jobs,
flushing Redis or restoring an older snapshot can reset that protection. Do not
automatically clean the failed asset queue. Monitor Redis memory/headroom,
especially with the production `noeviction` policy and 96 MiB limit. Durable
retry history, failure archival and leases are the next phase.

## Operator recovery

The release includes a root-only wrapper and bundled operations command:

```bash
sudo creator-ops media-status
sudo creator-ops media-retry <assetId>
```

Status shows shared pause state, global concurrency and aggregate counts without
prompts or customer URLs. Retry accepts only a failed `derive` job whose payload
matches a READY local image/video/audio asset. It records an audit event with
the previous attempt count before explicitly reopening the bounded budget. If
processing is paused, the retried task remains queued. Fix the cause before
retrying; never loop this command over failing assets. Failed image edits and
exports retain their existing new-request recovery flow and storage accounting.

If the installed wrapper predates this release, the normal successful deployment
installs its new version. The packaged equivalent is
`sudo /var/www/creator-platform/current/ops/bin/creator-ops media-status`.

## Validation and rollout

1. Confirm active release, provider shape/CPU entitlement, available memory,
   Redis headroom, disk space and current queue counts. Leave unrelated download
   workloads stopped during incident recovery.
2. Deploy with `MEDIA_PROCESSING_ENABLED=false` if the host is still overloaded.
   Verify web access, provider polling/settlement and mail independently.
3. Set processing to true and restart. Check `media-status` reports global
   concurrency 1. Observe representative edits/exports and preview backlog work.
4. Compare SSH/web responsiveness, interval `vmstat`, swap activity, task errors
   and completion throughput. Guest scheduling limits still depend on the
   provider; one thread cannot guarantee sufficient sustained CPU entitlement.

Regression coverage includes concurrent native callers, nested render/probe
work, permit release after failure, subprocess timeout/exit/output bounds, real
video rendering and derivatives, and Redis global concurrency with two workers.
Redis integration tests run with `GENERATION_INTEGRATION_TEST=true` in CI.

No database migration is required. Rollback to the previous code reintroduces
its automatic failed-job recreation and unrestricted threading, and it does not
honor the media flag. Do not roll back into an overloaded host with media work
enabled; stop/freeze the old worker temporarily or forward-fix containment.
