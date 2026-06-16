#!/usr/bin/env bash
# Validates the Day 128 Tier 2B deliverable: client-side silence ("dead air")
# detection stub in Live Whisperer. UI-only — no backend, no migration.
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

# Part B/D — thresholds + cooldown
grep -q "SILENCE_THRESHOLD_MS = 5000" "$WHISPERER" 2>/dev/null
check "SILENCE_THRESHOLD_MS = 5000 exists" $?

grep -q "SILENCE_COOLDOWN_MS = 30000" "$WHISPERER" 2>/dev/null
check "SILENCE_COOLDOWN_MS = 30000 exists" $?

# Part C — copy
grep -q "Dead air detected" "$WHISPERER" 2>/dev/null
check "\"Dead air detected\" copy exists" $?

grep -q "Silence detection is local" "$WHISPERER" 2>/dev/null
check "\"Silence detection is local\" copy exists" $?

# Part D — timer + cleanup
grep -q "silenceTimerRef" "$WHISPERER" 2>/dev/null
check "silence timer ref present" $?

grep -q "clearInterval" "$WHISPERER" 2>/dev/null
check "interval cleanup exists" $?

grep -q "lastSpeechAtRef" "$WHISPERER" 2>/dev/null
check "lastSpeechAtRef present" $?

# Day 126/127 foundations preserved
grep -q "diarize: 'true'" "$WHISPERER" 2>/dev/null
check "diarize=true still present" $?

grep -q "\['bearer', token\]" "$WHISPERER" 2>/dev/null
check "bearer WebSocket subprotocol preserved" $?

grep -q "Speaker calibration" "$WHISPERER" 2>/dev/null
check "speaker calibration copy still present" $?

# Guards: UI-only, no backend silence work
if grep -riq "silence" "$WROUTE" 2>/dev/null; then
  check "no API silence handling added" 1
else
  check "no API silence handling added" 0
fi

if ls "$API_ROOT"/sql/*silence* >/dev/null 2>&1; then
  check "no backend migration added for silence" 1
else
  check "no backend migration added for silence" 0
fi

if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$WHISPERER" "$WROUTE" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

# Earlier flow intact
bash "$WEB_ROOT/scripts/validate-tier-2b-day-127.sh" >/dev/null 2>&1
check "Day 127 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 128 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 128 validation PASSED"
