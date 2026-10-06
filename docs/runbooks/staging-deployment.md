# Staging bare-metal deployment

The staging environment runs directly on Ubuntu without Docker:

- Nginx terminates TLS and proxies to `127.0.0.1:3000`.
- `creator-web.service` runs the Next.js standalone server.
- `creator-worker.service` runs the bundled BullMQ worker.
- MariaDB and Redis remain bound to localhost.
- GitHub CI builds a release archive; the deploy workflow uses native
  OpenSSH/SCP with pinned host-key verification across ED25519, ECDSA, and RSA
  keys, SHA-256 validation, and an atomic `.part` rename before invoking the
  root-owned deployment command.

## Automatic deployment and retry

The three hosted CI lanes run in parallel. A successful `main` push creates the
release artifact and starts **Deploy staging** automatically. The hosted CI
concurrency group is separate from legacy self-hosted runs, so an unavailable
old runner cannot hold new builds in its queue.

Deployment downloads that exact CI artifact; it never installs dependencies or
rebuilds the application. It verifies the archive digest and
release/control-plane metadata, uploads it, checks the remote digest before
renaming the partial upload, and invokes the existing server deployer. Uploads
have a five-minute limit; the deploy job has a thirty-minute limit including
database backup, migration, worker draining, activation and health checks. These
limits bound stalled operations; normal deployment duration depends on archive
size, server load and worker drain.

If deployment fails after CI passes, rerun the deploy workflow, or use **Run
workflow** on **Deploy staging** and supply the successful main push CI run ID.
The source run is revalidated before environment secrets are available. Its
artifact must still be within the three-day CI retention window. If CI failed or
was cancelled, rerun CI first: rerunning deployment alone cannot repair that
source result. The source verification job explains in its summary why an
automatic deployment was skipped; invalid manual requests fail explicitly.

## Release layout

```text
/var/www/creator-platform/
├── current -> releases/sha-<commit>
├── incoming/                     # deploy-user upload only; hidden from services
├── shared/                       # runtime-writable assets and durable outputs
├── .cache/ .config/ .local/state/ # runtime-writable process state
└── releases/
    └── sha-<commit>/             # root-owned; runtime-readable; never writable
        ├── apps/                 # immutable web and worker runtime
        ├── node_modules/         # Next.js standalone runtime
        ├── ops/
        │   ├── bin/              # root-promoted deployment/operations entry points
        │   ├── control-plane.sha256
        │   ├── db/               # isolated Prisma CLI and dependencies
        │   └── systemd/          # verified service definitions
        ├── RELEASE_LAYOUT        # release format version
        └── RELEASE_SHA
```

CI creates the application runtime and the operations bundle independently. The
server never runs pnpm against a release. Prisma migrations execute from
`ops/db`, so package-manager activity cannot remove or rewrite the standalone
Next.js dependencies.

Before activation, the deployment command validates the release identity, layout
version, web and worker entry points, Next.js runtime, Prisma tools, and a
SHA-256 manifest covering every artifact that may be promoted into the root
control plane. The extracted tree is recursively normalized to root ownership
with no group/other write bits before migrations run as `aiwa-creator`. A second
integrity check after migrations fails the deployment if runtime tooling changed
the release tree.

Application deployments never update the root control plane. Before migrations
or activation, the release-bundled `creator-deploy`, `creator-ops`, and systemd
files must byte-for-byte match the already installed root-owned copies, which
must themselves be root-owned and not group/other writable. A control-plane
change therefore requires a separate trusted operator installation.

Services run under `ProtectSystem=strict`; only `shared/`, `.cache/`,
`.config/`, and `.local/state/` are writable, releases are explicitly read-only,
and `incoming/` is inaccessible to application processes. The packaged
`apps/web/.next/cache` path is a root-owned symlink into
`/var/www/creator-platform/.cache/next`, preserving legitimate Next.js runtime
cache writes without making release code writable.

If a same-SHA release directory exists but fails content, checksum, ownership,
or permission checks, deployment rebuilds it from the uploaded archive and
quarantines the damaged directory. A previous release is eligible for rollback
only if it passes the same hardened checks; otherwise rollback fails closed
instead of reactivating mutable code.

## Required GitHub staging secrets

Create a GitHub environment named `staging` with:

| Secret                    | Value                                           |
| ------------------------- | ----------------------------------------------- |
| `STAGING_SSH_HOST`        | `129.151.137.222`                               |
| `STAGING_SSH_PORT`        | `22`                                            |
| `STAGING_SSH_USER`        | `creator-deploy`                                |
| `STAGING_SSH_KEY`         | Dedicated ED25519 private key                   |
| `STAGING_SSH_FINGERPRINT` | SHA256 fingerprint of a trusted server host key |

Do not use a root or general-purpose administrator SSH key. The dedicated
`creator-deploy` user receives permission to run only the validated deployment
entry point through passwordless sudo. Do not add this account to the `sudo`
group.

## First-time server bootstrap

From a temporary checkout of the repository on the server:

```bash
id creator-deploy >/dev/null 2>&1 || \
  sudo adduser --disabled-password --gecos "" creator-deploy
sudo bash infra/deploy/bootstrap-server.sh creator-deploy
```

Ensure `/etc/aiwa-creators/creator.env` explicitly contains:

```dotenv
NODE_ENV=production
APP_ENV=staging
APP_URL=https://creator.aiwamediagroup.com
SIGNUPS_ENABLED=true
```

Keep `AUTH_SECRET`, `DATABASE_URL`, and other credentials only in that
root-managed environment file.

