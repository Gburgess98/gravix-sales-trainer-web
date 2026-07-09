#!/usr/bin/env bash
# Validates the Day 202 assignments workspace pass: /assignments loses its
# task-list/arcade styling (Daily Win emoji chips, "(+XP soon)" toast,
# white bg-white CTAs, white progress bar, sky origin badge, raw a.type
# values) in favour of coaching follow-through language (Next Best Action,
# practice streak, Progress today points) and the shared Command Centre
# primitives (SectionCard, StatCard, EmptyState, Button/buttonClasses).
# Visual/copy-only pass — all endpoints, optimistic completion, snooze,
# streak localStorage, BroadcastChannel refresh, hrefs, title attrs and
# disabled states preserved. The e2e-pinned "My Assignments" heading and
# the day-179-pinned PageContainer are retained.
# WEB-only, patch mode — no API, no migrations, no new features.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
PKG="$WEB_ROOT/package.json"
CLIENT="$WEB_ROOT/src/app/assignments/AssignmentsClient.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 202 — own checks only (use validate-tier-2b-smoke for current smoke)"

# --- Documentation + wiring ---
grep -q 'Assignments workspace pass (Day 202)' "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 202 section" $?
grep -q '"validate-premium-ux-day-202"' "$PKG" 2>/dev/null
check "package.json has validate-premium-ux-day-202 script" $?

# --- Pinned invariants retained ---
grep -q 'title="My Assignments"' "$CLIENT" 2>/dev/null
check "e2e-pinned 'My Assignments' heading retained" $?
grep -q 'PageContainer' "$CLIENT" 2>/dev/null
check "day-179-pinned PageContainer retained" $?

# --- White CTA recipe + arcade colour retired ---
! grep -q 'bg-white ' "$CLIENT" 2>/dev/null
check "white bg-white CTA recipe gone" $?
! grep -q 'bg-white/60' "$CLIENT" 2>/dev/null
check "white progress bar fill gone" $?
grep -q 'bg-indigo-500' "$CLIENT" 2>/dev/null
check "progress bar fill is indigo" $?
! grep -qi 'sky-' "$CLIENT" 2>/dev/null
check "sky origin badge gone" $?
! grep -qiE 'fuchsia|purple|pink|cyan' "$CLIENT" 2>/dev/null
check "no fuchsia/purple/pink/cyan" $?

# --- Arcade/task-list language reframed ---
! grep -q 'Clear tasks, fast wins' "$CLIENT" 2>/dev/null
check "task-list subtitle gone" $?
grep -q 'Your coaching queue' "$CLIENT" 2>/dev/null
check "coaching queue subtitle present" $?
! grep -q 'Daily Win' "$CLIENT" 2>/dev/null
check "'Daily Win' panel title gone" $?
grep -q 'title="Next Best Action"' "$CLIENT" 2>/dev/null
check "Next Best Action SectionCard present" $?
! grep -qE '✅|🔥|🎯' "$CLIENT" 2>/dev/null
check "emoji chips gone" $?
! grep -q '(+XP soon)' "$CLIENT" 2>/dev/null
check "'(+XP soon)' toast copy gone" $?
! grep -q 'XP today:' "$CLIENT" 2>/dev/null
check "'XP today' chip relabelled" $?
grep -q 'Progress today:' "$CLIENT" 2>/dev/null
check "Progress today points chip present" $?
grep -q 'Practice streak:' "$CLIENT" 2>/dev/null
check "Practice streak chip present" $?
! grep -q 'Finish one task to keep your streak alive' "$CLIENT" 2>/dev/null
check "task-language streak warning gone" $?
! grep -q 'Run this drill now (5 mins)' "$CLIENT" 2>/dev/null
check "timed arcade next-action copy gone" $?
grep -q 'function typeLabel' "$CLIENT" 2>/dev/null
check "raw a.type mapped through typeLabel" $?
grep -q 'Something went wrong.' "$CLIENT" 2>/dev/null
check "error banner has calm lead-in" $?

