#!/usr/bin/env bash
# Validates the Day 188 CRM auto-assign legacy-route cleanup: the three orphaned
# /crm/manager/auto-assign pages retired to server redirects -> /crm/manager,
# removing the NEXT_PUBLIC_API_URL proxy bypass and the light-theme outlier while
# preserving the live auto-assign UI on the Team page.
# WEB-only, patch mode — no API, no migrations, no new features.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
SRC="$WEB_ROOT/src"
AA="$SRC/app/crm/manager/auto-assign/page.tsx"
AARUNS="$SRC/app/crm/manager/auto-assign/runs/page.tsx"
AADETAIL="$SRC/app/crm/manager/auto-assign/runs/[run_id]/page.tsx"
MGRCLIENT="$SRC/app/crm/manager/ManagerClient.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 188 — own checks only (use validate-tier-2b-smoke for current smoke)"

grep -q "Day 188" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 188" $?

# --- All three auto-assign pages are now redirect stubs to /crm/manager ---
for f in "$AA" "$AARUNS" "$AADETAIL"; do
  [[ -f "$f" ]]
  check "exists: ${f#$WEB_ROOT/}" $?
  grep -q "redirect('/crm/manager')" "$f" 2>/dev/null
  check "redirects to /crm/manager: ${f#$WEB_ROOT/}" $?
  grep -q "import { redirect } from 'next/navigation'" "$f" 2>/dev/null
  check "uses next/navigation redirect: ${f#$WEB_ROOT/}" $?
done

# --- Proxy bypass fully removed (no executable NEXT_PUBLIC_API_URL / fetch) ---
# Comments may mention it; assert no code line calls it.
! grep -nE '^[^/]*\bfetch\(' "$AA" "$AARUNS" "$AADETAIL" 2>/dev/null | grep -q .
check "no fetch() call remains in any auto-assign page" $?
! grep -nE '^[^/]*NEXT_PUBLIC_API_URL' "$AA" "$AARUNS" "$AADETAIL" 2>/dev/null | grep -q .
check "no NEXT_PUBLIC_API_URL code remains in auto-assign pages" $?
! grep -nE '^[^/]*(absoluteUrl|/api/proxy)' "$AA" "$AARUNS" "$AADETAIL" 2>/dev/null | grep -q .
check "no /api/proxy or absoluteUrl code remains in auto-assign pages" $?

# --- Live auto-assign surface preserved on the Team page ---
grep -q 'RunHistoryTable' "$MGRCLIENT" 2>/dev/null
check "Team page keeps RunHistoryTable (live auto-assign UI)" $?
grep -q '/api/proxy/v1/crm/manager/auto-assign/run' "$MGRCLIENT" 2>/dev/null
check "Team page keeps live auto-assign /api/proxy calls" $?
grep -q 'runBatchAssign' "$MGRCLIENT" 2>/dev/null
check "Team page preserves batch-assign handler" $?

# --- Scope guards ---
[[ -f "$WEB_ROOT/scripts/validate-tier-2b-smoke.sh" ]]
check "validate-tier-2b-smoke still exists" $?

! grep -rni "elevenlabs\|voice agent\|text-to-speech" "$SRC/app" "$SRC/components" "$SRC/lib" --include='*.ts*' >/dev/null 2>&1
check "no ElevenLabs/TTS/Voice Agent added" $?

! find "$WEB_ROOT/scripts" "$SRC" -iname "*migration*" -o -iname "*migrate*" 2>/dev/null | grep -q .
check "no migration added" $?

if [[ "$fail" == "0" ]]; then
  echo "✅ Day 188 premium UX validation PASSED"
  exit 0
else
  echo "❌ Day 188 premium UX validation FAILED"
  exit 1
fi
