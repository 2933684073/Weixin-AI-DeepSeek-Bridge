#!/usr/bin/env bash
set -euo pipefail

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required. Run scripts/install-centos7.sh first, or install Node.js."
  exit 1
fi

npx -y @tencent-weixin/openclaw-weixin-cli@latest install