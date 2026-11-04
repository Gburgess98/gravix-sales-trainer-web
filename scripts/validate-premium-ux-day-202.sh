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
# Glass rep redesign (Day 202 pins deliberately updated): the page is now PageShell + MyAssignmentsPanel; streak/XP chips and
# the progress bar moved out of this page (Progress phase). Endpoints, optimistic completion, snooze, BroadcastChannel refresh
# and the sparring / call-review href contracts are still pinned below.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
PKG="$WEB_ROOT/package.json"
CLIENT="$WEB_ROOT/src/app/assignments/AssignmentsClient.tsx"
PANEL="$WEB_ROOT/src/components/rep/my-assignments-panel.tsx"
MODEL="$WEB_ROOT/src/lib/my-assignments-model.ts"

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
grep -q 'PageShell' "$CLIENT" 2>/dev/null
check "glass PageShell replaces PageContainer (day-179 pin updated)" $?
grep -q 'MyAssignmentsPanel' "$CLIENT" 2>/dev/null
check "page renders the shared rep panel" $?

# --- Retired styling stays retired ---
! grep -qE 'bg-white |bg-white/60' "$CLIENT" "$PANEL" 2>/dev/null
check "white CTA / progress bar recipes gone" $?
! grep -qi 'sky-' "$CLIENT" "$PANEL" 2>/dev/null
check "sky origin badge gone" $?
! grep -qiE 'fuchsia|purple|pink|cyan' "$CLIENT" "$PANEL" 2>/dev/null
check "no fuchsia/purple/pink/cyan" $?
! grep -q 'Clear tasks, fast wins' "$CLIENT" "$PANEL" 2>/dev/null
check "task-list subtitle gone" $?
! grep -q 'Daily Win' "$CLIENT" "$PANEL" 2>/dev/null
check "'Daily Win' panel title gone" $?
! grep -qE '✅|🔥|🎯' "$CLIENT" "$PANEL" 2>/dev/null
check "emoji chips gone" $?
! grep -q '(+XP soon)' "$CLIENT" "$PANEL" 2>/dev/null
check "'(+XP soon)' toast copy gone" $?
! grep -q 'Run this drill now (5 mins)' "$CLIENT" "$PANEL" 2>/dev/null
check "timed arcade next-action copy gone" $?

# --- Rep panel language + states ---
grep -q 'Do this first' "$PANEL" 2>/dev/null
check "priority card present" $?
grep -q 'Coaching work from your manager' "$CLIENT" 2>/dev/null
check "coaching subtitle present" $?
grep -q "export function typeLabel\|export const typeLabel" "$MODEL" 2>/dev/null && grep -q 'typeLabel(' "$PANEL" 2>/dev/null
check "raw a.type mapped through typeLabel" $?
grep -q 'Couldn’t load your assignments' "$PANEL" 2>/dev/null
check "calm full-error state" $?
grep -q 'tone="bad"' "$PANEL" 2>/dev/null && grep -q 'Overdue' "$PANEL" 2>/dev/null
check "overdue stays red (status duty)" $?
grep -q '<Badge tone="good">Completed</Badge>' "$PANEL" 2>/dev/null
check "completed stays green (status duty)" $?
grep -q "tone === 'bad' && Number(value) > 0" "$PANEL" 2>/dev/null
check "overdue stat: red only when > 0" $?

# --- Behaviour preserved (spot checks) ---
grep -q 'proxyJson<AssignmentsResponse>("/v1/assignments")' "$CLIENT" 2>/dev/null
check "/v1/assignments fetch intact" $?
grep -q '/daily-feed' "$CLIENT" 2>/dev/null
check "own daily-feed fetch (repId from the assignments response)" $?
! grep -q '/v1/team\|/v1/manager\|assignments/manager' "$CLIENT" "$PANEL" 2>/dev/null
check "no manager endpoint used by the rep page" $?
grep -q '/complete' "$CLIENT" 2>/dev/null && grep -q '{ method: "PATCH" }' "$CLIENT" 2>/dev/null
check "PATCH complete endpoint intact" $?
grep -q 'bumpAssignmentsRefresh("Assignment completed")' "$CLIENT" 2>/dev/null
check "cross-tab refresh bump intact" $?
grep -q 'new BroadcastChannel("gst:assignments")' "$CLIENT" 2>/dev/null
check "BroadcastChannel refresh intact" $?
grep -q "/sparring/\${encodeURIComponent(pid)}?assignmentId=" "$MODEL" 2>/dev/null
check "sparring href contract intact" $?
grep -q 'qs.set("assignment", a.id)' "$MODEL" 2>/dev/null || grep -q "qs.set('assignment', a.id)" "$MODEL" 2>/dev/null
check "call review href contract intact" $?
grep -q '/call-library?tab=sparring' "$PANEL" 2>/dev/null
check "empty-state practise href intact" $?
grep -q 'Snooze 24h' "$PANEL" 2>/dev/null && grep -q 'Show again' "$PANEL" 2>/dev/null
check "snooze + show-again controls intact" $?
grep -q 'disabled={saving}' "$PANEL" 2>/dev/null
check "Mark complete disabled state intact" $?
grep -q 'data-assignment-id' "$PANEL" 2>/dev/null
check "next-assignment highlight hook intact" $?

if [[ "$fail" == "0" ]]; then
  echo "Day 202 validation PASSED"
else
  echo "Day 202 validation FAILED"
  exit 1
fi