## Upgrading a release-layout v2 server to hardened v3

The first v3 rollout has an explicit trust bootstrap. A layout-v2 deployment
tool can extract a release as the runtime user, so it must **not** be allowed to
self-upgrade from a runtime-writable release. The staging deploy workflow pins
the configured SHA-256 fingerprint against the server's advertised SSH host
keys, checks `creator-deploy --version`, verifies that the dedicated deployment
user can write `incoming/`, and refuses to upload or activate v3 until the host
reports control-plane version `3`.

From a trusted operator checkout of the exact reviewed or merged commit, install
the complete root control plane before rerunning the deploy workflow:

```bash
sudo bash infra/deploy/install-control-plane.sh
sudo /usr/local/sbin/creator-deploy --version
# expected: 3
```

The installer updates `creator-deploy`, `creator-ops`, the web/worker systemd
units, and the media-worker drop-in, then runs `systemctl daemon-reload`. It
deliberately does **not** restart application services; the next deployment
performs the controlled restart after the new release is ready.

Do not source this bootstrap from `/var/www/creator-platform/current/ops/bin` or
any existing release directory: layout-v2 releases were writable by
`aiwa-creator` and are intentionally outside the v3 trust boundary. Once the
trusted v3 deployer is installed, the next successful deployment rebuilds the
active release as root-owned/read-only, verifies the control-plane manifest,
confirms that it exactly matches the already installed root control plane, and
restarts the services under the filesystem sandbox. Because layout-v2 is
intentionally not trusted for rollback, the first v3 deployment fails closed and
stops the application if the new release cannot become healthy; schedule that
one-time upgrade accordingly.

For bare-metal local storage, keep `ASSET_STORAGE_ROOT` below
`/var/www/creator-platform/shared`. If a future deployment deliberately uses a
different local writable root, add that exact path to `ReadWritePaths=` as part
of the same reviewed infrastructure change. Remote object storage does not need
an additional local writable path.

## Media editor preflight before merging PR #60

The staging deploy job runs only after CI succeeds on `main`. Install FFmpeg and
FFprobe on the bare-metal host before merging; `creator-deploy` checks both
before it backs up or migrates the database:

```bash
sudo apt-get update
sudo apt-get install --no-install-recommends -y ffmpeg fonts-noto-core
command -v ffmpeg
command -v ffprobe
```

The provider-media grant is carried in a URL query string. Install the updated
Nginx location before publishing video-input rates, so origin access and error
logs do not record the grant:

```bash
sudo install -o root -g root -m 0644 \
  infra/nginx/creator.aiwamediagroup.com.conf \
  /etc/nginx/sites-available/creator.aiwamediagroup.com
sudo nginx -t
sudo systemctl reload nginx
```

Confirm the active site enables that configuration, and review Cloudflare or
other upstream logs for the same query string. The checked-in staging site uses
the existing Cloudflare Origin Certificate at `/etc/nginx/certs/pubkey.pem` with
private key `/etc/nginx/certs/privkey.key`; verify both files exist and that the
certificate covers `creator.aiwamediagroup.com` before reloading Nginx. Keep
Cloudflare SSL/TLS mode on **Full (strict)**. Keep both input rates unset until
the provider contract and a live reference-video settlement are verified.

## Platform operations

Grant complete platform-owner access only after the account exists:

```bash
sudo creator-ops promote-owner owner@example.com
```

The command uses the isolated tooling from the active release, performs an
idempotent role update, and writes an audit event. It does not invoke pnpm.

Run one explicitly acknowledged, billable BytePlus image smoke test using the
credentials in `/etc/aiwa-creators/creator.env`:

```bash
sudo creator-ops byteplus-smoke
```

The generated PNG is stored persistently under
`/var/www/creator-platform/shared/byteplus-smoke/` and the command never prints
the API key, prompt, or temporary provider output URL.

## TLS / Cloudflare origin certificate

Staging terminates TLS in Nginx with the existing Cloudflare Origin Certificate
already provisioned on the host:

```text
/etc/nginx/certs/pubkey.pem
/etc/nginx/certs/privkey.key
```

Do not install Certbot or switch to a Let's Encrypt certificate for this host.
Before installing or reloading a repository Nginx configuration, verify that the
certificate and private key exist, match, and cover
`creator.aiwamediagroup.com`:

```bash
sudo test -r /etc/nginx/certs/pubkey.pem
sudo test -r /etc/nginx/certs/privkey.key
sudo openssl x509 -in /etc/nginx/certs/pubkey.pem -noout -subject -issuer -dates -ext subjectAltName
sudo nginx -t
```

Cloudflare proxying should remain enabled with SSL/TLS mode set to **Full
(strict)**. The origin certificate is intended for Cloudflare-to-origin TLS; do
not expose the origin as a general public TLS endpoint or copy the private key
into the repository.

## Verification

```bash
systemctl status creator-web creator-worker --no-pager
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS https://creator.aiwamediagroup.com/api/health
release="$(readlink -f /var/www/creator-platform/current)"
printf 'active release: %s\n' "$release"
sudo -u aiwa-creator test ! -w "$release/apps/web/server.js"
sudo find "$release" -xdev \( -type f -o -type d \) \
  \( ! -user root -o -perm /022 \) -print
sudo /usr/local/sbin/creator-deploy --version
systemctl show creator-web.service -p ProtectSystem -p ReadWritePaths -p ReadOnlyPaths
journalctl -u creator-web -u creator-worker -n 100 --no-pager
```
