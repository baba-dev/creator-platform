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
├── releases/
└── shared/
    └── pnpm-store/
```

The deployment command validates the archive and commit SHA, installs only the
Prisma migration tooling, creates a database backup, applies migrations,
atomically changes `current`, restarts both services, and checks `/api/health`.
If the health check fails, it restores the previous application symlink.
Database migrations are not automatically reversed.

## Required GitHub staging secrets

Create a GitHub environment named `staging` with:

| Secret                    | Value                                             |
| ------------------------- | ------------------------------------------------- |
| `STAGING_SSH_HOST`        | `129.151.137.222`                                 |
| `STAGING_SSH_PORT`        | `22`                                              |
| `STAGING_SSH_USER`        | `ubuntu`                                          |
| `STAGING_SSH_KEY`         | Dedicated ED25519 private key                     |
| `STAGING_SSH_FINGERPRINT` | SHA256 fingerprint of the server ED25519 host key |

Do not use a root SSH key. The `ubuntu` user receives permission to run only the
validated deployment entry point through passwordless sudo.

## First-time server bootstrap

From a temporary checkout of the repository on the server:

```bash
sudo bash infra/deploy/bootstrap-server.sh ubuntu
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

## TLS activation

Point the Cloudflare DNS record to `129.151.137.222` and temporarily use
DNS-only mode. After the first release is healthy:

```bash
sudo apt-get update
sudo apt-get install -y certbot
sudo certbot certonly \
  --webroot \
  --webroot-path /var/www/letsencrypt \
  --domain creator.aiwamediagroup.com

sudo install -o root -g root -m 0644 \
  infra/nginx/creator.aiwamediagroup.com.conf \
  /etc/nginx/sites-available/creator.aiwamediagroup.com
sudo nginx -t
sudo systemctl reload nginx
```

After HTTPS succeeds, Cloudflare proxying may be re-enabled with SSL/TLS mode
set to **Full (strict)**.

## Verification

```bash
systemctl status creator-web creator-worker --no-pager
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS https://creator.aiwamediagroup.com/api/health
readlink -f /var/www/creator-platform/current
journalctl -u creator-web -u creator-worker -n 100 --no-pager
```
