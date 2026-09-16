#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

deploy_user="${1:-creator-deploy}"
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

getent passwd aiwa-creator >/dev/null || {
  echo "Missing runtime user: aiwa-creator" >&2
  exit 1
}

getent passwd "$deploy_user" >/dev/null || {
  echo "Missing SSH deployment user: $deploy_user" >&2
  exit 1
}

install -d -o root -g aiwa-creator -m 0755 /var/www/creator-platform
install -d -o root -g aiwa-creator -m 0755 /var/www/creator-platform/releases
install -d -o "$deploy_user" -g aiwa-creator -m 0750 /var/www/creator-platform/incoming
install -d -o aiwa-creator -g aiwa-creator -m 0750 /var/www/creator-platform/shared
install -d -o aiwa-creator -g aiwa-creator -m 0750 /var/www/creator-platform/shared/pnpm-store
install -d -o aiwa-creator -g aiwa-creator -m 0750 /var/www/creator-platform/.cache
install -d -o aiwa-creator -g aiwa-creator -m 0750 /var/www/creator-platform/.config
install -d -o aiwa-creator -g aiwa-creator -m 0750 /var/www/creator-platform/.local/state
install -d -o root -g aiwa-creator -m 0750 /etc/aiwa-creators
install -d -o root -g root -m 0755 /var/www/letsencrypt

install -o root -g root -m 0755 \
  "$repository_root/infra/deploy/creator-deploy" \
  /usr/local/sbin/creator-deploy

install -o root -g root -m 0644 \
  "$repository_root/infra/systemd/creator-web.service" \
  /etc/systemd/system/creator-web.service

install -o root -g root -m 0644 \
  "$repository_root/infra/systemd/creator-worker.service" \
  /etc/systemd/system/creator-worker.service

printf '%s ALL=(root) NOPASSWD: /usr/local/sbin/creator-deploy *\n' "$deploy_user" \
  >/etc/sudoers.d/creator-platform-deploy
chmod 0440 /etc/sudoers.d/creator-platform-deploy
visudo -cf /etc/sudoers.d/creator-platform-deploy

install -o root -g root -m 0644 \
  "$repository_root/infra/nginx/creator.aiwamediagroup.com.http.conf" \
  /etc/nginx/sites-available/creator.aiwamediagroup.com
ln -sfn \
  /etc/nginx/sites-available/creator.aiwamediagroup.com \
  /etc/nginx/sites-enabled/creator.aiwamediagroup.com

systemctl daemon-reload
systemctl enable creator-web.service creator-worker.service
nginx -t
systemctl reload nginx

echo "Server bootstrap complete. Services will start during the first deployment."
