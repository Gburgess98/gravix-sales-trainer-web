#!/usr/bin/env bash
# Validates the Day 127 Tier 2B deliverable: rep/prospect speaker calibration
# for Live Whisperer diarisation labels (session-local, no migration).
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
WHISPERER="$WEB_ROOT/src/app/whisperer/page.tsx"
WROUTE="$API_ROOT/src/routes/whisperer.ts"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

# Part B — calibration UI copy + role options
grep -q "Speaker calibration" "$WHISPERER" 2>/dev/null
check "/whisperer includes Speaker calibration copy" $?

grep -q "which speaker is the rep" "$WHISPERER" 2>/dev/null
check "/whisperer includes calibration helper copy" $?

grep -q "ROLE_OPTIONS" "$WHISPERER" 2>/dev/null \
  && grep -q "'rep'" "$WHISPERER" && grep -q "'prospect'" "$WHISPERER" && grep -q "'unknown'" "$WHISPERER"
check "/whisperer includes Rep / Prospect / Unknown options" $?

# Part C — mapping function applied before posting
grep -q "mapCalibratedSpeaker" "$WHISPERER" 2>/dev/null
check "calibration mapping function exists" $?

grep -q "mapCalibratedSpeaker(spk" "$WHISPERER" 2>/dev/null
check "speaker_N mapped to role before /segments" $?

grep -q "setSpeakerRole" "$WHISPERER" 2>/dev/null
check "speaker role setter present" $?

# Day 126 foundations preserved
grep -q "diarize: 'true'" "$WHISPERER" 2>/dev/null
check "diarize=true still present" $?

grep -q "\['bearer', token\]" "$WHISPERER" 2>/dev/null
check "bearer WebSocket subprotocol preserved" $?

grep -q "/segments" "$WHISPERER" 2>/dev/null
check "/segments still posted from web" $?

# API stores calibrated diarised origin (optional, non-breaking)
grep -q "diarizedSpeaker" "$WROUTE" 2>/dev/null
check "API stores diarised origin (diarizedSpeaker)" $?

# Guards
if grep -rq "DEEPGRAM_API_KEY" "$WEB_ROOT/src" 2>/dev/null; then
  check "DEEPGRAM_API_KEY absent from web" 1
else
  check "DEEPGRAM_API_KEY absent from web" 0
fi

if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$WHISPERER" "$WROUTE" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

# Earlier flow intact
bash "$WEB_ROOT/scripts/validate-tier-2b-day-126.sh" >/dev/null 2>&1
check "Day 126 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 127 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 127 validation PASSED"
