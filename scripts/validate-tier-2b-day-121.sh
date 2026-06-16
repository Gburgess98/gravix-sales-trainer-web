#!/usr/bin/env bash
# Validates the Day 121 Tier 2B deliverables: custom trigger library UX completion.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
WROUTE="$API_ROOT/src/routes/whisperer.ts"
MANAGER="$API_ROOT/src/routes/manager.ts"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

grep -q "customTriggerId: (r.meta" "$WROUTE" 2>/dev/null
check "/segments response echoes customTriggerId" $?

grep -q '"/whisperer-trigger-library/:id"' "$MANAGER" 2>/dev/null
check "PATCH/DELETE trigger-library route exists" $?

grep -q "toggleTrigger" "$COACHING" 2>/dev/null
check "/coaching has enable/disable handler" $?

grep -q "deleteTrigger" "$COACHING" 2>/dev/null
check "/coaching has delete handler" $?

grep -q "Trigger disabled." "$COACHING" 2>/dev/null && grep -q "Trigger enabled." "$COACHING"
check "/coaching enable/disable copy present" $?

grep -q "Trigger deleted." "$COACHING" 2>/dev/null
check "/coaching delete copy present" $?

grep -q "method: 'PATCH'" "$COACHING" 2>/dev/null && grep -q "whisperer-trigger-library" "$COACHING"
check "/coaching calls PATCH on trigger library" $?

grep -q "method: 'DELETE'" "$COACHING" 2>/dev/null
check "/coaching calls DELETE on trigger library" $?

if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$WROUTE" "$MANAGER" "$COACHING" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

npx tsx "$API_ROOT/scripts/validate-whisperer-triggers.ts" >/dev/null 2>&1
check "trigger assertions pass" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-120.sh" >/dev/null 2>&1
check "Day 120 validation still passes" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-119.sh" >/dev/null 2>&1
check "Day 119 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 121 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 121 validation PASSED"
