#!/usr/bin/env bash
set -euo pipefail

WEB_BASE="${WEB_BASE:-http://localhost:3000}"

echo "== Smoke: proxy health (web -> api) =="
curl -fsS "${WEB_BASE}/api/proxy/v1/debug/health" >/dev/null
echo "✅ Web proxy smoke passed"