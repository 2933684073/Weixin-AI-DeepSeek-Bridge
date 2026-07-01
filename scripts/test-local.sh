#!/usr/bin/env bash
set -euo pipefail

base_url="${BASE_URL:-http://127.0.0.1:8787}"
token="${OPENCLAW_PROXY_KEY:-}"

auth_args=()
if [ -n "${token}" ]; then
  auth_args=(-H "Authorization: Bearer ${token}")
fi

curl -fsS "${base_url}/health"
echo
curl -fsS \
  "${auth_args[@]}" \
  -H 'Content-Type: application/json' \
  -d '{"message":"你好，用一句话介绍你自己。"}' \
  "${base_url}/chat"
echo