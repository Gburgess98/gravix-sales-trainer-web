#!/usr/bin/env bash
# Validates the Day 192 CRM rep detail button-system pass: the active
# /crm/reps/[id] rep profile had its mixed-colour CTAs calmed to indigo/neutral
# while green stays reserved for status/success, header + behaviour preserved.
# WEB-only, patch mode — no API, no migrations, no new features, no behaviour change.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
SRC="$WEB_ROOT/src"
REP="$SRC/app/crm/reps/[id]/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 192 — own checks only (use validate-tier-2b-smoke for current smoke)"

grep -q "Day 192" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 192" $?

# --- Active rep detail route present ---
[[ -f "$REP" ]]
check "active /crm/reps/[id]/page.tsx present" $?

# --- CTA colour calm applied: no emerald/cyan/amber *action buttons* remain ---
# Action buttons use the bg-<colour>-500/10 border-<colour>-500/30 pattern.
! grep -qE 'border-(emerald|cyan|amber)-500/30 bg-(emerald|cyan|amber)-500/10' "$REP"
check "no emerald/cyan/amber action-button classes remain" $?

# Cyan inline link removed from activity tab
! grep -q 'text-cyan-500' "$REP"
check "no cyan inline action link remains" $?

# --- Indigo primary CTAs present (AI Sparring header + quick action, + Follow-up) ---
[[ "$(grep -c 'border-indigo-500/30 bg-indigo-500/10' "$REP")" -ge 3 ]]
check "calm indigo CTAs present (>=3)" $?

# --- Green kept for status/success only (risk band + metric colours preserved) ---
grep -q 'text-emerald-400' "$REP"
check "Completed status metric (emerald) preserved" $?
grep -q 'border-emerald-500/20 bg-emerald-500/5' "$REP"
check "healthy risk-band status styling preserved" $?

# --- Behaviour preserved: handlers + proxy data loads untouched ---
grep -q 'const completeAction' "$REP"
check "completeAction handler preserved" $?
grep -q 'const createFollowUp' "$REP"
check "createFollowUp handler preserved" $?
! grep -qE 'NEXT_PUBLIC_API|BACKEND_BASE|fetch\(`https?://' "$REP"
check "no direct-backend / proxy-bypass fetch in rep detail" $?

# --- Header stays calm (text-xl, no forced text-2xl heading) ---
grep -q 'text-xl font-semibold text-white' "$REP"
check "rep header stays text-xl" $?

# --- Scope guards ---
[[ -f "$WEB_ROOT/scripts/validate-tier-2b-smoke.sh" ]]
check "validate-tier-2b-smoke still exists" $?

! find "$WEB_ROOT/scripts" "$SRC" -iname "*migration*" -o -iname "*migrate*" 2>/dev/null | grep -q .
check "no migration added" $?

if [[ "$fail" == "0" ]]; then
  echo "✅ Day 192 premium UX validation PASSED"
  exit 0
else
  echo "❌ Day 192 premium UX validation FAILED"
  exit 1
fi
