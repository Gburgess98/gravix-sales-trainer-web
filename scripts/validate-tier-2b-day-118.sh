#!/usr/bin/env bash
# Validates the Day 118 Tier 2B deliverables: live QA + stale session handling.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
ENGINE="$API_ROOT/src/whisperer/triggers.ts"
MANAGER="$API_ROOT/src/routes/manager.ts"
PAGE="$WEB_ROOT/src/app/whisperer/page.tsx"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
DEMO="$WEB_ROOT/TIER_2B_LIVE_DEMO_CHECKLIST.md"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

grep -q "export function scoreTriggerIntent" "$ENGINE" 2>/dev/null
check "semantic trigger classifier present" $?

grep -q "\['bearer', token\]" "$PAGE" 2>/dev/null
check "bearer subprotocol used in /whisperer" $?

grep -q "isStaleSession" "$MANAGER" 2>/dev/null && grep -q "staleSessions" "$MANAGER"
check "manager endpoint classifies stale sessions" $?

grep -q "isStale" "$MANAGER" 2>/dev/null
check "manager endpoint exposes isStale" $?

grep -q "staleSessions" "$COACHING" 2>/dev/null && grep -q "not ended cleanly" "$COACHING"
check "/coaching shows stale copy" $?

[[ -s "$DEMO" ]]
check "Live Whisperer demo checklist exists" $?

grep -q "Live Whisperer demo" "$DEMO" 2>/dev/null
check "demo checklist includes Live Whisperer demo" $?

grep -q "Gravix does not own the call" "$DEMO" 2>/dev/null
check "demo checklist includes the product rule" $?

[[ -s "$API_ROOT/scripts/cleanup-stale-whisperer-sessions.ts" ]]
check "stale cleanup script exists" $?

npx tsx "$API_ROOT/scripts/validate-whisperer-triggers.ts" >/dev/null 2>&1
check "semantic trigger assertions pass" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-117.sh" >/dev/null 2>&1
check "Day 117 validation still passes" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-116.sh" >/dev/null 2>&1
check "Day 116 validation still passes" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-115.sh" >/dev/null 2>&1
check "Day 115 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 118 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 118 validation PASSED"
