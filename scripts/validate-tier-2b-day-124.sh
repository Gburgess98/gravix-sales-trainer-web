#!/usr/bin/env bash
# Validates the Day 124 Tier 2B deliverables: Whisperer usefulness breakdown.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
MANAGER="$API_ROOT/src/routes/manager.ts"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

grep -q "usefulnessByType" "$MANAGER" 2>/dev/null
check "manager endpoint includes usefulnessByType" $?

grep -q "customVsBuiltIn" "$MANAGER" 2>/dev/null
check "manager endpoint includes customVsBuiltIn" $?

grep -q "Usefulness by objection" "$COACHING" 2>/dev/null
check "/coaching includes Usefulness by objection copy" $?

grep -q "Custom triggers:" "$COACHING" 2>/dev/null && grep -q "Built-in triggers:" "$COACHING"
check "/coaching includes Custom triggers / Built-in triggers copy" $?

if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$MANAGER" "$COACHING" 2>/dev/null; then
  check "no LLM/ElevenLabs/TTS added" 1
else
  check "no LLM/ElevenLabs/TTS added" 0
fi

bash "$WEB_ROOT/scripts/validate-tier-2b-day-123.sh" >/dev/null 2>&1
check "Day 123 validation still passes" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-122.sh" >/dev/null 2>&1
check "Day 122 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 124 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 124 validation PASSED"
