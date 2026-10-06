#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

operation="${1:-}"
run_id="${2:-}"
release_sha="${3:-}"
if [[ ! "$run_id" =~ ^[0-9]+$ || ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: $0 <store|restore> <CI-run-id> <40-character-git-sha>" >&2
  exit 64
fi
: "${RUNNER_TOOL_CACHE:?RUNNER_TOOL_CACHE must be configured}"
cache_root="$RUNNER_TOOL_CACHE/creator-platform-releases"
release_dir="$cache_root/$run_id"
archive="creator-platform-${release_sha}.tar.gz"

verify() {
  local directory="$1"
  local digest filename extra
  test -f "$directory/$archive"
  test -f "$directory/$archive.sha256"
  read -r digest filename extra <"$directory/$archive.sha256"
  [[ "$digest" =~ ^[0-9a-f]{64}$ && "$filename" = "$archive" && -z "$extra" ]]
  test "$(sha256sum "$directory/$archive" | cut -c1-64)" = "$digest"
}

case "$operation" in
  store)
    # Only successful main-push validation publishes a release. PRs never do.
    test "${GITHUB_EVENT_NAME:-}" = "push"
    test "${GITHUB_REF:-}" = "refs/heads/main"
    test "${GITHUB_RUN_ID:-}" = "$run_id"
    test "${GITHUB_SHA:-}" = "$release_sha"
    verify "$PWD"
    mkdir -p "$cache_root"
    temporary="$(mktemp -d "$cache_root/.publish-XXXXXX")"
    trap 'rm -rf -- "$temporary"' EXIT
    cp -- "$archive" "$archive.sha256" "$temporary/"
    printf '%s\n' "$release_sha" >"$temporary/RELEASE_SHA"
    verify "$temporary"
    rm -rf -- "$release_dir"
    mv -- "$temporary" "$release_dir"
    # Bound local storage to the newest three successful releases.
    mapfile -t releases < <(
      find "$cache_root" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended \
        -regex '.*/[0-9]+' -printf '%T@ %f\n' | sort -nr | awk '{print $2}'
    )
    for old_run in "${releases[@]:3}"; do
      rm -rf -- "$cache_root/$old_run"
    done
    ;;
  restore)
    if ! test -f "$release_dir/RELEASE_SHA"; then
      echo "Validated CI release is missing on this runner. Run deployment on the same creators-ci host; rebuild through CI, never in deployment." >&2
      exit 1
    fi
    test "$(cat "$release_dir/RELEASE_SHA")" = "$release_sha"
    verify "$release_dir"
    cp -- "$release_dir/$archive" "$release_dir/$archive.sha256" .
    verify "$PWD"
    ;;
  *)
    echo "Unknown operation: $operation" >&2
    exit 64
    ;;
esac
