#!/usr/bin/env bash
# Validates the Day 122 Tier 2B deliverables: Whisperer suggestion outcome scoring.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
WROUTE="$API_ROOT/src/routes/whisperer.ts"
MANAGER="$API_ROOT/src/routes/manager.ts"
CALLS_API="$API_ROOT/src/routes/calls.ts"
WHISPERER_WEB="$WEB_ROOT/src/app/whisperer/page.tsx"
CALL_WEB="$WEB_ROOT/src/app/calls/[id]/page.tsx"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

grep -q '"/triggers/:id/outcome"' "$WROUTE" 2>/dev/null
check "PATCH /v1/whisperer/triggers/:id/outcome exists" $?

grep -q "not_relevant" "$WROUTE" 2>/dev/null && grep -q "ignored" "$WROUTE" && grep -q '"used"' "$WROUTE"
check "outcome values used/ignored/not_relevant present" $?

grep -q "invalid_outcome" "$WROUTE" 2>/dev/null
check "invalid outcome rejected (400)" $?

grep -q "migration_required" "$WROUTE" 2>/dev/null
check "outcome endpoint fails soft when column missing" $?

grep -q "suggestionOutcomes" "$MANAGER" 2>/dev/null && grep -q "usedRate" "$MANAGER"
check "manager whisperer-sessions includes suggestion outcome summary" $?

grep -q "suggestionOutcome" "$CALLS_API" 2>/dev/null
check "/calls/:id/whisperer-triggers returns suggestionOutcome" $?

grep -q "OUTCOME_BUTTONS" "$WHISPERER_WEB" 2>/dev/null && grep -q "Not relevant" "$WHISPERER_WEB" && grep -q "Ignored" "$WHISPERER_WEB" && grep -q "markOutcome" "$WHISPERER_WEB"
check "/whisperer has Used/Ignored/Not relevant buttons" $?

grep -q "Marked used." "$WHISPERER_WEB" 2>/dev/null && grep -q "Could not update suggestion outcome." "$WHISPERER_WEB"
check "/whisperer outcome copy present" $?

grep -q "markMomentOutcome" "$CALL_WEB" 2>/dev/null && grep -q "/outcome" "$CALL_WEB"
check "/calls/[id] handles suggestion outcome" $?

grep -q "Suggestion use:" "$COACHING" 2>/dev/null && grep -q "Used rate:" "$COACHING"
check "/coaching shows suggestion use / used rate copy" $?

if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$WROUTE" "$MANAGER" "$CALLS_API" "$WHISPERER_WEB" "$CALL_WEB" "$COACHING" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

npx tsx "$API_ROOT/scripts/validate-whisperer-triggers.ts" >/dev/null 2>&1
check "trigger assertions pass" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-121.sh" >/dev/null 2>&1
check "Day 121 validation still passes" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-120.sh" >/dev/null 2>&1
check "Day 120 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 122 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 122 validation PASSED"
