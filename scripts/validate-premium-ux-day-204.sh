#!/usr/bin/env bash
# Validates the Day 204 admin assignments manager lane visual pass: the single
# AdminAssignmentsClient (rendered by /admin/assignments, /queue and /create)
# adopts the Command Centre system — PageHeader, StatCard for the eight stat
# tiles, shared Button/buttonClasses, brand-tonal active tabs/filters, brand
# primary CTAs (was arcade bg-white), Day 203 semantic status tokens, the
# off-palette sky origin badge retired to neutral — and sheds trust-breaking
# raw copy (debug badge, "View:" chip, ?rep_id= dev description, raw type
# enums). Visual/copy only: every fetch, create/complete/nudge/delete/reschedule
# handler, bulk action, manager gate, filter/tab state, href and disabled state
# is preserved.
# WEB-only, patch mode — no API, no migrations, no new features, no behaviour change.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
PKG="$WEB_ROOT/package.json"
SRC="$WEB_ROOT/src"
DIR="$SRC/app/admin/assignments"
C="$DIR/AdminAssignmentsClient.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 204 — own checks only (use validate-tier-2b-smoke for current smoke)"

# --- Documentation + wiring ---
grep -q 'Admin assignments manager lane visual pass (Day 204)' "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 204 section" $?
grep -q '"validate-premium-ux-day-204"' "$PKG" 2>/dev/null
check "package.json has validate-premium-ux-day-204 script" $?

# --- Routes still active (all three render the client with an initialView) ---
grep -q 'initialView="overview"' "$DIR/page.tsx" 2>/dev/null
check "/admin/assignments renders overview" $?
grep -q 'initialView="queue"' "$DIR/queue/page.tsx" 2>/dev/null
check "/admin/assignments/queue renders queue" $?
grep -q 'initialView="create"' "$DIR/create/page.tsx" 2>/dev/null
check "/admin/assignments/create renders create" $?

# --- Trust/clarity: raw internal surfaces removed ---
! grep -q 'has Show/Expand controls' "$C" 2>/dev/null
check "debug badge removed" $?
! grep -qE 'View:\s*<span[^>]*>\{view\}' "$C" 2>/dev/null
check "'View: {view}' raw indicator removed" $?
! grep -q 'Prefills from' "$C" 2>/dev/null
check "developer ?rep_id= create-panel copy reworded" $?
grep -q 'Assign a sparring drill, call review or follow-up task to a rep.' "$C" 2>/dev/null
check "create panel uses manager coaching copy" $?
grep -q '<td className="py-2 pr-3 text-neutral-300">{safeTypeLabel(a.type)}</td>' "$C" 2>/dev/null
check "queue Type column mapped through safeTypeLabel (no raw enum)" $?

# --- Visual system adoption ---
grep -q 'import { PageHeader } from "@/components/layout/page-header"' "$C" 2>/dev/null
check "PageHeader imported" $?
grep -q '<PageHeader' "$C" 2>/dev/null
check "header uses PageHeader" $?
grep -q 'title="Assignments"' "$C" 2>/dev/null
check "header title dropped 'Admin ·' prefix" $?
grep -q 'import { StatCard } from "@/components/ui/stat-card"' "$C" 2>/dev/null
check "StatCard imported" $?
[[ "$(grep -c '<StatCard' "$C" 2>/dev/null)" -ge 8 ]]
check "at least 8 StatCard tiles (4 overview + 4 trust)" $?
grep -q 'import { Button, buttonClasses } from "@/components/ui/button"' "$C" 2>/dev/null
check "Button/buttonClasses imported" $?
grep -q 'max-w-\[1400px\]' "$C" 2>/dev/null
check "container clamps to shell-standard 1400px" $?
grep -q 'variant={totals.overdue > 0 ? "danger" : "default"}' "$C" 2>/dev/null
check "Overdue stat tile: danger only when > 0" $?

