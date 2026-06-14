#!/usr/bin/env bash
# Validates the Day 115 Tier 2B deliverables: whisperer trigger replay into call timeline.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
CALLS="$API_ROOT/src/routes/calls.ts"
CALLPAGE="$WEB_ROOT/src/app/calls/[id]/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

grep -q '"/:id/whisperer-triggers"' "$CALLS" 2>/dev/null
check "GET /v1/calls/:id/whisperer-triggers exists" $?

grep -q "whisperer_sessions" "$CALLS" 2>/dev/null && grep -q "whisperer_triggers" "$CALLS"
check "endpoint references whisperer_sessions + whisperer_triggers" $?

grep -q "canAccessCall" "$CALLS" 2>/dev/null
check "endpoint reuses call-access check" $?

grep -q "whispererTablesAvailable" "$CALLS" 2>/dev/null
check "endpoint fail-soft on missing tables" $?

grep -q "whisperer-triggers" "$CALLPAGE" 2>/dev/null
check "call page fetches whisperer-triggers endpoint" $?

grep -q "Whisperer Moments" "$CALLPAGE" 2>/dev/null
check "call page includes Whisperer Moments copy" $?

grep -q "No Whisperer moments linked to this call yet." "$CALLPAGE" 2>/dev/null && \
grep -q "Could not load Whisperer moments." "$CALLPAGE"
check "call page has empty + error states" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-114.sh" >/dev/null 2>&1
check "Day 114 validation still passes" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-113.sh" >/dev/null 2>&1
check "Day 113 validation still passes" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-111.sh" >/dev/null 2>&1
check "Day 111 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 115 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 115 validation PASSED"
