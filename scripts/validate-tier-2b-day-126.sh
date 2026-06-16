#!/usr/bin/env bash
# Validates the Day 126 Tier 2B deliverables: Deepgram speaker diarisation +
# provisional speaker labelling foundation. Live mic proof remains a manual gate.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
WHISPERER="$WEB_ROOT/src/app/whisperer/page.tsx"
WROUTE="$API_ROOT/src/routes/whisperer.ts"
ENGINE="$API_ROOT/src/whisperer/triggers.ts"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

# Part B — diarisation parameter added to the Deepgram WS URL
grep -q "diarize: 'true'" "$WHISPERER" 2>/dev/null
check "Deepgram URL includes diarize=true" $?

# bearer subprotocol still present (Day 117 auth fix preserved)
grep -q "\['bearer', token\]" "$WHISPERER" 2>/dev/null
check "bearer WebSocket subprotocol preserved" $?

# No raw Deepgram key in the web app
if grep -rq "DEEPGRAM_API_KEY" "$WEB_ROOT/src" 2>/dev/null; then
  check "DEEPGRAM_API_KEY absent from web" 1
else
  check "DEEPGRAM_API_KEY absent from web" 0
fi

# Part C/D — speaker parsing + display
grep -q "dominantSpeaker" "$WHISPERER" 2>/dev/null
check "diarisation speaker parsing (dominantSpeaker) present" $?

grep -q "formatSpeaker" "$WHISPERER" 2>/dev/null
check "transcript renders Speaker label (formatSpeaker)" $?

grep -qi "provisional" "$WHISPERER" 2>/dev/null
check "transcript includes provisional speaker copy" $?

# /segments still posts final segments
grep -q "/segments" "$WHISPERER" 2>/dev/null
check "/segments still posted from web" $?

# Part E — API stores label + only rep speech is suppressed
grep -q "speakerLabel" "$WROUTE" 2>/dev/null
check "API stores original speaker label (speakerLabel)" $?

grep -q "detectionSpeaker" "$WROUTE" 2>/dev/null
check "API derives a detection speaker (detectionSpeaker)" $?

grep -q 'speaker === "rep"' "$ENGINE" 2>/dev/null
check "rep-speech suppression preserved" $?

# No LLM on the live hot path (/segments handler)
python3 - "$WROUTE" <<'PY'
import re, sys
src = open(sys.argv[1]).read()
m = re.search(r'router\.post\("/sessions/:id/segments".*?(?=\nrouter\.(?:post|get|patch|delete)\()', src, re.S)
block = m.group(0) if m else ""
hit = re.search(r'openai|chat\.completions|responses\.create|client\.responses', block, re.I)
sys.exit(1 if hit else 0)
PY
check "no LLM on live hot path (/segments)" $?

# No ElevenLabs / TTS / Voice Agent introduced
if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$WHISPERER" "$WROUTE" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

# Earlier flow intact
bash "$WEB_ROOT/scripts/validate-tier-2b-day-125.sh" >/dev/null 2>&1
check "Day 125 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 126 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 126 validation PASSED"
