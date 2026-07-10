#!/usr/bin/env bash
# Validates the Day 205A pre-demo hygiene checkpoint (NOT a visual pass):
#  - proven-dead lib/api exports removed (setScore, listAdminReps,
#    patchAdminRepTier, AdminRepRow, getSparringSessionsByRep + its
#    SparringSessionSummary type) — all had zero references anywhere;
#  - stale '/reps' entry dropped from the smoke spec (no '/reps' index route
#    exists — only '/reps/[id]', a Day 193 redirect stub);
#  - build warnings + orphaned '/crm/Leaderboard' recorded as known
#    non-blockers in DEMO_VISUAL_QA_NOTES.md.
# WEB-only, patch mode — no API, no migrations, no new features, no behaviour
# change. Negative checks (dead code gone) are paired with positive guards so
# an over-delete is caught.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
PKG="$WEB_ROOT/package.json"
NOTES="$WEB_ROOT/DEMO_VISUAL_QA_NOTES.md"
API="$WEB_ROOT/src/lib/api.ts"
SMOKE="$WEB_ROOT/tests/e2e/smoke.spec.ts"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 205A — own checks only (use validate-tier-2b-smoke for current smoke)"

# --- Documentation + wiring ---
grep -q 'Day 205A' "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 205A note" $?
grep -q '"validate-premium-ux-day-205a"' "$PKG" 2>/dev/null
check "package.json has validate-premium-ux-day-205a script" $?
test -f "$NOTES"
check "DEMO_VISUAL_QA_NOTES.md exists" $?
grep -q 'Known non-blockers' "$NOTES" 2>/dev/null
check "notes record known non-blockers" $?

# --- Dead lib/api exports removed (negative checks) ---
! grep -q 'export async function setScore' "$API" 2>/dev/null
check "lib/api: setScore removed" $?
! grep -q 'export async function listAdminReps' "$API" 2>/dev/null
check "lib/api: listAdminReps removed" $?
! grep -q 'export async function patchAdminRepTier' "$API" 2>/dev/null
check "lib/api: patchAdminRepTier removed" $?
! grep -q 'export type AdminRepRow' "$API" 2>/dev/null
check "lib/api: AdminRepRow type removed" $?
! grep -q 'export async function getSparringSessionsByRep' "$API" 2>/dev/null
check "lib/api: getSparringSessionsByRep removed" $?

# --- Positive guards: did NOT over-delete adjacent live exports ---
grep -q 'export async function getScoreHistory' "$API" 2>/dev/null
check "lib/api: getScoreHistory preserved (used by /calls/[id])" $?
grep -q 'export async function scoreSparring' "$API" 2>/dev/null
check "lib/api: scoreSparring preserved" $?
grep -q 'export async function listTeamUsers' "$API" 2>/dev/null
check "lib/api: listTeamUsers preserved" $?

# --- Smoke spec: stale /reps entry dropped, live entries preserved ---
! grep -qE "path: *'/reps'" "$SMOKE" 2>/dev/null
check "smoke spec: stale /reps entry dropped" $?
grep -qE "path: *'/dashboard'" "$SMOKE" 2>/dev/null
check "smoke spec: /dashboard entry preserved" $?
grep -qE "path: *'/crm/actions'" "$SMOKE" 2>/dev/null
check "smoke spec: /crm/actions entry preserved" $?

# --- /reps/[id] redirect stub still present (route not disturbed) ---
test -f "$WEB_ROOT/src/app/reps/[id]/page.tsx"
check "reps/[id] redirect stub still present" $?

if [[ "$fail" == "0" ]]; then
  echo "Day 205A validation PASSED"
else
  echo "Day 205A validation FAILED"
  exit 1
fi
