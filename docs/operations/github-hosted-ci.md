# GitHub-hosted CI and deployment

The public repository uses standard `ubuntu-22.04` GitHub-hosted runners for CI
and deployment. No job requires the `creators-ci` self-hosted runner. Standard
hosted-runner compute is free for public repositories; larger runners remain
paid, and normal job, concurrency and storage limits still apply.

## Quality validation

One `quality` job installs dependencies and generates Prisma once, then runs
formatting, lint, type checking, migrated-database integration tests, the
application build and worker smoke validation. MariaDB and Redis containers are
ephemeral and bind their host ports to loopback. FFmpeg, fontconfig and Noto
fonts are installed explicitly instead of relying on a manually provisioned
host.

Node processes have a 4096 MiB heap ceiling. Turbo lint, type checking and build
tasks run with concurrency two; tests retain one package and Vitest worker for
predictable database integration behavior. Next.js CI prerendering and release
compression use two workers. These limits do not change application runtime
concurrency or generation processing.

pnpm uses the normal setup-node dependency cache. APP_VERSION participates in
build cache keys, and database-backed tests always execute rather than restoring
old success results. New commits cancel obsolete CI for the same ref. Deployment
has a separate queue with cancellation disabled.

## Release promotion

Pull requests run all application quality checks and build validation. Main
pushes also package the portable release and verify its layout, embedded commit
SHA, control-plane digests, service hardening and Prisma runtime engines.

The archive and its SHA-256 digest are uploaded to the successful CI run with
three-day retention and no redundant artifact compression. Upload failure fails
CI: deployment must have a promotable release, not a green check without one.

The deployment workflow accepts only successful main-push CI runs from this
repository. It downloads the artifact from that exact run, verifies its digest
and embedded SHA, then uses the existing fingerprint-verified SSH transport and
server control plane to activate it. It never installs dependencies or rebuilds
the application. Missing or expired artifacts fail closed; rerun CI to produce a
new validated artifact.

Deployment keeps the existing staging environment and STAGING_SSH_* secrets. The
SSH endpoint must be reachable from GitHub-hosted runners. An allowlist that
only admits the old self-hosted runner's address will block transport.

All jobs use standard hosted runners. Switching the repository back to private
would restore the plan's private-repository minute allowance.

## Required check

The required check is `quality`. If branch protection elsewhere requires the old
`static`, `test` or `build-release` names, update it to `quality`; those checks
are now steps within the single job.
