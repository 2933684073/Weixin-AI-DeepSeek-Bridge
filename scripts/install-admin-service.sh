#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/weixin-ai-deepseek}"
NODE_BIN="${NODE_BIN:-/usr/local/bin/node}"
NPM_BIN="${NPM_BIN:-/usr/local/bin/npm}"
OPENCLAW_HOME="${OPENCLAW_HOME:-/root/.openclaw}"
ENV_FILE="${APP_DIR}/.env"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root: sudo bash scripts/install-admin-service.sh"
  exit 1
fi

if [ ! -d "${APP_DIR}" ]; then
  echo "APP_DIR does not exist: ${APP_DIR}"
  exit 1
fi

if [ ! -f "${ENV_FILE}" ]; then
  cp "${APP_DIR}/.env.example" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
fi

append_if_missing() {
  local key="$1"
  local value="$2"
  if ! grep -q "^${key}=" "${ENV_FILE}"; then
    printf '%s=%s\n' "${key}" "${value}" >>"${ENV_FILE}"
  fi
}

admin_token="$(${NODE_BIN} -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
append_if_missing "ADMIN_TOKEN" "${admin_token}"
append_if_missing "OPENCLAW_HOME" "${OPENCLAW_HOME}"
chmod 600 "${ENV_FILE}"

NODE_REAL="$(${NODE_BIN} -e "console.log(process.execPath)")"
NODE_DIR="$(dirname "${NODE_REAL}")"
NPM_PREFIX="$(${NPM_BIN} prefix -g 2>/dev/null || echo /usr/local)"
SERVICE_PATH="${NPM_PREFIX}/bin:${NODE_DIR}:/usr/local/bin:/usr/bin:/bin"

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
Environment=PATH=${SERVICE_PATH}
ExecStart=${NODE_BIN} ${APP_DIR}/src/server.js
Restart=always
RestartSec=3
NoNewPrivileges=false

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable weixin-ai-deepseek
systemctl restart weixin-ai-deepseek

echo "Admin console is ready:"
echo "  http://SERVER_IP:8787/admin"
echo "Admin token:"
grep '^ADMIN_TOKEN=' "${ENV_FILE}"