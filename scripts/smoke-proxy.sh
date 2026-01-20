#!/usr/bin/env bash
set -euo pipefail

WEB_BASE="${WEB_BASE:-http://localhost:3000}"
USER_ID="${USER_ID:-}"

echo "== Smoke: proxy health (web -> api) =="

# Always initialise the array (fixes "unbound variable" with set -u)
HDR=()
if [[ -n "$USER_ID" ]]; then
  HDR+=(-H "x-user-id: ${USER_ID}")
fi

HEALTH_URL="${WEB_BASE}/api/proxy/v1/debug/health"
AUTH_URL="${WEB_BASE}/api/proxy/v1/debug/auth"

# Health
if ! out=$(curl -fsS "${HDR[@]}" "$HEALTH_URL"); then
  echo "❌ Proxy health failed: $HEALTH_URL"
  echo "Response:"
  curl -sS "${HDR[@]}" "$HEALTH_URL" || true
  exit 1
fi

echo "$out" | grep -q '"ok":true' || {
  echo "❌ Proxy health returned not-ok"
  echo "$out"
  exit 1
}
echo "✅ Proxy health OK"

# Optional auth passthrough
if [[ -n "$USER_ID" ]]; then
  echo "== Smoke: proxy auth (identity passthrough) =="

  if ! out2=$(curl -fsS "${HDR[@]}" "$AUTH_URL"); then
    echo "❌ Proxy auth failed: $AUTH_URL"
    echo "Response:"
    curl -sS "${HDR[@]}" "$AUTH_URL" || true
    exit 1
  fi

  echo "$out2" | grep -q '"ok":true' || {
    echo "❌ Proxy auth returned not-ok"
    echo "$out2"
    exit 1
  }

  echo "✅ Proxy auth OK"
else
  echo "SKIP proxy auth (USER_ID not set). Run:"
  echo "  USER_ID='<your-user-id>' WEB_BASE='${WEB_BASE}' bash scripts/smoke-proxy.sh"
fi