#!/usr/bin/env bash
# Validates the Day 206 final product quality pass:
#  - /crm/overview recomposed on the Intelligence Cockpit system
#    (PageContainer/PageHeader hero, SectionCard modules, EmptyState empties,
#    token status chips, brand charts, humanised rep labels, quick-view rep
#    select instead of the raw Rep ID input, perpetual em-dash stub tiles
#    removed, Sparkline series actually wired);
#  - /crm/manager: dev-scaffold Auto-Assign Runner card removed, raw error
#    codes off the error cards, rep table truncates UUIDs, mode leak calmed;
#  - /settings/profile: raw parser errors mapped to calm copy, tokens adopted;
#  - no fake features: no scorecard/context/autofill surfaces.
# WEB-only, visual-only — no API, no migrations, no new features.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
PKG="$WEB_ROOT/package.json"
OVERVIEW="$WEB_ROOT/src/app/crm/overview/page.tsx"
MGRCLIENT="$WEB_ROOT/src/app/crm/manager/ManagerClient.tsx"
RUNHIST="$WEB_ROOT/src/components/RunHistoryTable.tsx"
PROFILE="$WEB_ROOT/src/app/settings/profile/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 206 — own checks only (use validate-tier-2b-smoke for current smoke)"

# --- Documentation + wiring ---
grep -q 'Day 206' "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 206 section" $?
grep -q '"validate-premium-ux-day-206"' "$PKG" 2>/dev/null
check "package.json has validate-premium-ux-day-206 script" $?

# --- /crm/overview: cockpit composition ---
grep -q 'PageContainer' "$OVERVIEW" 2>/dev/null
check "overview uses PageContainer" $?
grep -q 'PageHeader' "$OVERVIEW" 2>/dev/null
check "overview uses PageHeader" $?
grep -q 'Gravix Intelligence' "$OVERVIEW" 2>/dev/null
check "overview: intelligence hero band present" $?
grep -q 'SectionCard' "$OVERVIEW" 2>/dev/null
check "overview uses SectionCard" $?
grep -q 'EmptyState' "$OVERVIEW" 2>/dev/null
check "overview uses EmptyState" $?
grep -q 'buttonClasses' "$OVERVIEW" 2>/dev/null
check "overview uses shared button recipes" $?
grep -q 'Avg coaching score' "$OVERVIEW" 2>/dev/null
check "overview: featured KPI card present" $?
grep -q 'values={numericSeries' "$OVERVIEW" 2>/dev/null
check "overview: sparklines wired to real series (values prop)" $?
grep -q 'function repShort' "$OVERVIEW" 2>/dev/null
check "overview: rep labels humanised" $?
! grep -q 'placeholder="Rep ID"' "$OVERVIEW" 2>/dev/null
check "overview: raw Rep ID text input replaced" $?
grep -q 'value={analyticsRep ?? ' "$OVERVIEW" 2>/dev/null
check "overview: quick-view rep select keeps analyticsRep state" $?
! grep -q '38bdf8' "$OVERVIEW" 2>/dev/null
check "overview: sky line hex retired" $?
grep -q '818cf8' "$OVERVIEW" 2>/dev/null
check "overview: trend line on brand hex" $?
! grep -q "Avg. Handle Time" "$OVERVIEW" 2>/dev/null
check "overview: perpetual em-dash stub tiles removed" $?
! grep -qE "'#22c55e', '#eab308', '#f43f5e'" "$OVERVIEW" 2>/dev/null
check "overview: arcade ranking chart cells removed" $?
! grep -qE 'from "recharts"|from .recharts.' <(grep '^import' "$OVERVIEW") 2>/dev/null
check "overview: dead static recharts import removed (nextDynamic only)" $?
! grep -q 'max-w-5xl' "$OVERVIEW" 2>/dev/null
check "overview: pre-shell max-w-5xl container retired" $?
grep -q 'Open Analytics' "$OVERVIEW" 2>/dev/null
check "overview: quick view links to full analytics cockpit" $?

