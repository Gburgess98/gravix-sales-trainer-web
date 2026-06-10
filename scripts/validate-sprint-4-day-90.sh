#!/usr/bin/env bash
# Validates the Day 90 Sprint 4 deliverables:
#  - API: src/routes/manager.ts exists, is mounted at /v1/manager, has command-centre endpoint
#  - WEB: /coaching fetches /v1/manager/command-centre via the proxy
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"

fail=0

check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then
    echo "OK    $label"
  else
    echo "FAIL  $label"
    fail=1
  fi
}

# ── API checks ──
[[ -s "$API_ROOT/src/routes/manager.ts" ]]
check "API src/routes/manager.ts exists" $?

grep -q 'app.use("/v1/manager"' "$API_ROOT/src/server.ts" 2>/dev/null
check "API manager router mounted at /v1/manager" $?

grep -q '"/command-centre"' "$API_ROOT/src/routes/manager.ts" 2>/dev/null
check "API GET /v1/manager/command-centre endpoint exists" $?

grep -q "requireManager" "$API_ROOT/src/routes/manager.ts" 2>/dev/null
check "API manager router gated by requireManager" $?

# ── WEB checks ──
grep -q "/v1/manager/command-centre" "$WEB_ROOT/src/app/coaching/page.tsx" 2>/dev/null
check "WEB /coaching fetches /v1/manager/command-centre" $?

grep -q "proxyFetch('/v1/manager/command-centre" "$WEB_ROOT/src/app/coaching/page.tsx" 2>/dev/null
check "WEB fetch goes through proxyFetch (/api/proxy)" $?

# ── Optional live check (dev API on :4000) ──
if curl -s -o /dev/null --max-time 2 http://localhost:4000/v1/debug/health 2>/dev/null; then
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
    -H "x-user-id: 00000000-0000-4000-8000-000000000000" \
    http://localhost:4000/v1/manager/command-centre)
  [[ "$code" == "403" ]]
  check "API live: non-manager identity rejected (403)" $?
else
  echo "SKIP  live API check (dev server not running on :4000)"
fi

if [[ $fail -ne 0 ]]; then
  echo "Sprint 4 Day 90 validation FAILED"
  exit 1
fi
echo "Sprint 4 Day 90 validation PASSED"