# --- Shared primitives adopted ---
grep -q 'import { SectionCard } from "@/components/ui/section-card"' "$CLIENT" 2>/dev/null
check "SectionCard imported" $?
[[ "$(grep -c '<SectionCard' "$CLIENT" 2>/dev/null)" -ge 3 ]]
check "at least 3 SectionCard panels (Next Best Action, Open, Completed)" $?
grep -q 'import { StatCard } from "@/components/ui/stat-card"' "$CLIENT" 2>/dev/null
check "StatCard imported" $?
[[ "$(grep -c '<StatCard' "$CLIENT" 2>/dev/null)" -ge 5 ]]
check "five momentum StatCards" $?
grep -q 'import { EmptyState } from "@/components/ui/empty-state"' "$CLIENT" 2>/dev/null
check "EmptyState imported" $?
grep -q 'import { Button, buttonClasses } from "@/components/ui/button"' "$CLIENT" 2>/dev/null
check "Button/buttonClasses imported" $?
grep -q 'buttonClasses("primary", "md")' "$CLIENT" 2>/dev/null
check "link CTAs use shared primary recipe" $?
! grep -q 'text-sm underline' "$CLIENT" 2>/dev/null
check "underline Back link upgraded to ghost recipe" $?

# --- Status colours kept on genuine status duty ---
grep -q 'border-emerald-500/30 bg-emerald-500/10' "$CLIENT" 2>/dev/null
check "emerald kept for completed status" $?
grep -q 'border-red-500/40 bg-red-500/10 border-l-4 border-l-red-500/70' "$CLIENT" 2>/dev/null
check "overdue red wash kept" $?
grep -q "variant={momentum.overdueCount > 0 ? \"danger\" : \"default\"}" "$CLIENT" 2>/dev/null
check "overdue StatCard: danger only when > 0" $?

# --- Behaviour preserved (spot checks) ---
grep -q 'proxyJson<AssignmentsResponse>("/v1/assignments")' "$CLIENT" 2>/dev/null
check "/v1/assignments fetch intact" $?
grep -q 'proxyJson<RepsMeResponse>("/v1/reps/me")' "$CLIENT" 2>/dev/null
check "/v1/reps/me fetch intact" $?
grep -q '/complete' "$CLIENT" 2>/dev/null && grep -q '{ method: "PATCH" }' "$CLIENT" 2>/dev/null
check "PATCH complete endpoint intact" $?
grep -q 'bumpAssignmentsRefresh("Assignment completed")' "$CLIENT" 2>/dev/null
check "cross-tab refresh bump intact" $?
grep -q 'sparringHref(todayFocus.id, todayFocus.target_id)' "$CLIENT" 2>/dev/null
check "sparring focus href intact" $?
grep -q 'callReviewHref(todayFocus)' "$CLIENT" 2>/dev/null
check "call review focus href intact" $?
grep -q 'href: "/sparring"' "$CLIENT" 2>/dev/null
check "empty-state Go to Sparring href intact" $?
grep -q 'href="/crm/overview"' "$CLIENT" 2>/dev/null
check "Back link href intact" $?
grep -q 'Snooze 24h' "$CLIENT" 2>/dev/null && grep -q 'Snoozed: {activeSnoozedCount} (clear)' "$CLIENT" 2>/dev/null
check "snooze + clear-snoozes controls intact" $?
grep -q 'disabled={savingId === todayFocus.id}' "$CLIENT" 2>/dev/null && grep -q 'disabled={savingId === a.id}' "$CLIENT" 2>/dev/null
check "Mark complete disabled states intact" $?
grep -q 'data-todays-focus="true"' "$CLIENT" 2>/dev/null
check "auto-focus data attribute intact" $?

if [[ "$fail" == "0" ]]; then
  echo "Day 202 validation PASSED"
else
  echo "Day 202 validation FAILED"
  exit 1
fi
