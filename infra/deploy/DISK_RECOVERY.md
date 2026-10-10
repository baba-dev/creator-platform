# Staging deployment: ENOSPC recovery

The deployment control plane makes immutable, root-owned release trees under
`/var/www/creator-platform/releases`. A CI artifact must be uploaded and then
expanded into a _separate_ temporary tree. Therefore an archive fitting into
`incoming/` **does not** prove there is enough free space to activate it.

## Diagnosis (read-only)

On the VPS over an operator SSH session:

```bash
df -h / /var/www/creator-platform/releases
df -i /
sudo du -xhd1 /var/www/creator-platform | sort -h
sudo du -xhd1 /var/www/creator-platform/releases | sort -h
readlink -f /var/www/creator-platform/current
curl -fsS http://127.0.0.1:3000/api/health
```

Also check `/var/lib/mysql`, `/var/log`, and other directories with
`sudo du -xhd1 /` **if releases are not the main consumers**. Never delete
`shared/`, `/var/lib/mysql`, root-owned backups, or the active runtime.

## Remove old, verified _immutable releases_ only

Use the operator-reviewed script added in this change (retrieve it from a
trusted copy of this repo). The script runs in **dry-run** mode by default.

```bash
sudo bash infra/deploy/prune-immutable-releases.sh --dry-run
```

Review the candidates, the active symlink, and the preserved newest rollback
release before allowing any deletions:

```bash
sudo bash infra/deploy/prune-immutable-releases.sh --apply
df -h /var/www/creator-platform/releases
```

The script protects the current release, the newest validated non-current
rollback candidate, unrecognized directories, backups, quarantine trees, and
shared runtime data. By default, it also preserves releases younger than 24
hours. If the disk is full of recent deployments, explicitly review those
candidates with `--dry-run --include-recent` and permit them only with
`--apply --include-recent`; the active and rollback releases remain protected.
If it cannot reclaim enough space, investigate usage before proceeding rather
than deleting more aggressively. Running it requires privileged VPS access; the
CI deployment account cannot remove root-owned release trees by design.

## Retry and verify

The CI deploy workflow automatically removes only **stale incoming archives**
older than 48 hours, then compares staging free space with the compressed
artifact size, its uncompressed regular-file size, and 512 MiB of spare
headroom. Insufficient free space fails **before** transferring or extracting a
new release.

Once enough space exists, rerun the failed deploy job for a specific already
validated `main` CI artifact, or allow the next successful main CI deployment to
proceed. Confirm the new run completes `Activate release on staging`, and
compare the active SHA and health response:

```bash
readlink -f /var/www/creator-platform/current
cat /var/www/creator-platform/current/RELEASE_SHA
curl -fsS http://127.0.0.1:3000/api/health
systemctl is-active creator-web.service
```

Do not assume that a failed extraction changed the active symlink: activation
occurs only after release validation, catalog migrations, and checks. Do not
retry blindly when disk space is still insufficient; repeated uploads can
temporarily consume more disk.
