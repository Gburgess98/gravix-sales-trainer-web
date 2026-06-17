#!/usr/bin/env bash
# Validates the Day 129 Tier 2B deliverable: Live Whisperer QA close doc.
# No new features — documentation + validation + tag pass.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOC="$WEB_ROOT/TIER_2B_LIVE_QA_CLOSE.md"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

[[ -f "$DOC" ]]
check "TIER_2B_LIVE_QA_CLOSE.md exists" $?

grep -qi "dead.air" "$DOC" 2>/dev/null
check "doc mentions dead-air hint" $?

grep -qi "calibration" "$DOC" 2>/dev/null
check "doc mentions speaker calibration" $?

grep -qi "diaris" "$DOC" 2>/dev/null
check "doc mentions diarisation" $?

grep -qi "does not own the call" "$DOC" 2>/dev/null
check "doc mentions Gravix does not own the call" $?

if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$DOC" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

bash "$WEB_ROOT/scripts/validate-tier-2b-day-128.sh" >/dev/null 2>&1
check "Day 128 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 129 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 129 validation PASSED"
