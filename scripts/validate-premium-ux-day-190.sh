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
# Pin refreshed Day 235: the hand-rolled h1 became the shared PageHeader
# (same text-xl title scale via the primitive) during shell adoption.
grep -q 'title="Tasks"' "$TASKS" 2>/dev/null && grep -q 'PageHeader' "$TASKS" 2>/dev/null
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
# Pins refreshed Day 235: the standalone actions list was orphaned (no nav
# entry, no inbound links) and duplicated the overview cockpit's actions
# panels, so the page became a server redirect stub to /crm/overview (Day
# 184 pattern). The Day 190 colour-calm intent is preserved trivially —
# a redirect renders no controls at all.
grep -q 'redirect("/crm/overview")' "$ACTIONS" 2>/dev/null &&
  grep -q 'from "next/navigation"' "$ACTIONS" 2>/dev/null
check "/crm/actions is a server redirect to the overview cockpit" $?
! grep -qE 'border-cyan-500/30|hover:bg-emerald-500/20' "$ACTIONS" 2>/dev/null
check "/crm/actions renders no loud controls (redirect stub)" $?

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
