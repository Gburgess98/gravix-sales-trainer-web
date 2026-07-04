#!/usr/bin/env bash
# Validates the Day 179 premium layout consistency pass: PageContainer/PageHeader
# adopted on /call-library, /assignments and /settings/profile, fake Skill Momentum
# bar widths removed from the dashboard, and no scope creep (no TTS/voice-agent
# additions, no new whisperer surface, no migrations).
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
SRC="$WEB_ROOT/src"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 179 — own checks only (use validate-tier-2b-smoke for current smoke)"

grep -q "Day 179" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 179" $?

grep -q "PageContainer" "$SRC/app/call-library/page.tsx" 2>/dev/null
check "/call-library uses PageContainer" $?

grep -q "PageContainer" "$SRC/app/assignments/AssignmentsClient.tsx" 2>/dev/null
check "/assignments uses PageContainer" $?

grep -q "PageContainer" "$SRC/app/settings/profile/page.tsx" 2>/dev/null
check "/settings/profile uses PageContainer" $?

# Fake Skill Momentum bars removed: the hard-coded per-status widths lived in
# skillBarPct on the dashboard.
! grep -q "skillBarPct" "$SRC/app/dashboard/page.tsx" 2>/dev/null
check "no hard-coded Skill Momentum bar widths (skillBarPct removed)" $?

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
  echo "✅ Day 179 premium UX validation PASSED"
  exit 0
else
  echo "❌ Day 179 premium UX validation FAILED"
  exit 1
fi
