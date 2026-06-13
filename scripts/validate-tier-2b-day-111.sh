#!/usr/bin/env bash
# Validates the Day 111 Tier 2B deliverables: transcript stub loop.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
ROUTE="$API_ROOT/src/routes/whisperer.ts"
ENGINE="$API_ROOT/src/whisperer/triggers.ts"
SQL="$API_ROOT/sql/20260612_whisperer_stub_loop.sql"
PAGE="$WEB_ROOT/src/app/whisperer/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

[[ -s "$SQL" ]]; check "SQL migration exists" $?
grep -q "create table if not exists public.whisperer_sessions" "$SQL" 2>/dev/null
check "whisperer_sessions in SQL" $?
grep -q "create table if not exists public.whisperer_triggers" "$SQL" 2>/dev/null
check "whisperer_triggers in SQL" $?

[[ -s "$ENGINE" ]]; check "src/whisperer/triggers.ts exists" $?
grep -q "export function detectWhispererTriggers" "$ENGINE" 2>/dev/null
check "detectWhispererTriggers exists" $?

grep -q 'router.post("/sessions"' "$ROUTE" 2>/dev/null
check "POST /v1/whisperer/sessions exists" $?
grep -q 'router.get("/sessions/:id"' "$ROUTE" 2>/dev/null
check "GET /v1/whisperer/sessions/:id exists" $?
grep -q 'router.post("/sessions/:id/segments"' "$ROUTE" 2>/dev/null
check "POST /sessions/:id/segments exists" $?
grep -q 'router.post("/sessions/:id/end"' "$ROUTE" 2>/dev/null
check "POST /sessions/:id/end exists" $?
grep -q 'router.post("/preview"' "$ROUTE" 2>/dev/null
check "/v1/whisperer/preview untouched" $?

[[ -s "$PAGE" ]]; check "/whisperer page exists" $?
grep -q "Live Whisperer" "$PAGE" 2>/dev/null
check "page includes Live Whisperer" $?
grep -q "Transcript simulator" "$PAGE" 2>/dev/null
check "page includes Transcript simulator" $?
grep -q "No suggestions yet." "$PAGE" 2>/dev/null && grep -q "End session" "$PAGE"
check "page includes suggestion/end copy" $?

grep -qi "deepgram" "$API_ROOT/package.json" 2>/dev/null
if [[ $? -ne 0 ]]; then check "no Deepgram package required yet" 0; else check "no Deepgram package required yet" 1; fi

npx tsx "$API_ROOT/scripts/validate-whisperer-triggers.ts" >/dev/null 2>&1
check "trigger engine unit assertions pass" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-110.sh" >/dev/null 2>&1
check "Day 110 docs still present" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 111 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 111 validation PASSED"
echo "NOTE: persistence activates after running sql/20260612_whisperer_stub_loop.sql in the Supabase SQL editor (in-memory fallback until then)."
