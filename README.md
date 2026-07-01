# Weixin AI DeepSeek Bridge

This project runs a DeepSeek chat bridge for Tencent Weixin AI / OpenClaw.
It also includes an admin console for model settings, persona files, skills, services, and logs.

## Features

- POST /chat: simple chat API for local tests.
- POST /v1/chat/completions: OpenAI-compatible chat API.
- GET /v1/models: returns the current configured model.
- Supports stream=true.
- Uses OPENCLAW_PROXY_KEY to protect public bridge APIs.
- Includes /admin management console.
- No runtime npm dependencies are required.

## Environment

Copy the example file:

```bash
cp .env.example .env
chmod 600 .env
```

Important values:

```bash
DEEPSEEK_API_KEY=sk-your-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
OPENCLAW_PROXY_KEY=change-this-random-token
ADMIN_TOKEN=change-this-admin-token
OPENCLAW_HOME=/root/.openclaw
```

Do not commit real API keys.

## Start Locally

```bash
node src/server.js
```

Open:

```text
http://127.0.0.1:8787
http://127.0.0.1:8787/admin
```

CLI test:

```bash
node src/cli.js --once "hello"
```

OpenAI-compatible test:

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H "Authorization: Bearer $OPENCLAW_PROXY_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-v4-pro","messages":[{"role":"user","content":"hello"}]}'
```

## CentOS 7.9 Install

Run from the project directory:

```bash
sudo bash scripts/install-centos7.sh
```

The script installs a CentOS 7 compatible Node.js build, copies the app to /opt/weixin-ai-deepseek, creates a systemd service, and tries to install the Weixin OpenClaw plugin.

After editing /opt/weixin-ai-deepseek/.env, restart:

```bash
sudo systemctl restart weixin-ai-deepseek
curl http://127.0.0.1:8787/health
```

## Admin Console

Default integrated URL:

```text
http://SERVER_IP:8787/admin
```

If running the admin console in /root/ai-cmd on port 8790:

```text
http://SERVER_IP:8790/admin
```

Enable the admin service:

```bash
cd /opt/weixin-ai-deepseek
bash scripts/install-admin-service.sh
```

View the admin token:

```bash
grep '^ADMIN_TOKEN=' /opt/weixin-ai-deepseek/.env
```

Admin features:

- View bridge and OpenClaw Gateway status.
- Change DeepSeek model, temperature, max tokens, and timeout.
- Update DeepSeek API key, proxy key, and admin token.
- Edit OpenClaw workspace persona files.
- Create, edit, enable, disable, and delete local skills.
- Run limited OpenClaw skills commands: list, search, verify, install.
- Edit /root/.openclaw/openclaw.json and detected model fields.
- Restart weixin-ai-deepseek and openclaw-gateway.
- Read journal logs.

Use HTTPS and a strong ADMIN_TOKEN before exposing /admin to the public internet.

## Weixin Plugin

Install or update:

```bash
npx -y @tencent-weixin/openclaw-weixin-cli@latest install
```

OpenAI-compatible config:

```text
Provider: OpenAI Compatible
Base URL: http://127.0.0.1:8787/v1
API Key: OPENCLAW_PROXY_KEY from .env
Model: deepseek-v4-pro
```

## Useful Commands

```bash
sudo systemctl restart weixin-ai-deepseek
sudo systemctl restart openclaw-gateway
sudo journalctl -u weixin-ai-deepseek -f
sudo journalctl -u openclaw-gateway -f
bash scripts/install-openclaw-weixin.sh
bash scripts/test-local.sh
```