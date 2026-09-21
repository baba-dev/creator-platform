#!/usr/bin/env bash
set -Eeuo pipefail

release_sha="${1:-}"

if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: $0 <40-character-git-sha>" >&2
  exit 64
fi

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
archive_path="$repository_root/creator-platform-${release_sha}.tar.gz"
staging_root="$(mktemp -d)"
release_root="$staging_root/release"
operations_root="$release_root/ops/db"

cleanup() {
  rm -rf -- "$staging_root"
}
trap cleanup EXIT

cd "$repository_root"

test -f apps/web/.next/standalone/apps/web/server.js
test -d apps/web/.next/static
test -f apps/worker/dist/index.cjs
test -f apps/worker/dist/byteplus-smoke.cjs
test -f packages/db/prisma/schema.prisma
test -d packages/db/prisma/migrations
test -f packages/db/prisma/promote-owner.ts
test -f infra/deploy/creator-deploy
test -f infra/deploy/creator-ops

mkdir -p \
  "$release_root/apps/web/.next" \
  "$release_root/apps/worker" \
  "$release_root/ops/bin"

# The application runtime is copied exactly as produced by Next.js standalone.
# Nothing on the server may run a package manager against this tree.
cp -a apps/web/.next/standalone/. "$release_root/"
cp -a apps/web/.next/static "$release_root/apps/web/.next/static"

if [[ -d apps/web/public ]]; then
  cp -a apps/web/public "$release_root/apps/web/public"
fi

cp -a apps/worker/dist "$release_root/apps/worker/dist"
test -f "$release_root/apps/worker/dist/byteplus-smoke.cjs"

# Build a portable Prisma/operations package in CI. It has its own node_modules
# and can be executed on the server without pnpm touching the web runtime.
pnpm --filter @aiwa/db deploy --legacy "$operations_root"

cp infra/deploy/creator-deploy "$release_root/ops/bin/creator-deploy"
cp infra/deploy/creator-ops "$release_root/ops/bin/creator-ops"
chmod 0755 \
  "$release_root/ops/bin/creator-deploy" \
  "$release_root/ops/bin/creator-ops"

test -x "$operations_root/node_modules/.bin/prisma"
test -x "$operations_root/node_modules/.bin/tsx"
test -f "$operations_root/prisma/schema.prisma"
test -d "$operations_root/prisma/migrations"
test -f "$operations_root/prisma/promote-owner.ts"

next_runtime="$(
  find "$release_root" \
    -path '*/node_modules/next/package.json' \
    -print -quit 2>/dev/null
)"
test -n "$next_runtime"

printf '%s\n' "$release_sha" >"$release_root/RELEASE_SHA"
printf '2\n' >"$release_root/RELEASE_LAYOUT"
printf 'APP_VERSION=%s\n' "$release_sha" >"$release_root/release.env"

tar -C "$release_root" -czf "$archive_path" .
tar -tzf "$archive_path" >/dev/null

echo "Created $(basename "$archive_path") with isolated operations tooling"
