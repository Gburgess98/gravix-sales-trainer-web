#!/usr/bin/env bash
# Validates the Day 123 Tier 2B deliverables: suggestion outcome migration + proof close.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
WROUTE="$API_ROOT/src/routes/whisperer.ts"
MIGRATION="$API_ROOT/sql/20260616_whisperer_suggestion_outcome.sql"
WHISPERER_WEB="$WEB_ROOT/src/app/whisperer/page.tsx"
CALL_WEB="$WEB_ROOT/src/app/calls/[id]/page.tsx"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

[[ -f "$MIGRATION" ]]
check "sql/20260616_whisperer_suggestion_outcome.sql exists" $?

grep -q '"/triggers/:id/outcome"' "$WROUTE" 2>/dev/null
check "PATCH /v1/whisperer/triggers/:id/outcome route exists" $?

grep -q "not_relevant" "$WROUTE" 2>/dev/null && grep -q "ignored" "$WROUTE" && grep -q '"used"' "$WROUTE"
check "outcome values used/ignored/not_relevant exist" $?

grep -q "OUTCOME_BUTTONS" "$WHISPERER_WEB" 2>/dev/null && grep -q "Not relevant" "$WHISPERER_WEB" && grep -q "Ignored" "$WHISPERER_WEB" && grep -q "markOutcome" "$WHISPERER_WEB"
check "/whisperer has Used/Ignored/Not relevant buttons" $?

grep -q "Suggestion use:" "$COACHING" 2>/dev/null && grep -q "Used rate:" "$COACHING"
check "/coaching has Suggestion use / Used rate copy" $?

grep -q "markMomentOutcome" "$CALL_WEB" 2>/dev/null && grep -q "/outcome" "$CALL_WEB"
check "/calls/[id] handles suggestion outcome" $?

if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$WROUTE" "$WHISPERER_WEB" "$CALL_WEB" "$COACHING" 2>/dev/null; then
  check "no LLM/ElevenLabs/TTS added" 1
else
  check "no LLM/ElevenLabs/TTS added" 0
fi

bash "$WEB_ROOT/scripts/validate-tier-2b-day-122.sh" >/dev/null 2>&1
check "Day 122 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 123 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 123 validation PASSED"
