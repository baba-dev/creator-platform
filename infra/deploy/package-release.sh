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

cleanup() {
  rm -rf -- "$staging_root"
}
trap cleanup EXIT

cd "$repository_root"

test -f apps/web/.next/standalone/apps/web/server.js
test -d apps/web/.next/static
test -f apps/worker/dist/index.js
test -f packages/db/prisma/schema.prisma
test -d packages/db/prisma/migrations

mkdir -p \
  "$release_root/apps/web/.next" \
  "$release_root/apps/worker" \
  "$release_root/packages/db"

cp -a apps/web/.next/standalone/. "$release_root/"
cp -a apps/web/.next/static "$release_root/apps/web/.next/static"

if [[ -d apps/web/public ]]; then
  cp -a apps/web/public "$release_root/apps/web/public"
fi

cp -a apps/worker/dist "$release_root/apps/worker/dist"
cp -a packages/db/prisma "$release_root/packages/db/prisma"
cp packages/db/package.json "$release_root/packages/db/package.json"
cp package.json pnpm-lock.yaml pnpm-workspace.yaml "$release_root/"

printf '%s\n' "$release_sha" >"$release_root/RELEASE_SHA"
printf 'APP_VERSION=%s\n' "$release_sha" >"$release_root/release.env"

tar -C "$release_root" -czf "$archive_path" .
tar -tzf "$archive_path" >/dev/null

echo "Created $(basename "$archive_path")"
