#!/usr/bin/env bash
# Validates the Day 183 call-detail premium pass on /calls/[id]: header
# typography aligned to the shell (text-xl + break-words, score still inline),
# primary CTA (Save Assignment) standardised to calm indigo, the Assign Coaching
# secondary button moved off emerald-outline (emerald reserved for status pills),
# processing-banner emoji removed, and all key behaviours preserved (Mark
# Reviewed, Assign Coaching, pins calm empty state, Whisperer Moments) with no
# scope creep (no migrations, no TTS/voice-agent, review demo routes untouched).
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
SRC="$WEB_ROOT/src"
CALL="$SRC/app/calls/[id]/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 183 — own checks only (use validate-tier-2b-smoke for current smoke)"

grep -q "Day 183" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 183" $?

# --- Header typography aligned to the shell ---
grep -q 'text-xl font-semibold break-words flex items-center gap-3' "$CALL" 2>/dev/null
check "/calls/[id] header uses text-xl + break-words" $?

! grep -q 'text-2xl font-semibold break-all' "$CALL" 2>/dev/null
check "/calls/[id] header no longer text-2xl/break-all" $?

# Human-friendly title + inline score preserved.
grep -q 'formatCallDisplayTitle' "$CALL" 2>/dev/null
check "/calls/[id] keeps human-friendly title (formatCallDisplayTitle)" $?
grep -q '<ScorePill score={overall}' "$CALL" 2>/dev/null
check "/calls/[id] keeps score inline in header" $?

# Raw filename stays subtle only.
grep -q 'text-xs text-neutral-600 truncate max-w-\[16rem\]' "$CALL" 2>/dev/null
check "/calls/[id] raw filename stays subtle" $?

# --- Primary CTA to calm indigo ---
grep -q 'bg-indigo-600 text-white hover:bg-indigo-500' "$CALL" 2>/dev/null
check "/calls/[id] Save Assignment CTA is calm indigo" $?
! grep -q 'bg-emerald-600 hover:bg-emerald-500' "$CALL" 2>/dev/null
check "/calls/[id] Save Assignment no longer solid emerald" $?

# --- Emerald-outline secondary cleanup begun ---
# The Assign Coaching action button should no longer use the emerald-outline
# action treatment; emerald remains only for status pills.
! grep -q 'text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20' "$CALL" 2>/dev/null
check "/calls/[id] Assign Coaching button off emerald-outline" $?

# --- Processing banner de-arcaded (no emoji in the status labels) ---
! grep -qE '(🎧|📝|🤖|⚠️|⏳)' "$CALL" 2>/dev/null
check "/calls/[id] processing banner emoji removed" $?
grep -q '>Transcribing call…<' "$CALL" 2>/dev/null
check "/calls/[id] processing banner keeps calm status text" $?

# --- Preserved behaviour ---
grep -q 'markCallReviewed' "$CALL" 2>/dev/null
check "/calls/[id] preserves Mark Reviewed" $?
grep -q 'assignCoachingFromCall' "$CALL" 2>/dev/null
check "/calls/[id] preserves Assign Coaching" $?
grep -q 'No pinned coaching notes yet.' "$CALL" 2>/dev/null
check "/calls/[id] preserves pins calm empty state" $?
grep -q 'Whisperer Moments' "$CALL" 2>/dev/null
check "/calls/[id] preserves Whisperer Moments" $?
grep -q 'audioRef\|audioUrl\|signedUrl\|signed_url\|<audio' "$CALL" 2>/dev/null
check "/calls/[id] preserves audio/player + signed URL handling" $?

# --- Scope guards ---
[[ -f "$WEB_ROOT/scripts/validate-tier-2b-smoke.sh" ]]
check "validate-tier-2b-smoke still exists" $?

! grep -rni "elevenlabs\|voice agent\|text-to-speech" "$SRC/app" "$SRC/components" "$SRC/lib" --include='*.ts*' >/dev/null 2>&1
check "no ElevenLabs/TTS/Voice Agent added" $?

! find "$WEB_ROOT/scripts" "$SRC" -iname "*migration*" -o -iname "*migrate*" 2>/dev/null | grep -q .
check "no migration added" $?

if [[ "$fail" == "0" ]]; then
  echo "✅ Day 183 premium UX validation PASSED"
  exit 0
else
  echo "❌ Day 183 premium UX validation FAILED"
  exit 1
fi
