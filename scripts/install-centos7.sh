#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/weixin-ai-deepseek}"
APP_USER="${APP_USER:-weixinai}"
NODE_VERSION="${NODE_VERSION:-22.19.0}"
INSTALL_OPENCLAW="${INSTALL_OPENCLAW:-1}"
NODE_ARCHIVE="node-v${NODE_VERSION}-linux-x64-glibc-217"
NODE_URL="https://unofficial-builds.nodejs.org/download/release/v${NODE_VERSION}/${NODE_ARCHIVE}.tar.xz"
NODE_PREFIX="/usr/local/${NODE_ARCHIVE}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root: sudo bash scripts/install-centos7.sh"
  exit 1
fi

if [ -f /etc/centos-release ]; then
  echo "Detected $(cat /etc/centos-release)"
fi

yum install -y ca-certificates curl tar xz shadow-utils

if [ ! -d "${NODE_PREFIX}" ]; then
  tmp_archive="/tmp/${NODE_ARCHIVE}.tar.xz"
  curl -fsSL "${NODE_URL}" -o "${tmp_archive}"
  tar -xJf "${tmp_archive}" -C /usr/local
  rm -f "${tmp_archive}"
fi

ln -sf "${NODE_PREFIX}/bin/node" /usr/local/bin/node
ln -sf "${NODE_PREFIX}/bin/npm" /usr/local/bin/npm
ln -sf "${NODE_PREFIX}/bin/npx" /usr/local/bin/npx

if ! id "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --create-home --shell /bin/bash "${APP_USER}"
fi

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "${APP_DIR}"

if [ "${SOURCE_DIR}" != "${APP_DIR}" ]; then
  tar \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.env' \
    -C "${SOURCE_DIR}" \
    -cf - . | tar -C "${APP_DIR}" -xf -
fi

if [ ! -f "${APP_DIR}/.env" ]; then
  cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
  proxy_key="$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
  sed -i "s/^OPENCLAW_PROXY_KEY=.*/OPENCLAW_PROXY_KEY=${proxy_key}/" "${APP_DIR}/.env"
  admin_token="$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
  if ! grep -q '^ADMIN_TOKEN=' "${APP_DIR}/.env"; then echo "ADMIN_TOKEN=${admin_token}" >> "${APP_DIR}/.env"; fi
  if ! grep -q '^OPENCLAW_HOME=' "${APP_DIR}/.env"; then echo "OPENCLAW_HOME=/root/.openclaw" >> "${APP_DIR}/.env"; fi
  chmod 600 "${APP_DIR}/.env"
fi

chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

cat >/etc/systemd/system/weixin-ai-deepseek.service <<SERVICE
[Unit]
Description=Weixin AI DeepSeek bridge and admin console
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=HOME=/root
Environment=PATH=${NODE_PREFIX}/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/local/bin/node ${APP_DIR}/src/server.js
Restart=always
RestartSec=3
NoNewPrivileges=false

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable weixin-ai-deepseek
systemctl restart weixin-ai-deepseek

if [ "${INSTALL_OPENCLAW}" = "1" ]; then
  echo "Installing Tencent Weixin OpenClaw plugin. Follow any interactive prompts."
  PATH="${NODE_PREFIX}/bin:/usr/local/bin:$PATH" npx -y @tencent-weixin/openclaw-weixin-cli@latest install || {
    echo "OpenClaw install did not complete. You can rerun: npx -y @tencent-weixin/openclaw-weixin-cli@latest install"
  }
fi

echo "Service status:"
systemctl --no-pager --full status weixin-ai-deepseek || true
echo
echo "Edit ${APP_DIR}/.env and set DEEPSEEK_API_KEY, then run:"
echo "  systemctl restart weixin-ai-deepseek"
echo "Local test:"
echo "  curl http://127.0.0.1:8787/health"