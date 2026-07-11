#!/usr/bin/env bash
# Validates the Day 205C intelligence + manager workspace v2 pass:
#  - /crm/analytics recomposed as the Intelligence Cockpit (hero band, featured
#    KPI + trend delta, derived signals band, gradient area chart + reading
#    rail, humanised rep labels, action cards) with all Day 205B behaviour
#    pins still intact (run validate-premium-ux-day-205b for those);
#  - /crm/overview trust pass: emoji status chips -> semantic dots, raw
#    missing_user error copy hidden, medal emojis retired, sky accent -> brand;
#  - /crm/manager: raw error code softened, ManagerClient white CTAs -> brand
#    primary recipe, provenance chip off emerald;
#  - /admin/users: cyan chips/focus -> brand/accent tokens, Owner badge off
#    amber (caution stays status-only);
#  - no fake features: no scorecard/context routes, no Autofill UI;
#  - PREMIUM_UX_AUDIT.md documents Day 205C + the five future product
#    opportunities as future real features.
# WEB-only, visual-only — no API, no migrations, no new features.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
PKG="$WEB_ROOT/package.json"
ANALYTICS="$WEB_ROOT/src/app/crm/analytics/page.tsx"
OVERVIEW="$WEB_ROOT/src/app/crm/overview/page.tsx"
MGR="$WEB_ROOT/src/app/crm/manager/page.tsx"
MGRCLIENT="$WEB_ROOT/src/app/crm/manager/ManagerClient.tsx"
USERS="$WEB_ROOT/src/app/admin/users/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 205C — own checks only (use validate-tier-2b-smoke for current smoke)"

# --- Documentation + wiring ---
grep -q 'Day 205C' "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 205C section" $?
grep -q 'AI Scorecard Builder' "$AUDIT" 2>/dev/null
check "audit documents future product opportunities (Scorecard Builder etc.)" $?
grep -q 'AI Autofill from website' "$AUDIT" 2>/dev/null
check "audit documents AI Autofill as future, not fake UI" $?
grep -q '"validate-premium-ux-day-205c"' "$PKG" 2>/dev/null
check "package.json has validate-premium-ux-day-205c script" $?

# --- /crm/analytics: Intelligence Cockpit composition ---
grep -q 'Gravix Intelligence' "$ANALYTICS" 2>/dev/null
check "analytics: intelligence hero band present" $?
grep -q 'radial-gradient' "$ANALYTICS" 2>/dev/null
check "analytics: hero uses layered radial glow" $?
grep -q 'This range at a glance' "$ANALYTICS" 2>/dev/null
check "analytics: derived signals band present" $?
grep -q 'scoreDelta' "$ANALYTICS" 2>/dev/null
check "analytics: featured KPI trend delta derived from trend" $?
grep -q 'AreaChart' "$ANALYTICS" 2>/dev/null
check "analytics: score chart upgraded to gradient area" $?
grep -q 'Range high' "$ANALYTICS" 2>/dev/null
check "analytics: score reading rail present" $?
grep -q 'function repLabel' "$ANALYTICS" 2>/dev/null
check "analytics: rep labels humanised (no raw UUID display)" $?
grep -q 'rep_label' "$ANALYTICS" 2>/dev/null
check "analytics: rep chart axis uses humanised label" $?
grep -q 'maxBarSize' "$ANALYTICS" 2>/dev/null
check "analytics: bars capped (no slab bars on sparse data)" $?
grep -q 'nextActions' "$ANALYTICS" 2>/dev/null
check "analytics: next actions are described cards" $?
# Signals are deterministic reads, not fake AI output
grep -q 'Read automatically from the figures' "$ANALYTICS" 2>/dev/null
check "analytics: signals band labelled as derived, not AI" $?

# --- /crm/overview: trust pass ---
! grep -qE '🟡|🕑|🥇|🥈|🥉|💤' "$OVERVIEW" 2>/dev/null
check "overview: emoji status chips + medals retired" $?
! grep -q 'border-sky-500' "$OVERVIEW" 2>/dev/null
check "overview: sky active accent -> brand" $?
grep -q 'once team data is reachable' "$OVERVIEW" 2>/dev/null
check "overview: raw missing_user copy softened" $?
# behaviour preserved
grep -q 'listCoachAssignments' "$OVERVIEW" 2>/dev/null
check "overview: assignment card wiring untouched (warnings documented)" $?
grep -q 'Open Control Centre' "$OVERVIEW" 2>/dev/null
check "overview: Control Centre entry preserved" $?

# --- /crm/manager ---
! grep -q 'bg-white text-black' "$MGRCLIENT" 2>/dev/null
check "manager: white arcade CTAs retired" $?
grep -q 'bg-brand-600 text-white text-sm font-semibold' "$MGRCLIENT" 2>/dev/null
check "manager: primary CTAs on brand recipe" $?
grep -q 'bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500' "$MGRCLIENT" 2>/dev/null
check "manager: Day 187 batch-assign pin untouched" $?
grep -q 'runNow\|executeFromPreview' "$MGRCLIENT" 2>/dev/null
check "manager: run/execute handlers preserved" $?
! grep -q 'bg-emerald-900/20' "$MGRCLIENT" 2>/dev/null
check "manager: provenance chip off emerald (green = status only)" $?
! grep -q 'failed to load: {overview.error' "$MGR" 2>/dev/null
check "manager: raw error code not rendered inline" $?

# --- /admin/users ---
! grep -qi 'cyan-' "$USERS" 2>/dev/null
check "admin/users: raw cyan retired (accent token where kept)" $?
! grep -qi 'amber-' "$USERS" 2>/dev/null
check "admin/users: Owner badge off amber (caution = status only)" $?
grep -q 'handleBecomeUser' "$USERS" 2>/dev/null
check "admin/users: impersonation handlers preserved" $?

# --- Global colour discipline on touched files ---
! grep -qiE 'fuchsia|purple|pink-' "$ANALYTICS" "$OVERVIEW" "$MGR" "$MGRCLIENT" "$USERS" 2>/dev/null
check "touched files: no fuchsia/purple/pink" $?

# --- No fake features: no scorecard/context routes were created ---
test ! -d "$WEB_ROOT/src/app/scorecard" && test ! -d "$WEB_ROOT/src/app/context" \
  && test ! -d "$WEB_ROOT/src/app/crm/scorecard"
check "no fake scorecard/context routes created" $?
! grep -qi 'autofill' "$ANALYTICS" 2>/dev/null
check "analytics: no fake Autofill UI" $?

if [[ "$fail" == "0" ]]; then
  echo "Day 205C validation PASSED"
  exit 0
else
  echo "Day 205C validation FAILED"
  exit 1
fi