# --- overview behaviour preserved (positive guards) ---
grep -q '/v1/dashboard/kpis' "$OVERVIEW" 2>/dev/null
check "overview: kpis fetch preserved" $?
grep -q 'reporting-summary' "$OVERVIEW" 2>/dev/null
check "overview: reporting-summary fetch preserved" $?
grep -q 'flags-summary' "$OVERVIEW" 2>/dev/null
check "overview: flags-summary fetch preserved" $?
grep -q 'control-centre?days=7' "$OVERVIEW" 2>/dev/null
check "overview: control-centre fetch preserved" $?
grep -q 'nudges?limit=5' "$OVERVIEW" 2>/dev/null
check "overview: nudges fetch preserved" $?
grep -q 'assignDrillFromSection' "$OVERVIEW" 2>/dev/null
check "overview: assign-drill handler preserved" $?
grep -q 'listCoachAssignments' "$OVERVIEW" 2>/dev/null
check "overview: assignments summary wiring untouched (warning documented)" $?
grep -q 'setAnalyticsDays' "$OVERVIEW" 2>/dev/null
check "overview: analytics range filter preserved" $?
grep -q '/crm/manager/control-centre' "$OVERVIEW" 2>/dev/null
check "overview: control-centre href preserved" $?
grep -q '/crm/contacts/import' "$OVERVIEW" 2>/dev/null
check "overview: import-leads href preserved" $?

# --- /crm/manager: scaffolding + raw copy retired ---
! grep -q 'Write flow pending' "$MGRCLIENT" 2>/dev/null
check "manager: dev-scaffold runner card removed" $?
! grep -q 'staged next' "$MGRCLIENT" 2>/dev/null
check "manager: roadmap copy removed" $?
! grep -q 'No reps found (mode=' "$MGRCLIENT" 2>/dev/null
check "manager: mode leak calmed" $?
! grep -q 'run_id: <span' "$MGRCLIENT" 2>/dev/null
check "manager: snake_case run_id label humanised" $?
grep -q 'slice(0, 8)' "$MGRCLIENT" 2>/dev/null
check "manager: rep/run ids truncated with hover detail" $?
grep -q 'runBatchAssign' "$MGRCLIENT" 2>/dev/null
check "manager: batch-assign handler preserved" $?
grep -q 'RunHistoryTable' "$MGRCLIENT" 2>/dev/null
check "manager: run history preserved" $?
! grep -q 'font-mono break-all">{apiError.error}' "$MGRCLIENT" "$RUNHIST" 2>/dev/null
check "manager: raw error codes off the error cards (hover only)" $?

# --- /settings/profile ---
grep -q 'function friendlyError' "$PROFILE" 2>/dev/null
check "profile: parser errors mapped to calm copy" $?
! grep -qE 'red-|emerald-|indigo-' "$PROFILE" 2>/dev/null
check "profile: raw palette classes retired for tokens" $?
grep -q "'/v1/users/me'" "$PROFILE" 2>/dev/null
check "profile: load/save endpoints preserved" $?

# --- Global colour discipline on touched files ---
! grep -qiE 'fuchsia|purple|pink-' "$OVERVIEW" "$MGRCLIENT" "$RUNHIST" "$PROFILE" 2>/dev/null
check "touched files: no fuchsia/purple/pink" $?

# --- No fake features ---
test ! -d "$WEB_ROOT/src/app/scorecard" && test ! -d "$WEB_ROOT/src/app/context" \
  && test ! -d "$WEB_ROOT/src/app/crm/scorecard"
check "no fake scorecard/context routes created" $?
! grep -qi 'autofill' "$OVERVIEW" 2>/dev/null
check "overview: no fake Autofill UI" $?

if [[ "$fail" == "0" ]]; then
  echo "Day 206 validation PASSED"
  exit 0
else
  echo "Day 206 validation FAILED"
  exit 1
fi
