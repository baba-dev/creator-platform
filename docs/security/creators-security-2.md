# Creators Security 2.0 — Cloudflare-first operations

Status: code-only rollout, **do not activate edge enforcement before
prerequisites**. This branch is stacked on Authentication & Connections 2.0 (PR
#190). PWA 2.0 (PR #191) remains an independent merge/compatibility gate. No
Cloudflare or firewall change is made by merging these files.

## Security boundary and release configuration

Traffic: Cloudflare proxy / WAF -> restricted origin ingress -> Nginx -> Better
Auth / Redis admission -> existing transactional quote, wallet and generation
job checks. Never treat CAPTCHA, an IP address, or a Cloudflare header as
permission to spend credits.

- TURNSTILE_MODE=off is the rollout default; enforce requires both
  TURNSTILE_SITE_KEY (passed only from a server page) and TURNSTILE_SECRET_KEY
  (server-side only). Configure a Managed Turnstile widget restricted to the
  exact APP_URL hostname.
- The Better Auth **before** hook verifies the x-turnstile-token header at
  /sign-up/email and /request-password-reset. It checks Siteverify success,
  hostname and exact action signup/password_reset. Missing, expired, replayed,
  mistargeted or non-verifiable tokens fail closed. No tokens or secrets are
  logged.
- OAuth / passkey flows are intentionally not intercepted by these challenges.
  Existing auth-specific rate limits, explicit account linking and
  privileged-session restrictions in PR #190 remain authoritative.
- CSP script-src and frame-src explicitly allow challenges.cloudflare.com. Avoid
  blanket WAF challenges for /api, auth callbacks, installed PWA fetches or
  provider media grants.
- Generation admission uses an atomic user sliding-window budget (10/min) and an
  authenticated-organization budget (30/min) before creating media jobs. Both
  fail closed when Redis is unavailable; create*Job still enforces its
  authoritative quote, organization permissions, idempotency and credit
  reservation.
- Rate-limits are _not_ economic quotas: preserve the existing transactional
  wallet, member budgets and worker concurrency controls. Future additional
  non-Studio execution endpoints must join a unified reservation policy before
  calling external providers.

## Phased rollout (operator-controlled)

1. Merge prerequisite Auth #190; reconcile the PWA #191 .env and regression
   cases. Rebase security PR on final integration SHA; run all four CI lanes
   plus quality on the final SHA.
2. Provision a Turnstile Managed widget for the exact production hostname. Stage
   separate widget keys. Test with Cloudflare test keys in non-production only.
   Set server env keys before switching mode to enforce, and restart web safely.
   Never commit keys, expose secrets in NEXT_PUBLIC_ values, or use permissive
   test keys on production.
3. Cloudflare: scope all rules to http.host eq "creator.aiwamediagroup.com";
   enable managed WAF and Full (strict) TLS. Review Security Events for false
   positives before enforcement. Proposed WAF custom rules, in priority order
   (adapt to account plan/available expressions):
   - Block known irrelevant probes under this hostname, e.g. paths beginning
     /wp-admin/, /wp-login.php, /.git/, /.env and /vendor/phpunit/. Do not block
     legitimate app routes or CDN resources.
   - Managed Challenge for _HTML admin page_ access that appears suspicious; do
     not challenge /api/admin/* fetches as a blanket rule.
   - Block validated abusive IP/ASN indicators from reviewed security events;
     use expiry and removal process.
   - Block demonstrated invalid-method or scanner patterns, not arbitrary
     POST/GET combinations.
   - Reserve an emergency rule slot, disabled in steady state.
   - Apply available Cloudflare edge rate-limiting capability to selected
     **unauthenticated auth POST endpoints** with thresholds determined from
     traffic; the Redis/Better Auth controls provide finer-grained protection.
   - Avoid default Bot Fight Mode for the PWA/API until verified safe, and
     reserve Under Attack Mode for genuine incidents. Never cache /api/_,
     /app/_, /admin/*, auth, signed media or personalized HTML.
4. Lock down origin ingress. Before firewall changes, inventory every hostname,
   SSH management IP, deployment runner, monitoring probe and alternate service
   on the same machine. Permit 443 from up-to-date Cloudflare source ranges
   only; leave deployment/SSH access through a verified independent management
   path. Do not run an SSH lockout-prone firewall command over the only active
   session. Prefer authenticated origin pulls and validate certificates; keep
   Full (strict).
5. Confirm that only _trusted Cloudflare source addresses_ may supply
   CF-Connecting-IP. The Nginx repository file sets those trust ranges and
   normalizes all upstream forwarded client IP values. Validate the running
   include context and update Cloudflare address ranges as they evolve. Verify
   direct origin requests cannot circumvent WAF (from an unrelated IP/host)
   after ingress lockdown. Cloudflare edge settings and live firewall state
   cannot be inferred from GitHub.
6. Use existing lightweight SSH host controls (key-only access, restricted SSH,
   optional Fail2ban). Defer CrowdSec: a local firewall bouncer must never ban
   Cloudflare proxy IPs on the basis of application log entries. Add CrowdSec
   only with reviewed edge remediation and resource headroom.

## Acceptance and negative tests

- Existing signup and delayed verification-email UX, resend, reset, OAuth and
  passkey sign-in, account linking and MFA still work.
- Invalid / missing / expired / replayed Turnstile tokens are rejected by the
  actual HTTP endpoint, not merely in the widget. Hostname/action mismatch and
  Siteverify timeout/5xx fail closed. Recovery retains generic
  account-enumeration-resistant responses where applicable.
- Redis unavailable: generation fails with 503 and no provider submission,
  rather than falling back to independent per-process budgets. Under normal
  conditions, verify per-user and organization rate limits and Retry-After.
- Test PWA install, cold/warm startup, offline fallback, refresh,
  background-sync paths, push subscription flows and websocket/event/polling
  clients against any proposed edge rule.
- Test trusted client IP, direct-origin bypass, non-Cloudflare spoofed headers,
  upload caps, provider-media grant GET/HEAD, and origin TLS.
- Test Nginx changes on staging with nginx -t before reload; retain previous
  config and firewall rollback path. The deployed config is not assumed to match
  repository until compared.
- **All CI lanes** (static, test, build-release, browser-smoke and quality) pass
  on the final rebased SHA; post-deploy /api/health and actual user journeys
  pass. Never merge a dependency-stacked PR into main before dependency
  resolution.

## Observability and incident response

Use Cloudflare Security Analytics/WAF event logs together with low-cardinality
application metrics for denied requests, verification failures, 429/503s and
job-cost anomalies. Do not record CAPTCHA tokens, raw credentials, OAuth codes,
signed asset URLs, mail reset links or API secrets. Restrict sensitive event
visibility by platform role; retention and redaction policy must be documented
before adding persistent Security Centre telemetry. Emergency edge rule changes
require a timestamp, reason, reviewer and rollback, not an indefinite blanket
IP/country block.

## Rollback

- For user-facing widget malfunction: revert TURNSTILE_MODE to off **as an
  explicitly logged emergency mitigation**, investigate/restore keys and
  challenge availability, and retain independent authentication rate limits.
  Turning off verification temporarily reduces signup protection.
- Roll back WAF rules individually; do not disable the whole Cloudflare proxy.
- For origin firewall: restore the verified management-access policy from
  out-of-band access; do not open DB/Redis/worker ports to the Internet.
- For app deployment: use immutable release rollback and verify migration
  compatibility; these security files introduce no database migration.
