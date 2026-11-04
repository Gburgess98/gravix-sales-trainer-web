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
# Staging redesign: Home keeps the summary; the trend chart, skill board and development level moved to
# /progress (+ shared src/lib/progress-model.ts). Pins that describe that content read all three.
# Glass Progress redesign: the old /progress pins (indigo chart, Development Progress, Progress Points …) are repointed
# at the new Progress files below, with the same intent (labelled, calm, status colours only for status).
PROG="$(mktemp)"
cat "$WEB_ROOT/src/app/progress/page.tsx" "$WEB_ROOT/src/components/rep/progress-view.tsx" "$WEB_ROOT/src/lib/progress-view-model.ts" > "$PROG" 2>/dev/null
DASH="$(mktemp)"
cat "$WEB_ROOT/src/app/dashboard/page.tsx" "$WEB_ROOT/src/app/progress/page.tsx" "$WEB_ROOT/src/lib/progress-model.ts" > "$DASH" 2>/dev/null

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
grep -q "CHART_LINE = '#60a5fa'" "$PROG" 2>/dev/null
check "progress chart uses the shared glass blue (indigo #818cf8 retired)" $?
! grep -qE 'fuchsia|purple|pink' "$DASH" 2>/dev/null
check "no fuchsia/purple/pink" $?

# --- Arcade language reframed ---
! grep -q 'XP & Progression' "$DASH" 2>/dev/null
check "'XP & Progression' panel title gone" $?
grep -q 'Practice and consistency' "$PROG" 2>/dev/null
check "practice-and-consistency panel present (was Development Progress)" $?
! grep -q "Today's XP" "$DASH" 2>/dev/null
check "'Today's XP' stat label gone" $?
grep -q 'today · ' "$PROG" 2>/dev/null
check "points today shown and labelled" $?
grep -q 'calculated from points' "$PROG" 2>/dev/null
check "level is labelled as calculated from points" $?
grep -q 'Points</dt>' "$PROG" 2>/dev/null
check "points shown with a plain label (no XP)" $?
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
grep -q 'Your trend appears after your first scored calls' "$PROG" 2>/dev/null
check "calm progress empty state present" $?

# --- Emerald/amber off non-status duty ---
! grep -q 'text-emerald-400/80' "$DASH" 2>/dev/null
check "mission impact emerald accent gone" $?
! grep -q 'text-emerald-400/70' "$DASH" 2>/dev/null
check "'+N XP today' emerald accent gone" $?
grep -q "variant={summary?.overdue_count ? 'danger' : 'default'}" "$DASH" 2>/dev/null
check "open-assignments stat: danger only when overdue" $?
grep -qF '&repId=${encodeURIComponent(id)}' "$PROG" 2>/dev/null
check "voice trend is requested for the rep only (repId=)" $?

# --- Shared primitives adopted ---
grep -q "from '@/components/ds'" "$PROG" 2>/dev/null
check "progress uses the shared glass primitives" $?
[[ "$(grep -c '<SectionCard' "$DASH" 2>/dev/null)" -ge 5 ]]
check "at least 5 SectionCard panels" $?
grep -q 'dsButton' "$PROG" 2>/dev/null
check "progress uses the shared dsButton recipe" $?
# Day 45 refresh: the Start-now CTA is now THE single primary action on Home (shared
# primary recipe) and the duplicate ghost quick-links row was replaced by the
# "Continue" tiles (the sidebar already lists those destinations).
grep -q "dsButton('primary'" "$PROG" 2>/dev/null
check "primary next-action uses the shared recipe" $?
! grep -q "Quick links" "$DASH" 2>/dev/null
check "duplicate quick-links row removed (Day 45)" $?

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
grep -q '/call-library?tab=sparring' "$PROG" 2>/dev/null
check "sparring link intact" $?

# --- Day-200 pinned literal retained ---
grep -q 'href="/upload"' "$PROG" 2>/dev/null
check "upload link retained" $?

if [[ "$fail" == "0" ]]; then
  echo "Day 201 validation PASSED"
else
  echo "Day 201 validation FAILED"
  exit 1
fi
