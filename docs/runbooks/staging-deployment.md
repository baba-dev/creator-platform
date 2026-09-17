# Staging bare-metal deployment

The staging environment runs directly on Ubuntu without Docker:

- Nginx terminates TLS and proxies to `127.0.0.1:3000`.
- `creator-web.service` runs the Next.js standalone server.
- `creator-worker.service` runs the bundled BullMQ worker.
- MariaDB and Redis remain bound to localhost.
- GitHub CI builds a release archive; Appleboy SCP uploads it; Appleboy SSH
  invokes the root-owned deployment command.

## Release layout

```text
/var/www/creator-platform/
├── current -> releases/sha-<commit>
├── incoming/
└── releases/
    └── sha-<commit>/
        ├── apps/                 # immutable web and worker runtime
        ├── node_modules/         # Next.js standalone runtime
        ├── ops/
        │   ├── bin/              # deployment and operations entry points
        │   └── db/               # isolated Prisma CLI and dependencies
        ├── RELEASE_LAYOUT        # release format version
        └── RELEASE_SHA
```

CI creates the application runtime and the operations bundle independently.
The server never runs pnpm against a release. Prisma migrations execute from
`ops/db`, so package-manager activity cannot remove or rewrite the standalone
Next.js dependencies.

Before activation, the deployment command validates the release identity,
layout version, web and worker entry points, Next.js runtime, Prisma tools, and
operations scripts. It then creates a database backup, applies migrations,
atomically changes `current`, restarts both services, and checks `/api/health`.
If the health check fails, it restores the previous valid runtime.

If a same-SHA release directory exists but fails integrity checks, deployment
rebuilds it from the uploaded archive and quarantines the damaged directory.
It never restarts a known-damaged extracted release.

## Required GitHub staging secrets

Create a GitHub environment named `staging` with:

| Secret                    | Value                              |
| ------------------------- | ---------------------------------- |
| `STAGING_SSH_HOST`        | Staging server address             |
| `STAGING_SSH_PORT`        | `22` or the configured SSH port    |
| `STAGING_SSH_USER`        | `creator-deploy`                   |
| `STAGING_SSH_KEY`         | Dedicated ED25519 private key      |
| `STAGING_SSH_FINGERPRINT` | SHA256 server host-key fingerprint |

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

## Upgrading a release-layout v1 server

Release layout v2 removes server-side pnpm installation. Before merging the
first layout-v2 release, install the reviewed deployment entry point from its
checkout:

```bash
sudo install -o root -g root -m 0755 \
  infra/deploy/creator-deploy \
  /usr/local/sbin/creator-deploy
```

After the first successful layout-v2 deployment, each healthy release updates
the root-owned deployment and operations entry points for subsequent runs.

## Platform operations

Grant complete platform-owner access only after the account exists:

```bash
sudo creator-ops promote-owner owner@example.com
```

The command uses the isolated tooling from the active release, performs an
idempotent role update, and writes an audit event. It does not invoke pnpm.

## Verification

```bash
systemctl status creator-web creator-worker --no-pager
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS https://creator.aiwamediagroup.com/api/health
readlink -f /var/www/creator-platform/current
journalctl -u creator-web -u creator-worker -n 100 --no-pager
```
