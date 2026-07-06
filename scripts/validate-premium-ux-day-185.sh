#!/usr/bin/env bash
# Validates the Day 185 dead-code + shell-path cleanup: the Day 184 /review/*
# redirect stubs are kept, the vestigial /review SHELL_PATHS entry is dropped,
# the unused TranscriptPlayer component is deleted, and no mock/proxy-bypass
# surface remains. No scope creep (no migrations, no TTS/voice-agent).
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
SRC="$WEB_ROOT/src"
NAV="$SRC/config/navigation.ts"
RT="$SRC/app/review/timeline/page.tsx"
RC="$SRC/app/review/[callId]/timeline/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 185 — own checks only (use validate-tier-2b-smoke for current smoke)"

grep -q "Day 185" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 185" $?

# --- No mock/demo leftovers anywhere in source ---
! grep -rn "cdn.pixabay.com" "$SRC" >/dev/null 2>&1
check "no source references to cdn.pixabay.com" $?

! grep -rn "DEMO_TRANSCRIPT" "$SRC" >/dev/null 2>&1
check "no source references to DEMO_TRANSCRIPT" $?

! grep -rn "DEMO_AUDIO" "$SRC" >/dev/null 2>&1
check "no source references to DEMO_AUDIO" $?

# --- No stray links into the /review/*/timeline routes (route files excepted) ---
! grep -rn "review/timeline" "$SRC" --include='*.ts*' | grep -v 'app/review/' >/dev/null 2>&1
check "no source references to /review/timeline outside the route" $?

! grep -rn "review/\[callId\]/timeline" "$SRC" --include='*.ts*' | grep -v 'app/review/' >/dev/null 2>&1
check "no source references to /review/[callId]/timeline outside the route" $?

# --- Redirect stubs still present (kept for old/bookmarked links) ---
grep -q 'redirect("/coaching?tab=review")' "$RT" 2>/dev/null
check "/review/timeline redirect still exists" $?

grep -q 'redirect(`/calls/${params.callId}`)' "$RC" 2>/dev/null
check "/review/[callId]/timeline redirect still exists" $?

# --- No proxy bypass reintroduced in the review routes ---
! grep -q 'NEXT_PUBLIC_API_URL' "$RT" "$RC" 2>/dev/null
check "no direct NEXT_PUBLIC_API_URL fetch in review routes" $?

# --- Dead code removed ---
[[ ! -f "$SRC/components/TranscriptPlayer.tsx" ]]
check "unused TranscriptPlayer component removed" $?

! grep -rn "TranscriptPlayer" "$SRC" >/dev/null 2>&1
check "no remaining TranscriptPlayer references" $?

# --- /review dropped from SHELL_PATHS ---
! grep -qE "^\s*'/review',\s*$" "$NAV" 2>/dev/null
check "/review removed from SHELL_PATHS" $?

# --- Real review path preserved ---
grep -q "tab=review" "$SRC/app/coaching/page.tsx" 2>/dev/null
check "real Review Queue path (/coaching?tab=review) preserved" $?

[[ -f "$SRC/app/calls/[id]/page.tsx" ]]
check "real call review page (/calls/[id]) preserved" $?

# --- Scope guards ---
[[ -f "$WEB_ROOT/scripts/validate-tier-2b-smoke.sh" ]]
check "validate-tier-2b-smoke still exists" $?

! grep -rni "elevenlabs\|voice agent\|text-to-speech" "$SRC/app" "$SRC/components" "$SRC/lib" --include='*.ts*' >/dev/null 2>&1
check "no ElevenLabs/TTS/Voice Agent added" $?

! find "$WEB_ROOT/scripts" "$SRC" -iname "*migration*" -o -iname "*migrate*" 2>/dev/null | grep -q .
check "no migration added" $?

if [[ "$fail" == "0" ]]; then
  echo "✅ Day 185 premium UX validation PASSED"
  exit 0
else
  echo "❌ Day 185 premium UX validation FAILED"
  exit 1
fi
