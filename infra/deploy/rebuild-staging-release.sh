#!/usr/bin/env bash
set -Eeuo pipefail

release_sha="${1:-}"
output_dir="${2:-dist}"

if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "usage: $0 <40-char-release-sha> [output-dir]" >&2
  exit 64
fi

actual_sha="$(git rev-parse HEAD)"
if [[ "$actual_sha" != "$release_sha" ]]; then
  echo "checked out SHA $actual_sha does not match requested release $release_sha" >&2
  exit 1
fi

pnpm install --frozen-lockfile --prefer-offline
pnpm db:generate
pnpm build
bash infra/deploy/package-release.sh "$release_sha"

archive="creator-platform-${release_sha}.tar.gz"
test -f "$archive"
tar -tzf "$archive" >/dev/null

validation_dir="$(mktemp -d)"
trap 'rm -rf "$validation_dir"' EXIT
if command -v pigz >/dev/null 2>&1; then
  tar -I pigz -xf "$archive" -C "$validation_dir"
else
  tar -xzf "$archive" -C "$validation_dir"
fi

test "$(cat "$validation_dir/RELEASE_LAYOUT")" = "3"
(
  cd "$validation_dir"
  sha256sum --check --strict ops/control-plane.sha256
)
grep -qx 'ProtectSystem=strict' "$validation_dir/ops/systemd/creator-web.service"
grep -qx 'ProtectSystem=strict' "$validation_dir/ops/systemd/creator-worker.service"
grep -qx 'ProtectSystem=strict' "$validation_dir/ops/systemd/creator-worker@.service"
test -n "$(find "$validation_dir/ops/db/node_modules" -path '*/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node' -print -quit)"
test -n "$(find "$validation_dir/ops/db/node_modules" -path '*/@prisma/engines/schema-engine-debian-openssl-3.0.x' -print -quit)"
test -n "$(find "$validation_dir/ops/db/node_modules" -path '*/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node' -print -quit)"

mkdir -p "$output_dir"
mv -f -- "$archive" "$output_dir/$archive"
printf '%s
' "$output_dir/$archive"
