# CI on a small self-hosted runner

CI and deployment use the same `creators-ci` Linux x64 host. GitHub-hosted
minutes and Actions artifact storage are not needed for the default path.

## Resource budget

One quality job runs format, lint, type checking, migrated-database integration
tests, build and worker smoke validation sequentially. Install and Prisma client
generation run once. Turbo tasks, Vitest workers, Rust build threads, Node's
libuv pool and gzip compression are limited to one worker. Next.js CI builds
use one prerender worker; this does not change production runtime settings.

The Node heap ceiling is 1536 MiB because the old automatic approximately
512 MiB ceiling exhausted both ESLint and TypeScript. This is a per-process
ceiling, not a total-memory guarantee. A 1 GiB runner needs swap and may remain
slow; inspect `free -h`, `df -h` and any service/cgroup memory limit before use.
Do not run multiple runner services on this weak host. The quality job has a
180-minute bound rather than racing three independently installed lanes.

MariaDB and Redis test ports bind to loopback. Both containers are ephemeral;
production databases must never share these ports on the runner.

## Local reuse

pnpm retains its normal local store and installs with `--prefer-offline`.
Turbo uses a directory in `RUNNER_TOOL_CACHE` outside checkout cleanup,
separated between pull-request and push events. Static checks can reuse unchanged
results across commits. Release builds still include APP_VERSION in their cache
key, and tests always execute against the fresh migrated database.

## Release promotion

Pull requests run every quality check and the application build but skip portable
release packaging. A successful main push packages and validates the release,
then publishes its archive and SHA-256 digest under:

```text
$RUNNER_TOOL_CACHE/creator-platform-releases/<CI-run-id>/
```

Publication requires a main push with matching run ID and commit SHA. The local
store retains the newest three releases. Deployment validates the triggering run
ID, commit SHA, digest and existing release structure checks before SSH transfer.
It never installs dependencies or rebuilds the application. Missing or corrupt
local releases fail deployment; recover by rerunning CI for the desired revision.

Keep CI and deployment on the same single runner host. Adding multiple hosts
with the same label can schedule deployment on a host without the release.
For optional cross-host artifact promotion, set repository variable
`CI_UPLOAD_RELEASE_ARTIFACTS=true`. Uploads use no extra compression and remain
optional; a failed download falls back to the local validated release.

CI and deployment share a repository concurrency group with cancellation disabled
so a running activation is never interrupted. GitHub retains one pending workflow
per group: newer queued work can replace older pending work, so intermediate
commits may be superseded. If every revision must deploy, use a stronger dedicated
deployment host and a separate deployment queue.

The new required check is `quality`. If branch protection elsewhere requires the
old `static`, `test` or `build-release` check names, update it to `quality`;
the same checks now run as steps in that single job.
