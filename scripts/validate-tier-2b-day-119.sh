#!/usr/bin/env bash
# Validates the Day 119 Tier 2B deliverables: custom trigger library foundation.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
SQL="$API_ROOT/sql/20260615_whisperer_trigger_library.sql"
CUSTOM="$API_ROOT/src/whisperer/customTriggers.ts"
MANAGER="$API_ROOT/src/routes/manager.ts"
WROUTE="$API_ROOT/src/routes/whisperer.ts"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

[[ -s "$SQL" ]]; check "SQL migration exists" $?
grep -q "create table if not exists public.whisperer_trigger_library" "$SQL" 2>/dev/null
check "whisperer_trigger_library table in SQL" $?

[[ -s "$CUSTOM" ]]; check "custom trigger detection helper exists" $?
grep -q "detectCustomWhispererTriggers" "$CUSTOM" 2>/dev/null && grep -q "mergeBuiltInAndCustomTriggers" "$CUSTOM"
check "custom detect + merge helpers exist" $?

grep -q '"/whisperer-trigger-library"' "$MANAGER" 2>/dev/null
check "manager GET/POST trigger-library route exists" $?
grep -q '"/whisperer-trigger-library/:id"' "$MANAGER" 2>/dev/null
check "manager PATCH/DELETE trigger-library route exists" $?
grep -q "router.use(requireManager)" "$MANAGER" 2>/dev/null || grep -q "requireManager" "$MANAGER"
check "manager library routes require manager" $?

grep -q "detectCustomWhispererTriggers" "$WROUTE" 2>/dev/null && grep -q "loadCustomTriggerRules" "$WROUTE"
check "/segments loads + applies custom triggers" $?

grep -q "whisperer-trigger-library" "$COACHING" 2>/dev/null
check "/coaching references trigger library endpoint" $?
grep -q '"Custom Triggers"' "$COACHING" 2>/dev/null
check "/coaching includes Custom Triggers copy" $?
grep -q "No custom Whisperer triggers yet." "$COACHING" 2>/dev/null
check "/coaching has empty state" $?

if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$CUSTOM" "$MANAGER" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

npx tsx "$API_ROOT/scripts/validate-whisperer-triggers.ts" >/dev/null 2>&1
check "trigger assertions (built-in + custom) pass" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-118.sh" >/dev/null 2>&1
check "Day 118 validation still passes" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-117.sh" >/dev/null 2>&1
check "Day 117 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 119 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 119 validation PASSED"
echo "NOTE: custom triggers activate after running sql/20260615_whisperer_trigger_library.sql in the Supabase SQL editor."