# --- Arcade white CTAs gone; brand primary in ---
! grep -qE 'bg-white|text-black' "$C" 2>/dev/null
check "no arcade bg-white/text-black CTAs remain (class)" $?
[[ "$(grep -c 'bg-brand-600 px-.* text-white hover:bg-brand-500' "$C" 2>/dev/null)" -ge 4 ]]
check "primary CTAs use brand recipe (>=4 sites)" $?
grep -q 'border border-brand-500/40 bg-brand-500/15 text-brand-200' "$C" 2>/dev/null
check "active tabs/filters use brand tonal chip recipe" $?

# --- Semantic status tokens; no off-palette / no raw status palette ---
! grep -qiE 'sky-|fuchsia|purple|pink|violet' "$C" 2>/dev/null
check "no off-palette colours (sky/fuchsia/purple/pink/violet)" $?
! grep -oE '(red|emerald|amber|indigo|cyan)-[0-9]' "$C" 2>/dev/null | grep -q .
check "no raw red/emerald/amber/indigo/cyan classes (all tokenised)" $?
grep -q 'border-danger-500/30 bg-danger-500/10' "$C" 2>/dev/null
check "OVERDUE / danger status styling uses danger token" $?
grep -q 'border-success-500/30 bg-success-500/10' "$C" 2>/dev/null
check "COMPLETED / success status styling uses success token" $?
grep -q 'origin.tone === "auto"' "$C" 2>/dev/null && grep -q '? "border-neutral-700 bg-neutral-900 text-neutral-300"' "$C" 2>/dev/null
check "auto-created origin badge is neutral (sky retired)" $?

# --- New -200 token shades exist in the Day 203 layer ---
grep -q -- '--color-success-200: var(--color-emerald-200);' "$SRC/app/globals.css" 2>/dev/null
check "success-200 token added" $?
grep -q -- '--color-warning-200: var(--color-amber-200);' "$SRC/app/globals.css" 2>/dev/null
check "warning-200 token added" $?

# --- Behaviour preserved (spot checks: handlers, endpoints, gates, state) ---
grep -q 'async function createAssignment()' "$C" 2>/dev/null
check "createAssignment handler intact" $?
grep -q 'async function markComplete(' "$C" 2>/dev/null && grep -q 'Force complete this assignment?' "$C" 2>/dev/null
check "force-complete override + confirm intact" $?
grep -q 'async function runBulkAction()' "$C" 2>/dev/null
check "bulk action runner intact" $?
grep -q 'async function nudgeRep(' "$C" 2>/dev/null
check "nudge handler intact" $?
grep -q 'async function deleteAssignment(' "$C" 2>/dev/null
check "delete handler intact" $?
grep -q 'async function setDueToday(' "$C" 2>/dev/null
check "due-today reschedule handler intact" $?
grep -q '"/api/proxy/v1/assignments"' "$C" 2>/dev/null
check "create POST endpoint intact" $?
grep -q '/api/proxy/v1/assignments/manager/' "$C" 2>/dev/null
check "manager PATCH endpoint intact" $?
grep -q 'getJson<{ ok: true; config: any }>("/api/proxy/v1/admin/config")' "$C" 2>/dev/null
check "manager-access gate probe intact" $?
grep -q 'updateUrl({ filter: "open" })' "$C" 2>/dev/null
check "queue filter URL sync intact" $?
grep -q 'jumpToCreateAndPrefill(' "$C" 2>/dev/null
check "quick-assign prefill intact" $?
grep -q 'href="/admin/assignments/queue"' "$C" 2>/dev/null && grep -q 'href="/admin/assignments/create"' "$C" 2>/dev/null
check "tab navigation hrefs preserved" $?
grep -q 'disabled={creating || !createRepId || !createTitle.trim() || createTargetValidation.invalid}' "$C" 2>/dev/null
check "create button disabled expression intact" $?

if [[ "$fail" == "0" ]]; then
  echo "Day 204 validation PASSED"
else
  echo "Day 204 validation FAILED"
  exit 1
fi
