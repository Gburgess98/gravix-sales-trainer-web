#!/usr/bin/env bash
# Validates the Day 184 orphaned review-route cleanup: the two /review/* demo
# routes now redirect to the real review path instead of exposing mock data or a
# proxy-bypassing direct API fetch. /review/timeline -> /coaching?tab=review,
# /review/[callId]/timeline -> /calls/[callId]. Confirms the mock data + the
# NEXT_PUBLIC_API_URL fetch are gone, the real paths are preserved, and no scope
# creep (no migrations, no TTS/voice-agent).
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
SRC="$WEB_ROOT/src"
RT="$SRC/app/review/timeline/page.tsx"
RC="$SRC/app/review/[callId]/timeline/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 184 — own checks only (use validate-tier-2b-smoke for current smoke)"

grep -q "Day 184" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 184" $?

# --- /review/timeline is now a redirect to the real Review Queue ---
grep -q 'redirect("/coaching?tab=review")' "$RT" 2>/dev/null
check "/review/timeline redirects to /coaching?tab=review" $?

! grep -q 'DEMO_TRANSCRIPT\|DEMO_AUDIO\|pixabay' "$RT" 2>/dev/null
check "/review/timeline mock data removed" $?

! grep -q '"use client"' "$RT" 2>/dev/null
check "/review/timeline is a server component (no use client)" $?

# --- /review/[callId]/timeline is now a redirect to the real call page ---
grep -q 'redirect(`/calls/${params.callId}`)' "$RC" 2>/dev/null
check "/review/[callId]/timeline redirects to /calls/[callId]" $?

! grep -q 'NEXT_PUBLIC_API_URL' "$RC" 2>/dev/null
check "/review/[callId]/timeline no longer bypasses /api/proxy" $?

! grep -q 'TranscriptPlayer' "$RC" 2>/dev/null
check "/review/[callId]/timeline drops mismatched TranscriptPlayer import" $?

# --- No source references to the unsupported /review/* surfaces ---
# (SHELL_PATHS '/review' prefix is allowed; anything linking into the routes is not.)
! grep -rn "review/timeline" "$SRC" --include='*.ts*' | grep -v 'app/review/' >/dev/null 2>&1
check "no source links into /review/*/timeline remain" $?

# --- Real review path preserved ---
grep -rq "tab=review" "$SRC/app/coaching/page.tsx" 2>/dev/null
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
  echo "✅ Day 184 premium UX validation PASSED"
  exit 0
else
  echo "❌ Day 184 premium UX validation FAILED"
  exit 1
fi
