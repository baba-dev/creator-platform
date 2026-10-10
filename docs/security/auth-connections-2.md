# Authentication & Connections 2.0

## Architecture

The application uses Better Auth 1.7.4 and @better-auth/passkey 1.7.4 with the
existing Prisma/MySQL adapter. Social sign-in accounts are **personal identity**
credentials; Google Drive and OneDrive remain separate, explicitly consented
**organization storage** connections with separately encrypted tokens.

- Email/password registration completes after database persistence; SMTP
  delivery is worker-owned and never awaited during signup.
- Verification enqueue errors do not turn an already-created account into a
  false signup failure; the user can request a new verification link, with rate
  limiting.
- The normal request-session guard still rejects unverified email accounts. Do
  not grant generation, storage, credits, invitation or administrator access
  merely because registration succeeded.
- `SIGNUPS_ENABLED=false` blocks new Google/Microsoft OAuth registrations as
  well as email signup, while permitting existing linked identities to sign in.
- Explicit social linking is enabled; implicit same-email linking is disabled.
  Link from an existing authenticated session using the Connections & Storage
  page.
- Privileged roles are denied OAuth and passkey-created sessions until a
  verified, method-independent second-factor challenge is implemented. The
  email/password plus TOTP path is retained.
- Passkeys use WebAuthn with required user verification; the operating system
  chooses PIN, biometrics or security key. The server stores public credentials,
  not device PINs.
- Account unlinking must not delete the user's last usable login method.
  Additional passkey removal guards are in the UI, and Better Auth guards
  against unlinking every Account.
- Storage callback handlers must revalidate active organization membership and
  management permission inside the credential-persistence transaction.

## Production environment variables

Configure in the protected server environment (not in Git, not NEXT_PUBLIC):

```dotenv
GOOGLE_AUTH_CLIENT_ID=
GOOGLE_AUTH_CLIENT_SECRET=
MICROSOFT_AUTH_CLIENT_ID=
MICROSOFT_AUTH_CLIENT_SECRET=
MICROSOFT_AUTH_TENANT_ID=common
```

Register sign-in redirect URLs:

- `https://creator.aiwamediagroup.com/api/auth/callback/google`
- `https://creator.aiwamediagroup.com/api/auth/callback/microsoft`

Keep the existing storage redirect URLs separate:

- `https://creator.aiwamediagroup.com/api/storage/oauth/google/callback`
- `https://creator.aiwamediagroup.com/api/storage/oauth/onedrive/callback`

Microsoft registration must permit the chosen tenant/account audience and
provide the required claim mapping. An Entra user's unverified/mutable email is
**not** an authorization anchor; provider-owned identity is used. Protect and
rotate actual client secrets.

## Release checklist

1. Apply the passkey migration before starting any web replica with the plugin
   enabled.
2. Validate the production origin and TLS configuration; WebAuthn RP ID must
   match the actual domain.
3. Confirm the provider callback URLs on the Google Cloud and Microsoft Entra
   applications.
4. Test email verification with slow SMTP, Redis outage, enqueue failure,
   expired link, and resend.
5. Test existing user linking without duplicating users, wallets, organizations
   or assets.
6. Exercise real Windows Hello and Android passkey enrollment/login/revocation
   in supported browsers.
7. Confirm administrator social/passkey paths fail closed, while email + TOTP
   login still works.
8. Confirm Drive and OneDrive only request storage consent on their separate
   connection flows.
9. Require static, test, build-release, browser-smoke and quality CI success on
   the final SHA.
10. Verify the main-branch deployment workflow reports a successful release and
    health checks.
