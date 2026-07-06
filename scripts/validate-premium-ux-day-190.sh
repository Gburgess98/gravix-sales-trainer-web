#!/usr/bin/env bash
# Validates the Day 190 CRM tasks/actions button-system pass: /crm/tasks header
# normalised + loud white Refresh calmed; /crm/actions filter tab cyan->indigo and
# the Complete action button emerald->neutral (green kept for the Done status pill
# only); vestigial lib/config.ts getBackendBase removed with its overview consumer.
# WEB-only, patch mode — no API, no migrations, no new features.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
SRC="$WEB_ROOT/src"
TASKS="$SRC/app/crm/tasks/page.tsx"
ACTIONS="$SRC/app/crm/actions/page.tsx"
OVERVIEW="$SRC/app/crm/overview/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 190 — own checks only (use validate-tier-2b-smoke for current smoke)"

grep -q "Day 190" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 190" $?

# --- /crm/tasks ---
grep -q '<h1 className="mt-2 text-xl font-semibold tracking-tight">Tasks</h1>' "$TASKS" 2>/dev/null
check "/crm/tasks header normalised to text-xl" $?
! grep -q 'bg-white px-3 py-2 text-sm font-medium text-neutral-950' "$TASKS" 2>/dev/null
check "/crm/tasks loud white Refresh button removed" $?
grep -q 'onClick={() => void loadTasks()}' "$TASKS" 2>/dev/null
check "/crm/tasks preserves Refresh behaviour (loadTasks)" $?
grep -q 'completeTask' "$TASKS" 2>/dev/null
check "/crm/tasks preserves completeTask handler" $?
# green kept for status only: emerald appears on the done status pill.
grep -q 'border-emerald-900/80 bg-emerald-950/30 text-emerald-300' "$TASKS" 2>/dev/null
check "/crm/tasks keeps emerald done status pill" $?

# --- /crm/actions ---
grep -q 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200' "$ACTIONS" 2>/dev/null
check "/crm/actions filter active tab is calm indigo" $?
! grep -q 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200' "$ACTIONS" 2>/dev/null
check "/crm/actions no cyan active-tab remains" $?
# Complete action button no longer emerald-filled.
! grep -q 'border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200 hover:bg-emerald-500/20' "$ACTIONS" 2>/dev/null
check "/crm/actions Complete action button off emerald" $?
grep -q 'rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-60' "$ACTIONS" 2>/dev/null
check "/crm/actions Complete action button now neutral" $?
# green kept for status only: Done status pill still emerald.
grep -q 'border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-\[10px\] uppercase tracking-wide text-emerald-300' "$ACTIONS" 2>/dev/null
check "/crm/actions keeps emerald Done status pill" $?
grep -q 'completeAction' "$ACTIONS" 2>/dev/null
check "/crm/actions preserves completeAction handler" $?
grep -q 'STATUS_TABS' "$ACTIONS" 2>/dev/null
check "/crm/actions preserves filter tabs" $?

# --- getBackendBase cleanup ---
[[ ! -e "$SRC/lib/config.ts" ]]
check "vestigial src/lib/config.ts removed" $?
! grep -q 'getBackendBase' "$OVERVIEW" 2>/dev/null
check "/crm/overview no longer references getBackendBase" $?
! grep -rn '@/lib/config' "$SRC" --include='*.ts' --include='*.tsx' | grep -q .
check "no @/lib/config imports remain" $?

# --- Scope guards ---
[[ -f "$WEB_ROOT/scripts/validate-tier-2b-smoke.sh" ]]
check "validate-tier-2b-smoke still exists" $?

! grep -rni "elevenlabs\|voice agent\|text-to-speech" "$SRC/app" "$SRC/components" "$SRC/lib" --include='*.ts*' >/dev/null 2>&1
check "no ElevenLabs/TTS/Voice Agent added" $?

! find "$WEB_ROOT/scripts" "$SRC" -iname "*migration*" -o -iname "*migrate*" 2>/dev/null | grep -q .
check "no migration added" $?

if [[ "$fail" == "0" ]]; then
  echo "✅ Day 190 premium UX validation PASSED"
  exit 0
else
  echo "❌ Day 190 premium UX validation FAILED"
  exit 1
fi
