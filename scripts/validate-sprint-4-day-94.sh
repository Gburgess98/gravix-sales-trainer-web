#!/usr/bin/env bash
# Validates the Day 94 Sprint 4 deliverables: weakness trends + coaching impact.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
MANAGER="$API_ROOT/src/routes/manager.ts"

fail=0

check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then
    echo "OK    $label"
  else
    echo "FAIL  $label"
    fail=1
  fi
}

# ── API: trend fields ──
grep -q "previousAverageScore" "$MANAGER" 2>/dev/null
check "API weakestSkills includes previousAverageScore" $?

grep -q "trendLabel" "$MANAGER" 2>/dev/null
check "API weakestSkills includes trend/trendLabel" $?

grep -q "New this period" "$MANAGER" 2>/dev/null
check "API handles 'new' trend (no previous data)" $?

grep -q "coachingImpact" "$MANAGER" 2>/dev/null
check "API command-centre includes coachingImpact" $?

grep -q "prevSince" "$MANAGER" 2>/dev/null
check "API queries previous matching window" $?

# ── WEB: trend rendering ──
grep -q "s.trendLabel" "$COACHING" 2>/dev/null
check "WEB Weakest Skills renders trend labels" $?

grep -q '"Coaching Impact"' "$COACHING" 2>/dev/null
check "WEB Coaching Impact card present" $?

grep -q "coachingImpact" "$COACHING" 2>/dev/null
check "WEB consumes coachingImpact payload" $?

# ── Earlier flows intact ──
grep -q "manager-review" "$COACHING" 2>/dev/null
check "WEB manager-review flow intact (Day 91)" $?

grep -q "openAssignCoaching" "$COACHING" 2>/dev/null
check "WEB Assign Coaching flow intact (Day 92)" $?

grep -q "value: 'completed', label: 'Completed'" "$COACHING" 2>/dev/null
check "WEB assignment filters intact (Day 93)" $?

if [[ $fail -ne 0 ]]; then
  echo "Sprint 4 Day 94 validation FAILED"
  exit 1
fi
echo "Sprint 4 Day 94 validation PASSED"
