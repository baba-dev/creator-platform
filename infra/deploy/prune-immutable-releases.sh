#!/usr/bin/env bash
# Explicit, dry-run-by-default maintenance of immutable release directories.
# This is an operator command, NOT part of the automatic deployment workflow.
set -Eeuo pipefail
umask 027

readonly root=/var/www/creator-platform
readonly releases="$root/releases"
readonly current="$root/current"
mode="${1:---dry-run}"
recent_override="${2:-}"
if [[ $# -gt 2 || ( "$mode" != "--dry-run" && "$mode" != "--apply" ) ||
      ( -n "$recent_override" && "$recent_override" != "--include-recent" ) ]]; then
  printf 'Usage: sudo bash %s [--dry-run|--apply] [--include-recent]\n' "$0" >&2
  exit 64
fi
[[ "$EUID" -eq 0 ]] || { echo "Must be run as root." >&2; exit 1; }
[[ -d "$releases" && -L "$current" ]] || {
  echo "Expected releases directory and active symlink are missing; refusing cleanup." >&2
  exit 1
}

active="$(readlink -f -- "$current")"
[[ "$active" =~ ^/var/www/creator-platform/releases/sha-[a-f0-9]{40}$ && -d "$active" ]] || {
  echo "Active release is outside the trusted immutable release directory; refusing cleanup." >&2
  exit 1
}

echo "Active release (always kept): $active"
df -h "$releases"
# Read-only listing: restrict to direct child directories named after commit SHAs.
mapfile -t directories < <(
  find "$releases" -mindepth 1 -maxdepth 1 -type d -name 'sha-*' -printf '%T@ %p\n' |
    sort -nr | cut -d' ' -f2-
)

rollback=""
eligible=0
for directory in "${directories[@]}"; do
  name="${directory##*/}"
  [[ "$name" =~ ^sha-([a-f0-9]{40})$ ]] || continue
  sha="${BASH_REMATCH[1]}"
  [[ ! -L "$directory" ]] || continue
  [[ "$(stat -c '%u' -- "$directory")" == 0 ]] || continue
  [[ -f "$directory/RELEASE_SHA" && -f "$directory/RELEASE_LAYOUT" ]] || continue
  [[ "$(cat -- "$directory/RELEASE_SHA")" == "$sha" ]] || continue
  [[ "$(cat -- "$directory/RELEASE_LAYOUT")" == 3 ]] || continue

  if [[ "$directory" == "$active" ]]; then
    echo "KEEP active: $name"
    continue
  fi
  if [[ -z "$rollback" ]]; then
    rollback="$directory"
    echo "KEEP newest rollback candidate: $name"
    continue
  fi

  # Never remove recent releases, even after selecting an older rollback.
  if [[ "$recent_override" != "--include-recent" &&
        -z "$(find "$directory" -maxdepth 0 -mmin +1440 -print)" ]]; then
    echo "KEEP recent (less than 24h old): $name"
    continue
  fi
  echo "PRUNE candidate: $name ($(du -sh -- "$directory" | cut -f1))"
  eligible=$((eligible + 1))
  if [[ "$mode" == "--apply" ]]; then
    # Recheck the active symlink immediately before each deletion.
    [[ "$(readlink -f -- "$current")" == "$active" ]] || {
      echo "Active release changed during maintenance; aborting." >&2
      exit 1
    }
    [[ "$directory" != "$active" && "$directory" != "$rollback" ]] || exit 1
    rm -rf --one-file-system -- "$directory"
    echo "Removed verified stale release: $name"
  fi
done

if [[ -z "$rollback" ]]; then
  echo "No valid rollback candidate exists; no active release was removed."
fi
echo "Eligible stale releases: $eligible"
if [[ "$mode" == "--dry-run" ]]; then
  echo "Dry run only. Review the candidate list before rerunning with --apply."
else
  df -h "$releases"
fi
