# Transactional email operations

Aiwa Creators uses a durable MariaDB outbox plus the BullMQ worker for all
outbound email.

## Sender identities

- `security@aiwamediagroup.com`: verification, password and MFA events, billing,
  invitations, and team membership.
- `creator-tool@aiwamediagroup.com`: routine generation, report, and activity
  notifications.

Security mail is mandatory. Routine categories can be disabled by users at
`/settings/notifications`.

## Production SMTP configuration

Use implicit TLS SMTP on port 465. Certificate verification remains enabled.

```dotenv
MAIL_ENABLED=true
SMTP_HOST=mail.example.com
SMTP_PORT=465
SMTP_USER=
SMTP_PASSWORD=
SMTP_EHLO_NAME=creator.aiwamediagroup.com
SMTP_POOL_MAX_CONNECTIONS=3
SMTP_POOL_MAX_MESSAGES=100
SMTP_CONNECTION_TIMEOUT_MS=10000
SMTP_GREETING_TIMEOUT_MS=10000
SMTP_SOCKET_TIMEOUT_MS=30000
MAIL_SECURITY_FROM_ADDRESS=security@aiwamediagroup.com
MAIL_ROUTINE_FROM_ADDRESS=creator-tool@aiwamediagroup.com
```

When `APP_ENV=production` and `MAIL_ENABLED=true`, startup fails closed unless
the SMTP host, username, password, both sender addresses, and port 465 are
explicitly configured. This prevents a deployment from silently accepting
security mail into an undeliverable queue.

Apply database migrations before restarting services:

```bash
pnpm --filter @aiwa/db migrate:deploy
sudo systemctl restart creator-web.service creator-worker.service
```

## Reliability model

Business operations persist an outbox row before delivery. Redis is only the
dispatcher, so Redis or SMTP downtime does not lose queued mail. Temporary
delivery failures retry with bounded backoff. A worker interruption that leaves
a message in `SENDING` is recovered after ten minutes and retried using the same
RFC Message-ID, reducing duplicate-delivery risk. Permanent SMTP failures remain
visible in the admin Email delivery page.

Security-message bodies are redacted after successful delivery. Failed security
messages are not generically replayable because reset or invitation tokens may
have expired; regenerate them from the original workflow instead. Failed routine
messages can be explicitly requeued by an authorized operator.

## Operational checks

- `/api/health` exposes whether SMTP credentials and both sender identities are
  configured.
- `/admin/email` shows queue state, delivery counts, masked recipients,
  attempts, and sanitized failure diagnostics.
- **Verify SMTP** on `/admin/email` performs a live TLS/authentication handshake
  without sending mail. The result is audited and only a sanitized failure code
  is returned to the browser.
- SMTP credentials, reset links, verification links, and MFA secrets must never
  be logged.
- Use the admin SMTP verification control after every credential or mail-server
  change.
- SPF, DKIM, and DMARC should be configured for the sending domain before
  production launch.
