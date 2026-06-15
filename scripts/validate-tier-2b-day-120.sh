#!/usr/bin/env bash
# Validates the Day 120 Tier 2B follow-on consolidation.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

[[ -s "$API_ROOT/sql/20260615_whisperer_trigger_library.sql" ]]
check "trigger library SQL exists" $?

[[ -s "$API_ROOT/src/whisperer/customTriggers.ts" ]]
check "customTriggers.ts exists" $?

grep -q '"/whisperer-trigger-library"' "$API_ROOT/src/routes/manager.ts" 2>/dev/null
check "manager trigger library routes exist" $?

grep -q '"Custom Triggers"' "$WEB_ROOT/src/app/coaching/page.tsx" 2>/dev/null
check "/coaching Custom Triggers card exists" $?

grep -q "\['bearer', token\]" "$WEB_ROOT/src/app/whisperer/page.tsx" 2>/dev/null
check "Day 117 bearer auth still present" $?

if grep -q "DEEPGRAM_API_KEY" "$WEB_ROOT/src/app/whisperer/page.tsx" 2>/dev/null; then
  check "no DEEPGRAM_API_KEY in web" 1
else
  check "no DEEPGRAM_API_KEY in web" 0
fi

if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$API_ROOT/src/whisperer" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

npx tsx "$API_ROOT/scripts/validate-whisperer-triggers.ts" >/dev/null 2>&1
check "semantic + custom trigger assertions pass" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-119.sh" >/dev/null 2>&1
check "Day 119 validation still passes" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-118.sh" >/dev/null 2>&1
check "Day 118 validation still passes" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-117.sh" >/dev/null 2>&1
check "Day 117 validation still passes" $?

# Tag check (informational pre-tag)
if git -C "$WEB_ROOT" rev-parse sprint-day-120-complete >/dev/null 2>&1; then
  check "WEB tag sprint-day-120-complete exists" 0
else
  echo "PEND  WEB tag sprint-day-120-complete not created yet"
fi

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 120 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 120 validation PASSED"
