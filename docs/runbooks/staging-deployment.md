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
2. Set `APP_URL=https://creator.aiwamediagroup.com`, generate a unique
   `AUTH_SECRET` of at least 32 characters, and explicitly set
   `SIGNUPS_ENABLED=true` or `false`.
3. Set `APP_VERSION` to an immutable `sha-<full commit SHA>` image tag.
4. Pull the images and apply reviewed Prisma migrations from a one-off release
   container before starting the new web service.
5. Start the services with Docker Compose.
6. Verify `/api/health`, worker logs, MariaDB, Redis, and object-storage access.
7. Install the supplied Nginx server block and issue the TLS certificate.
8. Create the first account through `/sign-up`, then grant it platform-owner
   access with the documented `platform:promote-owner` command.
9. Test signup, sign-in, organization onboarding, sign-out, and rejected
   cross-organization access.
10. Run a non-billable smoke test before enabling any BytePlus model.

## Rollback

Set `APP_VERSION` to the previously verified commit tag and recreate web and
worker. Database migrations require a written forward-fix or a separately tested
rollback plan; never improvise destructive schema rollback on staging data.
