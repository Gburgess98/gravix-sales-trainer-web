#!/usr/bin/env bash
# Validates the Day 193 orphaned rep route cleanup: the two orphaned non-CRM
# rep routes (/reps/[id], /reps/[id]/sparring) replaced with server redirects to
# the active /crm/reps/[id], while the active /admin/reps + /crm/reps/[id]
# surfaces are preserved.
# WEB-only, patch mode — no API, no migrations, no new features, no behaviour change.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
SRC="$WEB_ROOT/src"
REP_LEGACY="$SRC/app/reps/[id]/page.tsx"
REP_SPAR_LEGACY="$SRC/app/reps/[id]/sparring/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 193 — own checks only (use validate-tier-2b-smoke for current smoke)"

grep -q "Day 193" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 193" $?

# --- Legacy rep routes are now redirect stubs ---
[[ -f "$REP_LEGACY" ]]
check "/reps/[id]/page.tsx still present (stub)" $?
grep -q 'redirect(`/crm/reps/' "$REP_LEGACY" 2>/dev/null
check "/reps/[id] redirects to /crm/reps/[id]" $?
# stub is tiny — legacy 1300-line client page is gone
[[ "$(wc -l < "$REP_LEGACY")" -lt 30 ]]
check "/reps/[id] legacy client page removed (stub is small)" $?
! grep -q "'use client'" "$REP_LEGACY" 2>/dev/null
check "/reps/[id] no longer a client component" $?

[[ -f "$REP_SPAR_LEGACY" ]]
check "/reps/[id]/sparring/page.tsx still present (stub)" $?
grep -q 'redirect(`/crm/reps/' "$REP_SPAR_LEGACY" 2>/dev/null
check "/reps/[id]/sparring redirects to active rep surface" $?
[[ "$(wc -l < "$REP_SPAR_LEGACY")" -lt 30 ]]
check "/reps/[id]/sparring legacy list removed (stub is small)" $?

# --- Active surfaces preserved ---
[[ -f "$SRC/app/crm/reps/[id]/page.tsx" ]]
check "active /crm/reps/[id] preserved" $?
[[ -f "$SRC/app/admin/reps/page.tsx" ]]
check "active /admin/reps preserved (kept, documented)" $?
grep -q 'href="/admin/reps"' "$SRC/components/HomeLanding.tsx" 2>/dev/null
check "/admin/reps still linked from HomeLanding (manager journey intact)" $?

# --- No stray inbound page links to the retired /reps/[id] routes ---
# (Only the redirect stubs themselves may mention /crm/reps/; nothing should
#  href/push into the old /reps/[id] page any more.)
! grep -rn 'href={`/reps/\|href="/reps/\|push(`/reps/\|push("/reps/' "$SRC" --include='*.tsx' --include='*.ts' | grep -v '/crm/reps' | grep -q .
check "no inbound page links to legacy /reps/[id] remain" $?

# --- Scope guards ---
[[ -f "$WEB_ROOT/scripts/validate-tier-2b-smoke.sh" ]]
check "validate-tier-2b-smoke still exists" $?

! find "$WEB_ROOT/scripts" "$SRC" -iname "*migration*" -o -iname "*migrate*" 2>/dev/null | grep -q .
check "no migration added" $?

if [[ "$fail" == "0" ]]; then
  echo "✅ Day 193 premium UX validation PASSED"
  exit 0
else
  echo "❌ Day 193 premium UX validation FAILED"
  exit 1
fi
