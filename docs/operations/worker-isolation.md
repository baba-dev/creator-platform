# Worker service isolation (Phase C)

One codebase and release, selectable processes, existing MariaDB/Redis/storage.
No queue or database migration is required. The default `WORKER_ROLE=all`
retains the current deployment until the host has capacity for separation.

| Role          | Queues and dispatchers                                       |
| ------------- | ------------------------------------------------------------ |
| all           | Every queue (compatibility default)                          |
| core          | Maintenance, generation, reasoning, mail                     |
| orchestration | Maintenance, generation, reasoning                           |
| mail          | Security and routine mail outbox                             |
| media         | Asset derivatives, image edits, video renders, media cleanup |

Each process only creates its own queues, consumers and dispatcher timers. Only
the media owner changes the media queue pause/global-concurrency state.
Generation still validates images with bounded Sharp through Phase B's shared
native gate; it can wait for occupied capacity. Provider submission/polling and
mail no longer share the FFmpeg process when split. Web upload probes remain
bounded in the web process. This is not complete separation of image validation.

## Host sizing and activation

On the 1 GB VPS, start with **core + media**, retaining mail in core to avoid a
third worker process. Measure under representative concurrent traffic first;
Node heap limits do not include native buffers, Prisma, FFmpeg or the database.
The template budgets are ceilings, not a guarantee that all processes fit RAM.
If web, DB, Redis, core and media cannot fit with at least 150 MiB available and
without sustained swap churn, keep media paused and resize the VPS before
activation. Moving media to another host also requires shared private asset
storage and database/Redis connectivity; copying the unit alone is insufficient.

Install `ops/systemd/creator-worker@.service` and the
`creator-worker@media.service.d/limits.conf` directory from the packaged release
into `/etc/systemd/system/`, then run `systemctl daemon-reload`. Bootstrap
installs these files for new servers but enables only the existing monolithic
service.

Drain and stop `creator-worker.service` before switching:

```sh
sudo systemctl disable --now creator-worker.service
sudo systemctl enable --now creator-worker@core.service creator-worker@media.service
```

Never run `all` alongside split roles or `core` alongside
`mail`/`orchestration`. For larger hosts replace core with orchestration + mail,
stopping core first. Check `systemctl is-active` and startup logs for every
selected role. Shared env settings load first; the ExecStart assignment
`WORKER_ROLE=%i` wins. Provider keys are not needed by the media or mail role.
`MEDIA_PROCESSING_ENABLED=false` in core cannot pause media. Set that flag in
the media service environment and restart it to pause new media deliveries.
Stopping only media leaves core and web running.

Media's cgroup covers Node and its FFmpeg children: 50% of one CPU quota, low
CPU/I/O weight, nice 10, 256 MiB memory high threshold and 320 MiB hard maximum.
Other template roles use 192/256 MiB thresholds and 128 MiB Node heap. Web gets
higher CPU weight. Tune with root-owned systemd drop-ins after measuring; never
remove FFmpeg thread bounds or the durable capacity gate. OOM/forced termination
can leave a REVIEW task and occupied capacity. Use Phase B's confirmed-stopped,
audited recovery procedure; restarting alone must not reclaim capacity.

## Deploy and rollback

Deploy records active/enabled legacy and template services, drains all of them
before switching the release symlink, and restarts that same selection. Web
health and every selected worker's active state must pass. This protects against
old worker code continuing to claim jobs while the new release is activated.
Install the new deploy wrapper before the first split deployment. The wrapper
does not install/overwrite unit configuration during normal deploy.

A release predating Phase C ignores WORKER_ROLE. Before rolling back to it, stop
and disable all template instances, then enable the legacy worker. Otherwise
several old monolithic workers would consume every queue. Automatic rollback to
a release without the packaged role template restores web but leaves split
workers stopped and logs the required topology change. Keep Phase B's additive
database tables and follow its recovery runbook for interrupted native work.

## Verification and monitoring

Structured startup/health logs include role, selected queues, RSS, event-loop
p99/max and running consumer count every 30 seconds. A running consumer count is
not an active-job count. `stalled` logs identify lost BullMQ job locks without
logging customer inputs. Use `creator-ops media-status` for durable task state.

```sh
sudo systemctl show creator-worker@media -p MemoryCurrent -p CPUUsageNSec -p NRestarts
sudo journalctl -u creator-worker@core -u creator-worker@media --since '10 minutes ago'
free -m
vmstat 1
```

Before production acceptance, enqueue a representative video export and verify
login/health, provider polls and security mail continue; record RSS, available
RAM, swap, CPU steal and loop-delay logs. Stop/restart media mid-export, confirm
core remains responsive and expired ownership requires explicit recovery. The
integration test suspends a real media process and verifies core consumes
maintenance jobs and cannot pause media's queue. Local tests cannot prove VPS
CPU entitlement, cgroup enforcement or production memory headroom.

Resource semantics:
https://www.freedesktop.org/software/systemd/man/systemd.resource-control.html
