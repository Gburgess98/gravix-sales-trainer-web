#!/usr/bin/env bash
# Validates the Day 178 premium navigation + trust cleanup: dead sparring links fixed,
# Sparring/Calls nav destinations distinct, core nav entries preserved, and no scope
# creep (no TTS/voice-agent additions, no new whisperer surface, no migrations).
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
NAV="$WEB_ROOT/src/config/navigation.ts"
SRC="$WEB_ROOT/src"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 178 — own checks only (use validate-tier-2b-smoke for current smoke)"

grep -q "Day 178" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 178" $?

# No /sparring/new link targets remain (route unsupported) unless the route now exists.
if [[ -e "$SRC/app/sparring/new" ]]; then
  check "no /sparring/new links (route exists, allowed)" 0
else
  ! grep -rn 'sparring/new' "$SRC/app" "$SRC/components" --include='*.tsx' >/dev/null 2>&1
  check "no /sparring/new references remain in source" $?
fi

# /sparring links must resolve: either an index route exists or no bare links remain.
[[ -f "$SRC/app/sparring/page.tsx" ]] || ! grep -rn 'href="/sparring"' "$SRC/app" "$SRC/components" >/dev/null 2>&1
check "/sparring resolves (index redirect exists or no bare links remain)" $?

# Sparring and Calls must not both map to the exact same unqualified /call-library.
SPARRING_HREF=$(grep -o "label: 'Sparring', href: '[^']*'" "$NAV" | sed "s/.*href: '\([^']*\)'.*/\1/")
CALLS_HREF=$(grep -o "label: 'Calls', href: '[^']*'" "$NAV" | sed "s/.*href: '\([^']*\)'.*/\1/")
[[ -n "$SPARRING_HREF" && "$SPARRING_HREF" != "$CALLS_HREF" ]]
check "nav Sparring ($SPARRING_HREF) differs from Calls ($CALLS_HREF)" $?

grep -q "label: 'Upload Call'" "$NAV" 2>/dev/null
check "Upload Call nav entry still exists" $?

grep -q "label: 'Command Centre'" "$NAV" 2>/dev/null
check "Command Centre nav entry still exists" $?

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
  echo "✅ Day 178 premium UX validation PASSED"
  exit 0
else
  echo "❌ Day 178 premium UX validation FAILED"
  exit 1
fi
