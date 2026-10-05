# Cloud integration validation

Use the existing checkout. Keep credentials in environment settings; never put
them in commits, reports or test fixtures. Runtime-injected variables override
Node's `--env-file-if-exists` fallback. After saving settings, verify the
running instance receives the change before retrying an integration.

## Local services and quality checks

Use Node 24 and pnpm 11.19.0. Install with `pnpm install --frozen-lockfile`,
start MariaDB/Redis with
`docker compose -f compose.dev.yml up -d --wait mariadb redis`, then generate
Prisma, apply migrations and seed the development database. Keep each dotenv
assignment on its own line; environment-settings value fields contain only the
value, without `NAME=`.

Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck` and `pnpm build`. Stop
the development server before building: concurrent dev/build processes can write
conflicting Next.js generated types. MinIO is optional for the current
local-file asset backend.

## Integration tests and coverage

Create a separate database and grant the local test user access. Apply
migrations to that database with `pnpm --filter @aiwa/db migrate:deploy`; **do
not seed it**. Some integration fixtures require exclusive ownership of
canonical model IDs. Use an unused Redis database for every run; rate-limit
tests retain keys until expiry. Do not flush shared Redis. Keep live workers off
these test resources.

Set `TEST_DATABASE_URL` and `TEST_REDIS_URL` to those isolated services and run:

```bash
pnpm test:coverage
```

The runner disables email delivery, removes live provider bindings from its
subprocess and serializes package/file execution. It includes `src/**` and
`prisma/**` in coverage and writes per-package `coverage/coverage-summary.json`.
It preserves test failures rather than treating a generated report as success.
Packages with no tests are not validated by a zero-test result; inspect
uncovered source and testless packages separately. Coverage measures exercised
branches, not successful live provider or email delivery.

## Live providers

Set `NODE_USE_ENV_PROXY=1` when Node must use the cloud HTTPS proxy. Test the
repository adapters as well as provider connectivity. Never silently retry an
ambiguous billable submission; inspect its outcome first.

The development seed does not register and price every external text model. For
paid text workflows, synchronize the verified catalog in Admin Models, enable
the selected models and publish approved provider token rates. Preserve existing
price versions and publication idempotency. Successful adapter tests do not
validate an unregistered model or substitute for approved billing rates.

- BytePlus ModelArk uses `BYTEPLUS_API_KEY`; speech uses separate
  `BYTEPLUS_SPEECH_API_KEY` and `BYTEPLUS_SPEECH_APP_KEY`. A working speech key
  does not validate ModelArk. Check the effective region/base URL and a
  read-only API response before a billable test. The repository smoke commands
  require `BYTEPLUS_LIVE_SMOKE_ACK=I_UNDERSTAND_THIS_IS_BILLABLE` and explicit
  task authorization. Start with one image or short speech request.
- OmniHuman requires `BYTEPLUS_VISION_ACCESS_KEY_ID` and
  `BYTEPLUS_VISION_SECRET_ACCESS_KEY`; ModelArk bearer keys cannot replace them.
- NVIDIA uses `NVIDIA_API_KEY`, `NVIDIA_BASE_URL` and `NVIDIA_REASONING_MODEL`.
- Gemini's OpenAI-compatible base is
  `https://generativelanguage.googleapis.com/v1beta/openai`. A successful model
  listing is not proof that structured reasoning succeeds. Record HTTP 503 as a
  failed request rather than automatically resubmitting customer work.
- Cloudflare uses `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and
  `CLOUDFLARE_AI_BASE_URL`. Confirm model availability through account
  discovery. The default is `@cf/meta/llama-3.3-70b-instruct-fp8-fast`;
  responses may contain OpenAI choices and an already-parsed structured
  `response` field.
- Timeout variable names are `GROQ_REQUEST_TIMEOUT_MS`,
  `GEMINI_REQUEST_TIMEOUT_MS`, and `CLOUDFLARE_REQUEST_TIMEOUT_MS`.

## SMTP and application acceptance

The mail server is `aiwamail.com`, port 465, with implicit TLS. Login names must
be full email addresses. `SMTP_USER`/`SMTP_PASSWORD` select the security login;
`ROUTINE_USER`/`ROUTINE_USER_PASSWORD` select the routine login. Keep
certificate verification enabled. IMAP port 993 is for mailbox access, not
sending.

First verify TLS connectivity and both SMTP logins. An HTTPS API proxy does not
automatically provide raw SMTP connectivity; connection refusal requires a
supported network route or mail-server change before credentials can be tested.
After connectivity works, send one outbox message per sender only to an
explicitly authorized recipient and verify its database status is `SENT`. SMTP
acceptance does not prove inbox delivery; ask the recipient to check both
messages.

Start web and worker with shared settings. Require an HTTP 200 health response,
successful signup/login/session retrieval and a fresh Redis worker heartbeat.
Exercise one authorized live generation through queue, provider, asset storage
and credit settlement before claiming that workflow works end to end. Never
expose loopback preview links or include secrets, verification URLs, prompts or
customer media URLs in reports.
