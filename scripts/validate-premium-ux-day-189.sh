#!/usr/bin/env bash
# Validates the Day 189 direct-backend-fetch / proxy-bypass sweep: the three
# orphaned bypass files removed (calls/[id]/Player.tsx, calls/route.ts,
# api/calls/route.ts) and no executable direct-backend fetch remaining in
# app/components/lib. Safe proxy-bound helpers (adminConfig, contacts/nudges
# INTERNAL_API_BASE_URL) preserved.
# WEB-only, patch mode — no API, no migrations, no new features.
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

echo "Premium UX / Day 189 — own checks only (use validate-tier-2b-smoke for current smoke)"

grep -q "Day 189" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 189" $?

# --- The three orphaned bypass files are gone ---
[[ ! -e "$SRC/app/calls/[id]/Player.tsx" ]]
check "calls/[id]/Player.tsx removed" $?
[[ ! -e "$SRC/app/calls/route.ts" ]]
check "calls/route.ts removed" $?
[[ ! -e "$SRC/app/api/calls/route.ts" ]]
check "api/calls/route.ts removed" $?

# --- No executable direct-backend fetch bypass remains anywhere in src ---
# (BACKEND_BASE / API_BASE / NEXT_PUBLIC_API_URL / NEXT_PUBLIC_API_BASE used
#  directly as a fetch base). Comments/debug logs are tolerated.
! grep -rnE 'fetch\(`\$\{(process\.env\.BACKEND_BASE|API_BASE|process\.env\.NEXT_PUBLIC_API_URL|process\.env\.NEXT_PUBLIC_API_BASE)\}' \
    "$SRC" --include='*.ts' --include='*.tsx' | grep -q .
check "no fetch(\${BACKEND_BASE|API_BASE|NEXT_PUBLIC_API_*}) remains" $?

! grep -rn 'process\.env\.BACKEND_BASE' "$SRC/app" --include='*.ts' --include='*.tsx' | grep -q .
check "no BACKEND_BASE usage remains under app/" $?

# NEXT_PUBLIC_API_BASE may only survive as a debug log + the config helper —
# never as a fetch target. Assert it never appears on a fetch( line.
! grep -rn 'NEXT_PUBLIC_API_BASE' "$SRC" --include='*.ts' --include='*.tsx' \
    | grep 'fetch(' | grep -q .
check "NEXT_PUBLIC_API_BASE never on a fetch() line" $?

# --- Safe proxy-bound patterns preserved (not accidentally broken) ---
grep -q 'API_URL = "/api/proxy"' "$SRC/lib/Admin/adminConfig.ts" 2>/dev/null
check "adminConfig still proxy-bound (API_URL=/api/proxy)" $?
grep -q '/api/proxy' "$SRC/app/crm/manager/nudges/page.tsx" 2>/dev/null
check "nudges page still hits own /api/proxy" $?
grep -q '/api/proxy' "$SRC/app/crm/contacts/[id]/page.tsx" 2>/dev/null
check "contacts detail still hits own /api/proxy" $?

# --- Active /calls/[id] audio still proxy-bound ---
grep -q 'api(`/v1/calls/' "$SRC/app/calls/[id]/page.tsx" 2>/dev/null || \
  grep -q '/api/proxy' "$SRC/app/calls/[id]/page.tsx" 2>/dev/null
check "/calls/[id] audio/data path still via /api/proxy" $?

# --- Scope guards ---
[[ -f "$WEB_ROOT/scripts/validate-tier-2b-smoke.sh" ]]
check "validate-tier-2b-smoke still exists" $?

! grep -rni "elevenlabs\|voice agent\|text-to-speech" "$SRC/app" "$SRC/components" "$SRC/lib" --include='*.ts*' >/dev/null 2>&1
check "no ElevenLabs/TTS/Voice Agent added" $?

! find "$WEB_ROOT/scripts" "$SRC" -iname "*migration*" -o -iname "*migrate*" 2>/dev/null | grep -q .
check "no migration added" $?

if [[ "$fail" == "0" ]]; then
  echo "✅ Day 189 premium UX validation PASSED"
  exit 0
else
  echo "❌ Day 189 premium UX validation FAILED"
  exit 1
fi
