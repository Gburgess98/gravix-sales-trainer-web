#!/usr/bin/env bash
# Validates the Day 180 coaching Overview diet: calmer /coaching hierarchy
# (primary actions row + Today's priorities) with all manager surfaces still
# present (Review Queue, Coaching Queue, queue-assigned sparring, AI Discovery,
# Whisperer Insights), and no scope creep (no TTS/voice-agent additions, no new
# whisperer surface, no migrations).
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
SRC="$WEB_ROOT/src"
COACHING="$SRC/app/coaching/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 180 — own checks only (use validate-tier-2b-smoke for current smoke)"

grep -q "Day 180" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 180" $?

grep -q "Manager Command Centre" "$COACHING" 2>/dev/null
check "/coaching still includes Manager Command Centre" $?

grep -q "Upload Call" "$COACHING" 2>/dev/null
check "/coaching still includes Upload Call" $?

grep -q "Review Queue" "$COACHING" 2>/dev/null
check "/coaching still includes Review Queue" $?

grep -q "Coaching Queue" "$COACHING" 2>/dev/null
check "/coaching still includes Coaching Queue" $?

grep -q "AI Discovery" "$COACHING" 2>/dev/null
check "/coaching still includes AI Discovery" $?

grep -q "Whisperer Insights" "$COACHING" 2>/dev/null
check "/coaching still includes Whisperer Insights" $?

grep -qi "queue-assigned sparring" "$COACHING" 2>/dev/null
check "/coaching still includes Queue-assigned sparring" $?

[[ -f "$WEB_ROOT/scripts/validate-tier-2b-smoke.sh" ]]
check "validate-tier-2b-smoke still exists" $?

! grep -rni "elevenlabs\|voice agent\|text-to-speech" "$SRC/app" "$SRC/components" "$SRC/lib" --include='*.ts*' >/dev/null 2>&1
check "no ElevenLabs/TTS/Voice Agent added" $?

# No new whisperer surface beyond the existing page/components.
WHISPER_DIRS=$(find "$SRC/app" -maxdepth 1 -type d -iname "*whisper*" | wc -l | tr -d ' ')
[[ "$WHISPER_DIRS" == "1" ]]
check "no new Whisperer route expansion (only /whisperer)" $?

# No migrations in the WEB repo.
! find "$WEB_ROOT/scripts" "$SRC" -iname "*migration*" -o -iname "*migrate*" 2>/dev/null | grep -q .
check "no migration added" $?

if [[ "$fail" == "0" ]]; then
  echo "✅ Day 180 premium UX validation PASSED"
  exit 0
else
  echo "❌ Day 180 premium UX validation FAILED"
  exit 1
fi
