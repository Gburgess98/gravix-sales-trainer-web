#!/usr/bin/env bash
# Validates the Day 205B analytics intelligence workspace pass:
#  - /crm/analytics rebuilt on the shell system (PageContainer, PageHeader,
#    SectionCard, StatCard, EmptyState, Button/buttonClasses);
#  - chart palette unified on the brand ramp — violet #8b5cf6 retired;
#  - loading / empty / error states added (loadError + Retry, EmptyState per
#    chart, pulse skeletons);
#  - behaviour preserved: all three analytics fetches, sessionStorage cache,
#    Supabase realtime channel, exportCSV/exportPNG + their element ids,
#    rep/days filters;
#  - "Act on these insights" links point at real existing routes only;
#  - /admin/users fuchsia retired (brand/warning tokens).
# WEB-only, visual-only — no API, no migrations, no new features.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
PKG="$WEB_ROOT/package.json"
ANALYTICS="$WEB_ROOT/src/app/crm/analytics/page.tsx"
USERS="$WEB_ROOT/src/app/admin/users/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 205B — own checks only (use validate-tier-2b-smoke for current smoke)"

# --- Documentation + wiring ---
grep -q 'Day 205B' "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 205B section" $?
grep -q 'Context Engine' "$AUDIT" 2>/dev/null
check "audit documents Context Engine / Scorecard Studio future module" $?
grep -q '"validate-premium-ux-day-205b"' "$PKG" 2>/dev/null
check "package.json has validate-premium-ux-day-205b script" $?

# --- /crm/analytics: shell-system adoption ---
grep -q 'PageShell' "$ANALYTICS" 2>/dev/null
check "analytics uses PageShell (glass system)" $?
grep -q 'PageHead' "$ANALYTICS" 2>/dev/null
check "analytics uses PageHead (glass system)" $?
grep -q 'GlassCard' "$ANALYTICS" 2>/dev/null && grep -q 'PanelHeader' "$ANALYTICS" 2>/dev/null
check "analytics uses GlassCard/Panel (glass system)" $?
grep -q 'summariseScores' "$ANALYTICS" 2>/dev/null
check "analytics figures derive via src/lib/insights-model (no StatCard grid)" $?
grep -q 'EmptyPanel' "$ANALYTICS" 2>/dev/null
check "analytics uses EmptyPanel" $?
grep -q 'dsButton' "$ANALYTICS" 2>/dev/null
check "analytics uses dsButton" $?

# --- Palette: brand ramp only, violet retired ---
! grep -qi '8b5cf6' "$ANALYTICS" 2>/dev/null
check "analytics: violet #8b5cf6 bar retired" $?
! grep -qiE 'fuchsia|purple|pink-' "$ANALYTICS" 2>/dev/null
check "analytics: no fuchsia/purple/pink classes" $?
grep -q '60a5fa' "$ANALYTICS" 2>/dev/null
check "analytics: line stroke on the glass-system blue hex" $?
grep -q 'bg-\[var(--ds-primary)\]' "$ANALYTICS" 2>/dev/null
check "analytics: bars use the primary token (CSS bars, not a second chart)" $?

# --- States: loading / empty / error ---
grep -q 'loadError' "$ANALYTICS" 2>/dev/null
check "analytics: fetch error state exists" $?
grep -q 'Retry' "$ANALYTICS" 2>/dev/null
check "analytics: error card offers Retry" $?
grep -q 'animate-pulse' "$ANALYTICS" 2>/dev/null
check "analytics: loading skeleton present" $?
grep -q 'No reviewed calls in this range' "$ANALYTICS" 2>/dev/null
check "analytics: score-trend empty state present" $?

# --- Behaviour preserved (positive guards) ---
grep -q '/v1/crm/analytics/stage-conversion' "$ANALYTICS" 2>/dev/null
check "analytics: stage-conversion fetch preserved" $?
grep -q '/v1/crm/analytics/score-trend' "$ANALYTICS" 2>/dev/null
check "analytics: score-trend fetch preserved" $?
grep -q '/v1/crm/analytics/activity-by-rep' "$ANALYTICS" 2>/dev/null
check "analytics: activity-by-rep fetch preserved" $?
grep -q 'sessionStorage.getItem' "$ANALYTICS" 2>/dev/null
check "analytics: sessionStorage cache preserved" $?
grep -q 'analytics-updates' "$ANALYTICS" 2>/dev/null
check "analytics: Supabase realtime channel preserved" $?
grep -q 'function exportCSV' "$ANALYTICS" 2>/dev/null
check "analytics: exportCSV preserved" $?
grep -q 'async function exportPNG' "$ANALYTICS" 2>/dev/null
check "analytics: exportPNG preserved" $?
grep -q 'score-performance-card' "$ANALYTICS" 2>/dev/null
check "analytics: score PNG export element id preserved" $?
grep -q 'conversion-by-stage.csv' "$ANALYTICS" 2>/dev/null
check "analytics: stage transitions keep a CSV export (PNG export retired with the duplicate chart)" $?
grep -q 'activity-by-rep.csv' "$ANALYTICS" 2>/dev/null
check "analytics: coaching-by-rep keeps a CSV export (PNG export retired with the duplicate chart)" $?
grep -q 'setSelectedRep' "$ANALYTICS" 2>/dev/null
check "analytics: rep filter preserved" $?
grep -q 'setDays' "$ANALYTICS" 2>/dev/null
check "analytics: range filter preserved" $?

# --- Next actions: real routes only ---
grep -q '/coaching?tab=review' "$ANALYTICS" 2>/dev/null
check "analytics: next-action links to review queue" $?
grep -q '/coaching?tab=assignments' "$ANALYTICS" 2>/dev/null
check "analytics: next-action links to the Assignments tab" $?
grep -q '"/crm/manager"' "$ANALYTICS" 2>/dev/null
check "analytics: next-action links to team workspace" $?

# --- No fake features: no scorecard/context routes were created ---
test ! -d "$WEB_ROOT/src/app/scorecard" && test ! -d "$WEB_ROOT/src/app/context" \
  && test ! -d "$WEB_ROOT/src/app/crm/scorecard"
check "no fake scorecard/context routes created" $?

# --- /admin/users: fuchsia retired, behaviour intact ---
! grep -qi 'fuchsia' "$USERS" 2>/dev/null
check "admin/users: fuchsia retired" $?
grep -q 'handleBecomeUser' "$USERS" 2>/dev/null
check "admin/users: impersonation handlers preserved" $?
grep -q 'Exit impersonation' "$USERS" 2>/dev/null
check "admin/users: exit-impersonation control preserved" $?

if [[ "$fail" == "0" ]]; then
  echo "Day 205B validation PASSED"
  exit 0
else
  echo "Day 205B validation FAILED"
  exit 1
fi
