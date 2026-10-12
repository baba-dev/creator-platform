# Authenticator enrollment and recovery

The Better Auth TOTP issuer remains `Aiwa Creators`. The returned
`otpauth://totp/` URI is a provisioning payload, **not** the manual key and not
a normal HTTPS link.

- Every verified user enrolls their own account at `/settings/security` (also
  available from Settings → Login & Security). Unenrolled privileged accounts
  can continue through the existing `/admin/mfa-setup` admission exception.
- Enter your current Creators password, scan the locally generated QR with
  **Google Authenticator → + → Scan a QR code**, or **Microsoft Authenticator
  → + → Other account → Scan QR code**. Both support standard TOTP; neither
  integration needs a Google/Microsoft API key or cloud credential.
- On one-phone setup, the generic `otpauth:` link may work when the OS/browser
  has an app handler; it cannot guarantee a named app opens. Use manual setup if
  app-link handoff fails. Manual key, account, issuer, digits, time period and
  algorithm are derived from the same validated payload used in the QR.
- Save recovery codes somewhere private before verifying a new six-digit code.
  Confirming that code activates the factor. Codes and provisioning data are
  only held in ephemeral component state and are cleared after success. QR
  construction is entirely client side, never via a third-party image service.
- Existing factors cannot be re-exposed. Enrolled users can replace a disclosed
  authenticator (password required for credential accounts), immediately
  disabling the old TOTP seed and old recovery codes before reenrollment.
  Enrolled users can regenerate one-time recovery codes after password
  verification. Old recovery codes become invalid. Security notification
  delivery is best effort **after** rotation and cannot return a false failure
  if the notification outbox is down.
- Never use platform-admin access to send a user's TOTP seed, QR screenshot,
  provisioning URL or recovery codes through WhatsApp/email/chat. Invite users
  to enroll their own factors after independently verifying their email
  identity.
- If any provisioning URI was publicly pasted or sent to another person, treat
  the embedded seed as compromised. Complete a supported
  factor-reset/re-enrollment procedure using independently verified account
  ownership. Revoking sessions alone does **not** invalidate an exposed TOTP
  seed. Do not add secrets to issues, PRs, logs or support tickets.

## Manual and regression checks

1. Verify admin enrollment remains reachable prior to MFA, while other admin
   APIs stay denied; verify ordinary users reach `/settings/security` without a
   platform role.
2. Scan QR on Google Authenticator (iOS/Android) and Microsoft Authenticator
   using **Other account**. Confirm exact account/issuer and six-digit,
   30-second TOTP. Test generic app-link and fallback manual entry separately.
3. Verify an invalid/expired TOTP never enables the factor. Check phone
   automatic time, input limit, rate limiting, and signing in after enrolling.
   Test recovery code entry as a distinct choice from six-digit TOTP.
4. Ensure screenshot/third-party network QR services are absent. Check the TOTP
   enable and recovery-code responses are `Cache-Control: private, no-store` and
   do not log any secret.
5. Regenerate codes after fresh password confirmation: previous codes must fail;
   new codes work once; retry under mail outage must not falsely claim a failed
   rotation.
6. Validate keyboard interaction, accessible QR title, mobile layout,
   cancellation, session expiry, and stale/invalid provisioning payload
   handling.
7. Check that replacing an exposed authenticator invalidates the old seed and
   recovery codes and makes admin access require new enrollment;
   social/passkey-only accounts must not be blocked by a nonexistent local
   password.
8. Run the full static/test/build-release/browser-smoke/quality CI lanes on the
   final PR head; merge and deploy only when all pass. Production app
   compatibility requires real-device smoke tests.
