#!/usr/bin/env bash
# Validates the Day 201 dashboard Command Centre pass: /dashboard loses its
# arcade XP/rank/mission styling in favour of professional
# sales-performance language (Development Progress, Performance Level,
# Progress Points, Next Best Action), all cyan leaves the page (tier
# colour, Expected Impact, mission time, chart stroke, insight cards),
# emerald/amber retreat to genuine status duty, five hand-rolled card
# shells adopt SectionCard, and CTAs adopt the shared button recipes.
# Visual/copy-only pass — all endpoints, handlers, hrefs and conditional
# rendering preserved, including the day-200 pinned upload-link literal.
# WEB-only, patch mode — no API, no migrations, no new features.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
PKG="$WEB_ROOT/package.json"
DASH="$WEB_ROOT/src/app/dashboard/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 201 — own checks only (use validate-tier-2b-smoke for current smoke)"

# --- Documentation + wiring ---
grep -q 'Dashboard Command Centre pass (Day 201)' "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 201 section" $?
grep -q '"validate-premium-ux-day-201"' "$PKG" 2>/dev/null
check "package.json has validate-premium-ux-day-201 script" $?

# --- Cyan fully off the dashboard ---
! grep -qi 'cyan' "$DASH" 2>/dev/null
check "dashboard has zero cyan classes" $?
! grep -q '#22d3ee' "$DASH" 2>/dev/null
check "cyan chart stroke gone" $?
grep -q 'stroke="#818cf8"' "$DASH" 2>/dev/null
check "chart stroke is indigo (#818cf8)" $?
! grep -qE 'fuchsia|purple|pink' "$DASH" 2>/dev/null
check "no fuchsia/purple/pink" $?

# --- Arcade language reframed ---
! grep -q 'XP & Progression' "$DASH" 2>/dev/null
check "'XP & Progression' panel title gone" $?
grep -q '"Development Progress"' "$DASH" 2>/dev/null
check "Development Progress panel present" $?
! grep -q "Today's XP" "$DASH" 2>/dev/null
check "'Today's XP' stat label gone" $?
grep -q '"Progress Today"' "$DASH" 2>/dev/null
check "Progress Today stat label present" $?
grep -q 'Performance Level' "$DASH" 2>/dev/null
check "Current Rank relabelled Performance Level" $?
grep -q 'Progress Points' "$DASH" 2>/dev/null
check "Total XP relabelled Progress Points" $?
! grep -qE "'Novice'|'Legend'|'Trainee I'" "$DASH" 2>/dev/null
check "gamer rank names gone" $?
grep -q "'Foundation'" "$DASH" 2>/dev/null && grep -q "'Principal'" "$DASH" 2>/dev/null
check "professional level ladder present (Foundation → Principal)" $?
grep -q '"Next Best Action"' "$DASH" 2>/dev/null
check "mission card is Next Best Action" $?
! grep -q 'XP + ' "$DASH" 2>/dev/null
check "'XP + …' impact copy gone" $?
! grep -q 'unlock badges' "$DASH" 2>/dev/null
check "badges empty-state copy gone" $?
grep -q 'No progress recorded yet' "$DASH" 2>/dev/null
check "calm progress empty state present" $?

# --- Emerald/amber off non-status duty ---
! grep -q 'text-emerald-400/80' "$DASH" 2>/dev/null
check "mission impact emerald accent gone" $?
! grep -q 'text-emerald-400/70' "$DASH" 2>/dev/null
check "'+N XP today' emerald accent gone" $?
grep -q "variant={summary?.overdue_count ? 'danger' : 'default'}" "$DASH" 2>/dev/null
check "open-assignments stat: danger only when overdue" $?
grep -q "voiceScore >= 80 ? 'success' : voiceScore >= 60 ? 'warning' : 'danger'" "$DASH" 2>/dev/null
check "voice score keeps status banding" $?

# --- Shared primitives adopted ---
grep -q "import { SectionCard } from '@/components/ui/section-card'" "$DASH" 2>/dev/null
check "SectionCard imported" $?
[[ "$(grep -c '<SectionCard' "$DASH" 2>/dev/null)" -ge 5 ]]
check "at least 5 SectionCard panels" $?
grep -q "import { buttonClasses } from '@/components/ui/button'" "$DASH" 2>/dev/null
check "buttonClasses imported" $?
grep -q "buttonClasses('secondary', 'md')" "$DASH" 2>/dev/null
check "Start now CTA uses shared secondary recipe" $?
grep -q "buttonClasses('ghost', 'sm')" "$DASH" 2>/dev/null
check "quick links use shared ghost recipe" $?

# --- Behaviour preserved (spot checks) ---
grep -q "proxyFetch('/v1/reps/me'" "$DASH" 2>/dev/null
check "/v1/reps/me fetch intact" $?
grep -q "proxyFetch('/v1/assignments'" "$DASH" 2>/dev/null
check "/v1/assignments fetch intact" $?
grep -q "proxyFetch('/v1/dashboard/voice-score-trend?days=30'" "$DASH" 2>/dev/null
check "voice-score-trend fetch intact" $?
grep -q 'daily-feed' "$DASH" 2>/dev/null
check "daily-feed fetch intact" $?
grep -q 'href={mission.href}' "$DASH" 2>/dev/null
check "mission CTA href intact" $?
grep -q "window.location.href = '/upload'" "$DASH" 2>/dev/null
check "empty-state upload handler intact" $?
grep -q 'href={`/calls/${feed.recommended_replay.call_id}`}\|/calls/\${feed.recommended_replay.call_id}' "$DASH" 2>/dev/null
check "recommended replay deep-link intact" $?
grep -q 'href="/call-library?tab=sparring"' "$DASH" 2>/dev/null
check "sparring quick link intact" $?

# --- Day-200 pinned literal retained ---
grep -q 'href="/upload" className="text-xs text-indigo-300 hover:text-indigo-200 transition-colors"' "$DASH" 2>/dev/null
check "day-200 pinned indigo upload link retained" $?

if [[ "$fail" == "0" ]]; then
  echo "Day 201 validation PASSED"
else
  echo "Day 201 validation FAILED"
  exit 1
fi
