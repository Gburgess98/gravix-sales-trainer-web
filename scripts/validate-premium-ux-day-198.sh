#!/usr/bin/env bash
# Validates the Day 198 shared Button primitive + call-detail dead helper
# cleanup: ui/button.tsx canonicalises the four Command Centre button
# recipes (primary/secondary/ghost/danger, sm/md), /calls/[id] and
# /coaching adopt it for simple repeated buttons/links only, the
# validator-pinned Day 196/197 recipes stay literal in page source, and
# the three orphaned calls/[id] helpers are deleted with zero stale refs.
# WEB-only, patch mode — no API, no migrations, no new features, no behaviour change.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
SRC="$WEB_ROOT/src"
BTN="$SRC/components/ui/button.tsx"
BARREL="$SRC/components/ui/index.ts"
CALLS="$SRC/app/calls/[id]/page.tsx"
COACHING="$SRC/app/coaching/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 198 — own checks only (use validate-tier-2b-smoke for current smoke)"

# --- Documentation ---
grep -q "Day 198" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 198" $?

# --- Primitive exists with the contracted API ---
[[ -f "$BTN" ]]
check "ui/button.tsx exists" $?
grep -q "'primary' | 'secondary' | 'ghost' | 'danger'" "$BTN" 2>/dev/null
check "four variants declared" $?
grep -q "'sm' | 'md'" "$BTN" 2>/dev/null
check "two sizes declared" $?
grep -q "export function buttonClasses" "$BTN" 2>/dev/null
check "buttonClasses helper exported (for Link/a)" $?
grep -q "forwardRef<HTMLButtonElement, ButtonProps>" "$BTN" 2>/dev/null
check "Button is a forwardRef button" $?
grep -q "type = 'button'" "$BTN" 2>/dev/null
check "Button defaults type=button" $?
grep -q "export \* from './button'" "$BARREL" 2>/dev/null
check "barrel exports button" $?

# --- Recipes match the Days 195-197 system ---
grep -q "primary: 'bg-indigo-600 font-semibold text-white hover:bg-indigo-500'" "$BTN" 2>/dev/null
check "primary recipe is canonical indigo" $?
grep -q "secondary: 'bg-indigo-600/20 font-semibold text-indigo-200 hover:bg-indigo-600/30'" "$BTN" 2>/dev/null
check "secondary recipe is indigo tonal" $?
grep -q "ghost: 'border border-neutral-700 text-neutral-300 hover:bg-neutral-800'" "$BTN" 2>/dev/null
check "ghost recipe is neutral bordered" $?
grep -q "danger: 'border border-red-500/30 text-red-300 hover:bg-red-500/10'" "$BTN" 2>/dev/null
check "danger recipe is bordered red" $?

# --- Adoption in the two touched routes ---
grep -q 'SectionCard, Button, buttonClasses } from "@/components/ui"' "$CALLS" 2>/dev/null
check "calls/[id] imports Button + buttonClasses" $?
CALLS_BTN=$(grep -c '<Button' "$CALLS" 2>/dev/null || echo 0)
[[ "$CALLS_BTN" -ge 10 ]]
check "calls/[id] adopted Button (>=10 sites, got $CALLS_BTN)" $?
grep -q 'variant="danger"' "$CALLS" 2>/dev/null
check "coach-drawer Remove uses danger variant" $?
grep -q '<Button' "$CALLS" && grep -q 'type="submit"' "$CALLS"
check "CRM drawer submit type preserved" $?
grep -q "import { buttonClasses } from '@/components/ui/button'" "$COACHING" 2>/dev/null
check "coaching imports buttonClasses" $?
COACH_BC=$(grep -c "buttonClasses('secondary')" "$COACHING" 2>/dev/null || echo 0)
[[ "$COACH_BC" -ge 8 ]]
check "coaching Links use buttonClasses (>=8 sites, got $COACH_BC)" $?
! grep -q 'rounded-md bg-indigo-600/20 px-2 py-1 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30' "$COACHING" 2>/dev/null
check "hand-copied tonal recipe gone from coaching" $?

# --- Pinned contracts stay literal (day-196/197 validators must not break) ---
grep -q 'rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white' "$COACHING" 2>/dev/null
check "coaching Upload CTA still literal (day-196 pin)" $?
grep -q 'hover:bg-indigo-500/20' "$COACHING" 2>/dev/null
check "coaching assign-action family still literal (day-196 pin)" $?
grep -q 'bg-indigo-600 px-4 py-2 text-sm font-semibold text-white' "$CALLS" 2>/dev/null
check "Practice-now CTA still literal (day-197 pin)" $?

# --- Dead helpers removed with zero stale refs ---
[[ ! -f "$SRC/app/calls/[id]/PinButton.tsx" ]]
check "PinButton.tsx deleted" $?
[[ ! -f "$SRC/app/calls/[id]/PinList.tsx" ]]
check "PinList.tsx deleted" $?
[[ ! -f "$SRC/app/calls/[id]/score-box.tsx" ]]
check "score-box.tsx deleted" $?
! grep -rqE 'PinButton|PinList|score-box|ScoreBox' "$SRC" "$WEB_ROOT/tests" 2>/dev/null
check "zero stale references to deleted helpers" $?

# --- Behaviour preserved (spot checks) ---
grep -q 'onClick={markCallReviewed}' "$CALLS" 2>/dev/null
check "mark-reviewed handler intact" $?
grep -q 'onClick={onCreatePin}' "$CALLS" 2>/dev/null
check "pin create handler intact" $?
grep -q 'onClick={onSaveAssign}' "$CALLS" 2>/dev/null
check "save-assignment handler intact" $?
grep -q 'onClick={() => openCoach(true)}' "$CALLS" 2>/dev/null
check "assign-drill drawer handler intact" $?
grep -q 'disabled={assignSaving || !assigneeUserId || !drillId}' "$CALLS" 2>/dev/null
check "save-assignment disabled expression intact" $?
grep -q 'disabled={linkLoading || !linkEmail.includes("@")}' "$CALLS" 2>/dev/null
check "CRM link disabled expression intact" $?

if [[ "$fail" == "0" ]]; then
  echo "Day 198 validation PASSED"
else
  echo "Day 198 validation FAILED"
  exit 1
fi
