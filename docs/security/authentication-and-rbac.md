# Authentication, organizations, and RBAC

## Scope

The first release supports email and password authentication only. OAuth, social
login, phone login, passkeys, and magic links are intentionally not configured.
Better Auth owns credentials and database sessions; Aiwa owns the organization
and authorization model.

Email verification and password-reset email delivery remain disabled until a
transactional email provider and verified sender domain are configured. The
password policy requires 12 to 128 characters.

## Signup and organization onboarding

1. A user creates an account at `/sign-up`.
2. Better Auth stores a hashed password in the credential `Account` and creates
   a seven-day database session.
3. The user names an organization at `/onboarding`.
4. One transaction creates the organization, owner membership, zero-balance
   wallet, active organization context, and audit event.
5. A unique `selfServeCreatorUserId` prevents concurrent requests from creating
   more than one self-service organization for the same account.

Users may belong to multiple organizations after an owner or platform admin adds
them. The selected organization is stored on the session, but every route still
verifies active membership and organization status against MariaDB.

## Organization roles

| Role                  | Intended access                                                                        |
| --------------------- | -------------------------------------------------------------------------------------- |
| `ORGANIZATION_OWNER`  | Full workspace, member, project, asset, generation, usage, and organization management |
| `ORGANIZATION_MEMBER` | Create and cancel generations; work with projects and assets; read members and usage   |
| `ORGANIZATION_VIEWER` | Read-only access to projects, assets, and usage                                        |

## Platform roles

| Role             | Intended access                                                              |
| ---------------- | ---------------------------------------------------------------------------- |
| `USER`           | Customer workspace only                                                      |
| `SUPPORT`        | Read users, organizations, and jobs                                          |
| `OPERATOR`       | Read organizations and models; operate generation jobs                       |
| `FINANCE_ADMIN`  | Read and confirm manual payments; grant credits; read financial audit events |
| `PLATFORM_ADMIN` | Manage users, organizations, models, and jobs; financial mutations excluded  |
| `PLATFORM_OWNER` | All platform permissions                                                     |

Authorization is enforced in server pages and API handlers. Hiding a control in
the interface is not considered authorization. Unauthorized organization reads
return not-found behavior to avoid confirming another tenant exists.

## Security controls

- Session cookies are HTTP-only and secure in production.
- Better Auth origin checks trust only `APP_URL`.
- Custom organization mutation routes independently require the exact `APP_URL`
  origin to prevent cross-site requests.
- Credential endpoints have stricter rate limits than the global API limit.
- Disabled users cannot create new sessions and are rejected when existing
  sessions are read.
- Suspended or closed organizations cannot be selected or accessed.
- Account linking is disabled while email/password is the only login method.
- Verification identifiers are stored hashed.
- Organization creation and switching are audited without storing credentials.

## Bootstrap the first platform owner

The account must sign up normally first. Run this once from the application
release directory with production environment variables loaded:

```bash
pnpm --filter @aiwa/db platform:promote-owner -- owner@example.com
```

The command looks up the exact email, assigns `PLATFORM_OWNER`, and writes an
audit event. Later platform-role changes should move behind a protected admin
workflow that requires owner permission and a fresh session.

## Deployment

Set a unique production `AUTH_SECRET` of at least 32 characters and keep
`SIGNUPS_ENABLED=true` while accepting new accounts. To pause new registration
without affecting existing sessions, set `SIGNUPS_ENABLED=false` and restart the
web service.

Apply the database migration before starting the new web image:

```bash
pnpm --filter @aiwa/db migrate:deploy
```
