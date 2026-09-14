# Staging deployment runbook

Target: `creator.aiwamediagroup.com` on a small Linux VPS.

## Host prerequisites

- Docker Engine with Compose
- Nginx and Certbot on the host
- A dedicated deployment user
- DNS pointing to the VPS
- GHCR pull access for this private repository
- Encrypted off-host MariaDB backups

## Deployment

1. Create `/opt/aiwa-creators` and place `compose.production.yml` plus a
   root-owned, mode `0600` `.env` there.
2. Set `APP_VERSION` to an immutable `sha-<full commit SHA>` image tag.
3. Pull and start the services with Docker Compose.
4. Apply reviewed Prisma migrations from a one-off release container.
5. Verify `/api/health`, worker logs, MariaDB, Redis, and object-storage access.
6. Install the supplied Nginx server block and issue the TLS certificate.
7. Run a non-billable smoke test before enabling any BytePlus model.

## Rollback

Set `APP_VERSION` to the previously verified commit tag and recreate web and
worker. Database migrations require a written forward-fix or a separately tested
rollback plan; never improvise destructive schema rollback on staging data.
