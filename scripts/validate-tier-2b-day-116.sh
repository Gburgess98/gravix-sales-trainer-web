#!/usr/bin/env bash
# Validates the Day 116 Tier 2B consolidation/close deliverables.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
CLOSE="$WEB_ROOT/TIER_2B_CLOSE.md"
SPEC="$WEB_ROOT/tests/e2e/whisperer-flow.spec.ts"
WROUTE="$API_ROOT/src/routes/whisperer.ts"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

[[ -s "$CLOSE" ]]; check "TIER_2B_CLOSE.md exists" $?
grep -q "Final workflow" "$CLOSE" 2>/dev/null; check "close doc includes final workflow" $?
grep -q "Gravix does not own the call" "$CLOSE" 2>/dev/null; check "close doc includes product rule" $?

[[ -s "$SPEC" ]]; check "whisperer E2E spec exists" $?
grep -q "/whisperer" "$SPEC" 2>/dev/null; check "spec references /whisperer" $?
grep -q "Whisperer Moments" "$SPEC" 2>/dev/null; check "spec references Whisperer Moments" $?
grep -q "/calls/" "$SPEC" 2>/dev/null; check "spec references /calls/" $?

grep -q 'router.post("/preview"' "$WROUTE" 2>/dev/null; check "/preview route still exists" $?

if grep -riqE "elevenlabs|voice.agent|text.to.speech" "$WROUTE" "$WEB_ROOT/src/app/whisperer/page.tsx" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent references" 1
else
  check "no ElevenLabs/TTS/Voice Agent references" 0
fi

bash "$WEB_ROOT/scripts/validate-tier-2b-day-115.sh" >/dev/null 2>&1; check "Day 115 validation still passes" $?
bash "$WEB_ROOT/scripts/validate-tier-2b-day-114.sh" >/dev/null 2>&1; check "Day 114 validation still passes" $?
bash "$WEB_ROOT/scripts/validate-tier-2b-day-113.sh" >/dev/null 2>&1; check "Day 113 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 116 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 116 validation PASSED"
