#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

if [[ $EUID -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

install -o root -g root -m 0755 \
  "$repository_root/infra/deploy/creator-deploy" \
  /usr/local/sbin/creator-deploy
install -o root -g root -m 0755 \
  "$repository_root/infra/deploy/creator-ops" \
  /usr/local/sbin/creator-ops

install -o root -g root -m 0644 \
  "$repository_root/infra/systemd/creator-web.service" \
  /etc/systemd/system/creator-web.service
install -o root -g root -m 0644 \
  "$repository_root/infra/systemd/creator-worker.service" \
  /etc/systemd/system/creator-worker.service
install -o root -g root -m 0644 \
  "$repository_root/infra/systemd/creator-worker@.service" \
  /etc/systemd/system/creator-worker@.service
install -d -o root -g root -m 0755 \
  /etc/systemd/system/creator-worker@media.service.d
install -o root -g root -m 0644 \
  "$repository_root/infra/systemd/creator-worker@media.service.d/limits.conf" \
  /etc/systemd/system/creator-worker@media.service.d/limits.conf

systemctl daemon-reload

version="$(/usr/local/sbin/creator-deploy --version)"
printf 'Creator control plane installed (version %s).\n' "$version"
printf 'Services were not restarted. The next deployment will apply the installed units.\n'
