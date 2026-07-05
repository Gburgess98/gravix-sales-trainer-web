#!/usr/bin/env bash
# Validates the Day 181 coaching Overview final cleanup: PageContainer/PageHeader
# adopted on /coaching, Today's priorities alignment fix, Whisperer suggestion
# quality detail + reviewed-candidate history collapsed, with all Day 180
# manager surfaces still present and no scope creep (no TTS/voice-agent
# additions, no new whisperer surface, no migrations).
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

echo "Premium UX / Day 181 — own checks only (use validate-tier-2b-smoke for current smoke)"

grep -q "Day 181" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 181" $?

grep -q "PageContainer" "$COACHING" 2>/dev/null
check "/coaching uses PageContainer" $?

grep -q "PageHeader" "$COACHING" 2>/dev/null
check "/coaching uses PageHeader" $?

grep -q "Suggestion quality detail" "$COACHING" 2>/dev/null
check "/coaching Whisperer suggestion quality detail is collapsible" $?

grep -q "more reviewed candidate" "$COACHING" 2>/dev/null
check "/coaching reviewed-candidate history capped with Show more" $?

# Day 180 surfaces all still present.
for label in "Manager Command Centre" "Upload Call" "Review Queue" "Coaching Queue" "AI Discovery" "Whisperer Insights"; do
  grep -q "$label" "$COACHING" 2>/dev/null
  check "/coaching still includes $label" $?
done
grep -qi "queue-assigned sparring" "$COACHING" 2>/dev/null
check "/coaching still includes Queue-assigned sparring" $?

[[ -f "$WEB_ROOT/scripts/validate-tier-2b-smoke.sh" ]]
check "validate-tier-2b-smoke still exists" $?

! grep -rni "elevenlabs\|voice agent\|text-to-speech" "$SRC/app" "$SRC/components" "$SRC/lib" --include='*.ts*' >/dev/null 2>&1
check "no ElevenLabs/TTS/Voice Agent added" $?

WHISPER_DIRS=$(find "$SRC/app" -maxdepth 1 -type d -iname "*whisper*" | wc -l | tr -d ' ')
[[ "$WHISPER_DIRS" == "1" ]]
check "no new Whisperer route expansion (only /whisperer)" $?

! find "$WEB_ROOT/scripts" "$SRC" -iname "*migration*" -o -iname "*migrate*" 2>/dev/null | grep -q .
check "no migration added" $?

if [[ "$fail" == "0" ]]; then
  echo "✅ Day 181 premium UX validation PASSED"
  exit 0
else
  echo "❌ Day 181 premium UX validation FAILED"
  exit 1
fi
