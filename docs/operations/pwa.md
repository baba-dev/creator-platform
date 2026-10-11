# Creators PWA 2.0

## Scope and safety

The installable app uses one service worker at `/sw.js`. Immutable Next.js
assets are cache-first and bounded. The offline shell, guide and existing brand
icons are precached. Dynamic Learn routes are network-first and never copied
into the shared cache. The optional periodic refresh touches only the
credential-free bundled guide. Authenticated HTML, RSC, APIs, wallets, provider
media and billable requests are never cached by the service worker.

The offline scratchpad is text-only, opt-in, passphrase-derived AES-GCM
encryption in device IndexedDB. The passphrase is not persisted and has no
recovery mechanism. A draft is never auto-submitted. The device share inbox
expires entries after fifteen minutes, purging expired records on subsequent
share/inbox activity. Users explicitly select a workspace before a normal
authenticated upload. Browser support for manifest share/file handling varies.

## Production activation

- Apply Prisma migrations before starting the web and worker services.
- Set the **same** `PWA_VAPID_PRIVATE_KEY` and `PWA_VAPID_SUBJECT` on the web
  and worker instances. Generate a securely backed-up P-256 VAPID secret; do not
  commit it or expose it in a `NEXT_PUBLIC_` value. The corresponding public key
  is derived server-side.
- A private key can be generated locally with Node:
  `node -e "const e=require('node:crypto').createECDH('prime256v1');e.generateKeys();console.log(e.getPrivateKey().toString('base64url'))"`
- A changed VAPID key invalidates existing push subscriptions; users must
  re-enable push for each device.
- Configure Cloudflare to bypass edge caching for `/sw.js`; verify the
  `no-store` and `Service-Worker-Allowed: /` response headers. Do not introduce
  broad HTML or API cache rules.
- Only consented devices receive generic terminal media-job notifications. The
  existing worker polls a bounded, deduplicated delivery outbox and suppresses
  messages when user or organization access is revoked.
- Public periodic refresh is optional and browser-controlled. Draft Background
  Sync is a client notification only, never an implicit write or paid request.

## Verification

Run the normal static/test/build-release/browser-smoke/quality gates. The
browser suite tests offline fallback, encrypted draft recovery, cache isolation
and manifest launch paths in mobile and desktop Chromium. Capture real
responsive public UI screenshots from the browser-smoke artifact before
committing any manifest screenshots. Do not claim a PWABuilder 46/46 or
cross-device native support until the actual deployed installation has been
assessed.

## Activation and external report-card checks

The standalone /pwa-register.js is a same-origin, deferred early registration
entrypoint independent of React hydration. In browser DevTools verify an
**activated** worker with scope /; verify upgrades with a pre-existing
old-version cache (the v2-6 build contained a stale PUBLIC cache identifier
which broke upgrades). If installation fails, inspect failed requests for
/offline.html, /offline-drafts.js, /offline-guide.html and the registration
console error. Optional icon/manifest caching must not block installation.

Run external PWABuilder only after confirming the deployed commit, a real
browser activation and public 200 responses for the manifest, worker, images and
screenshots. The PWABuilder report card is dynamic and is not itself a
substitute for an independent browser check. If Cloudflare blocks its crawler,
review WAF challenge logs for the exact public resources. Allow GET/HEAD to the
narrow static paths without disabling application/API security or broad
user-agent exemptions. Verify MIME types and that requests never return a
challenge HTML page. Do not claim a passing numerical score before externally
confirming it.
