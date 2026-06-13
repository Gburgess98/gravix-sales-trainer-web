#!/usr/bin/env bash
# Validates the Day 112 Tier 2B deliverables: live listener v1.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
ROUTE="$API_ROOT/src/routes/whisperer.ts"
PAGE="$WEB_ROOT/src/app/whisperer/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

grep -q 'router.post("/deepgram-token"' "$ROUTE" 2>/dev/null
check "POST /v1/whisperer/deepgram-token exists" $?

grep -q "DEEPGRAM_API_KEY" "$ROUTE" 2>/dev/null
check "DEEPGRAM_API_KEY referenced in API route" $?

# Key must NEVER appear in any web source
if grep -rq "DEEPGRAM_API_KEY" "$WEB_ROOT/src" 2>/dev/null; then
  check "DEEPGRAM_API_KEY absent from web source" 1
else
  check "DEEPGRAM_API_KEY absent from web source" 0
fi

grep -q "deepgram_not_configured" "$ROUTE" 2>/dev/null
check "controlled deepgram_not_configured error" $?

grep -q "Start listening" "$PAGE" 2>/dev/null
check "/whisperer includes Start listening" $?

grep -q "Stop listening" "$PAGE" 2>/dev/null
check "/whisperer includes Stop listening" $?

grep -q "Manual Simulator" "$PAGE" 2>/dev/null
check "/whisperer includes Manual Simulator mode" $?

grep -q "getUserMedia" "$PAGE" 2>/dev/null
check "/whisperer uses getUserMedia" $?

grep -q "new WebSocket(" "$PAGE" 2>/dev/null
check "/whisperer opens a Deepgram WebSocket" $?

grep -q "deepgram-token" "$PAGE" 2>/dev/null
check "/whisperer fetches the short-lived token" $?

grep -q "/segments" "$PAGE" 2>/dev/null
check "/whisperer still posts final segments to /segments" $?

grep -q 'router.post("/sessions/:id/segments"' "$ROUTE" 2>/dev/null
check "/segments route still exists" $?

grep -q 'router.post("/preview"' "$ROUTE" 2>/dev/null
check "/preview route still exists" $?

if grep -riqE "elevenlabs|voice.agent|text.to.speech" "$PAGE" "$ROUTE" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent references" 1
else
  check "no ElevenLabs/TTS/Voice Agent references" 0
fi

bash "$WEB_ROOT/scripts/validate-tier-2b-day-111.sh" >/dev/null 2>&1
check "Day 111 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 112 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 112 validation PASSED"
