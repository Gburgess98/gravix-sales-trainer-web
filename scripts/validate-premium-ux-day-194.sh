#!/usr/bin/env bash
# Validates the Day 194 "Gravix Command Centre" visual system pass: fuchsia
# removed from shared components + demo path, nav/brand accent moved
# emerald → indigo, impersonation banner moved to the amber warning role,
# arcade gradient/XP leftovers calmed, direction documented in the audit.
# WEB-only, patch mode — no API, no migrations, no new features, no behaviour change.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
SRC="$WEB_ROOT/src"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 194 — own checks only (use validate-tier-2b-smoke for current smoke)"

# --- Documentation ---
grep -q "Day 194" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 194" $?
grep -q "Gravix Command Centre" "$AUDIT" 2>/dev/null
check "audit names the Gravix Command Centre direction" $?
grep -qi "theme-readiness" "$AUDIT" 2>/dev/null
check "audit records theme-readiness notes" $?

# --- Shell: indigo primary accent, no emerald brand/nav ---
grep -q 'bg-indigo-400' "$SRC/components/shell/nav-item.tsx" 2>/dev/null
check "nav active accent bar is indigo" $?
! grep -q 'emerald' "$SRC/components/shell/nav-item.tsx" 2>/dev/null
check "nav-item has no emerald accents" $?
grep -q 'text-indigo-400' "$SRC/components/shell/sidebar.tsx" 2>/dev/null
check "sidebar brand mark is indigo" $?
! grep -q 'emerald' "$SRC/components/shell/sidebar.tsx" 2>/dev/null
check "sidebar has no emerald accents" $?

# --- Shell: impersonation banner uses the amber warning role ---
grep -q 'border-amber-500/30 bg-amber-950/50' "$SRC/components/shell/app-shell.tsx" 2>/dev/null
check "impersonation banner is amber (warning role)" $?
! grep -q 'fuchsia' "$SRC/components/shell/app-shell.tsx" 2>/dev/null
check "app-shell has no fuchsia" $?
! grep -q 'animate-pulse' "$SRC/components/shell/app-shell.tsx" 2>/dev/null
check "impersonation banner dot no longer pulses" $?

# --- Shared UI: ai variants are the brand accent, fuchsia is gone ---
# Day 203 — loosened from the exact indigo literal to intent: the AI/brand
# variant may render via the raw indigo class OR the semantic `brand` token
# (which aliases indigo 1:1). What matters is the tinted 500/20 + 500/5 recipe
# in the brand family, not the literal palette word.
grep -qE "ai: 'border-(indigo|brand)-500/20 bg-(indigo|brand)-500/5'" "$SRC/components/ui/stat-card.tsx" 2>/dev/null
check "StatCard ai variant is brand (indigo/brand token)" $?
! grep -q 'fuchsia' "$SRC/components/ui/stat-card.tsx" 2>/dev/null
check "StatCard has no fuchsia" $?
grep -qE "border: 'border-(indigo|brand)-500/20 bg-(indigo|brand)-500/5'" "$SRC/components/ui/ai-insight-card.tsx" 2>/dev/null
check "AiInsightCard summary is brand (indigo/brand token)" $?
! grep -q 'fuchsia' "$SRC/components/ui/ai-insight-card.tsx" 2>/dev/null
check "AiInsightCard has no fuchsia" $?
grep -q 'tracking-tight' "$SRC/components/layout/page-header.tsx" 2>/dev/null
check "PageHeader title uses tracking-tight" $?

# --- Orphaned arcade component removed ---
[[ ! -f "$SRC/components/XpProgress.tsx" ]]
check "orphaned XpProgress.tsx deleted" $?
! grep -rq 'XpProgress' "$SRC" 2>/dev/null
check "no stale XpProgress references" $?

# --- Demo path: fuchsia/purple gone, gradient bar calmed ---
! grep -q 'fuchsia' "$SRC/app/dashboard/page.tsx" 2>/dev/null
check "/dashboard has no fuchsia" $?
! grep -q 'bg-gradient-to-r from-emerald-500 to-cyan-400' "$SRC/app/dashboard/page.tsx" 2>/dev/null
check "/dashboard XP bar gradient replaced" $?
! grep -q 'purple' "$SRC/app/calls/[id]/page.tsx" 2>/dev/null
check "/calls/[id] has no purple" $?
! grep -q 'fuchsia' "$SRC/app/crm/accounts/[id]/page.tsx" 2>/dev/null
check "/crm/accounts/[id] has no fuchsia" $?

# --- Fuchsia contained to the one documented deferral (/admin/users) ---
STRAYS=$(grep -rl 'fuchsia' "$SRC" --include='*.tsx' 2>/dev/null | grep -v 'app/admin/users/page.tsx' | grep -v 'app/coaching/page.tsx' || true)
[[ -z "$STRAYS" ]]
check "no fuchsia outside documented deferrals" $?
# /coaching may only mention fuchsia in a historical comment, never a class
! grep -E 'className="[^"]*fuchsia' "$SRC/app/coaching/page.tsx" >/dev/null 2>&1
check "/coaching has no fuchsia classes" $?

if [[ "$fail" == "0" ]]; then
  echo "Day 194 validation PASSED"
else
  echo "Day 194 validation FAILED"
  exit 1
fi
