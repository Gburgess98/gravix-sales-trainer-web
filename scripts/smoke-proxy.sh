#!/usr/bin/env bash
set -euo pipefail

WEB_BASE="${WEB_BASE:-http://localhost:3000}"
USER_ID="${USER_ID:-}"
TOKEN="${TOKEN:-}"

echo "== Smoke: proxy health (web -> api) =="

# This proxy route requires an authenticated user context.
# For CLI smoke tests we support either:
#  - USER_ID (dev header passthrough), or
#  - TOKEN (Bearer token)
if [[ -z "$USER_ID" && -z "$TOKEN" ]]; then
  echo "❌ Missing identity for proxy smoke. Provide USER_ID or TOKEN."
  echo "Examples:"
  echo "  USER_ID='<your-user-id>' WEB_BASE='${WEB_BASE}' bash scripts/smoke-proxy.sh"
  echo "  TOKEN='<jwt>' WEB_BASE='${WEB_BASE}' bash scripts/smoke-proxy.sh"
  exit 1
fi

# Always initialise the array (safe with set -u)
HDR=()
if [[ -n "$USER_ID" ]]; then
  HDR+=( -H "x-user-id: ${USER_ID}" )
fi
if [[ -n "$TOKEN" ]]; then
  HDR+=( -H "Authorization: Bearer ${TOKEN}" )
fi

HEALTH_URL="${WEB_BASE}/api/proxy/v1/debug/health"
AUTH_URL="${WEB_BASE}/api/proxy/v1/debug/auth"

# Health
if ! out=$(curl -fsS ${HDR[@]+"${HDR[@]}"} "$HEALTH_URL"); then
  echo "❌ Proxy health failed: $HEALTH_URL"
  echo "Response:"
  curl -sS ${HDR[@]+"${HDR[@]}"} "$HEALTH_URL" || true
  exit 1
fi

echo "$out" | grep -q '"ok":true' || {
  echo "❌ Proxy health returned not-ok"
  echo "$out"
  exit 1
}

echo "✅ Proxy health OK"

# Optional auth passthrough check
# If USER_ID is provided, /debug/auth should also return ok.
if [[ -n "$USER_ID" ]]; then
  echo "== Smoke: proxy auth (identity passthrough) =="

  if ! out2=$(curl -fsS ${HDR[@]+"${HDR[@]}"} "$AUTH_URL"); then
    echo "❌ Proxy auth failed: $AUTH_URL"
    echo "Response:"
    curl -sS ${HDR[@]+"${HDR[@]}"} "$AUTH_URL" || true
    exit 1
  fi

  echo "$out2" | grep -q '"ok":true' || {
    echo "❌ Proxy auth returned not-ok"
    echo "$out2"
    exit 1
  }

  echo "✅ Proxy auth OK"
else
  echo "SKIP proxy auth (USER_ID not set)."
fi