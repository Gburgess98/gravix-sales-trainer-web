#!/usr/bin/env bash
# Validates the Day 98 Sprint 4 deliverables: QA close-out + as-built docs.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

# ── E2E spec present ──
[[ -s "$WEB_ROOT/tests/e2e/manager-workflow.spec.ts" ]]
check "manager workflow e2e spec exists" $?

# ── As-built markers in docs ──
grep -q "As-built status" "$WEB_ROOT/SPRINT_4_ROADMAP.md" 2>/dev/null
check "SPRINT_4_ROADMAP.md has as-built status + actuals" $?

grep -q "As-built outcome" "$WEB_ROOT/SPRINT_4_MANAGER_VALUE_AUDIT.md" 2>/dev/null
check "SPRINT_4_MANAGER_VALUE_AUDIT.md has as-built outcome" $?

grep -q "Implemented across Days 90–97" "$WEB_ROOT/DAY_90_IMPLEMENTATION_PLAN.md" 2>/dev/null
check "DAY_90_IMPLEMENTATION_PLAN.md has implemented section" $?

# ── Demo checklist coverage ──
for term in "Review Queue" "Assign Coaching" "Weakness Trends" "Coaching Impact" "ROI" "Mark Reviewed" "Team Health" "Manager Review Note"; do
  grep -q "$term" "$WEB_ROOT/DEMO_CHECKLIST.md" 2>/dev/null
  check "DEMO_CHECKLIST covers: $term" $?
done

# ── UK spelling: no US spellings in Sprint 4 manager-facing copy/docs ──
# (scrollIntoView({ behavior }) is a DOM API, not copy — excluded)
hits=$(grep -rn "summarize\|organization\|prioritization\|canceled\|labeled\|analyzed" \
  "$WEB_ROOT/src/app/coaching" "$WEB_ROOT/DEMO_CHECKLIST.md" \
  "$WEB_ROOT/SPRINT_4_ROADMAP.md" "$WEB_ROOT/SPRINT_4_MANAGER_VALUE_AUDIT.md" \
  "$WEB_ROOT/DAY_90_IMPLEMENTATION_PLAN.md" 2>/dev/null | wc -l | tr -d ' ')
[[ "$hits" == "0" ]]
check "no US spellings in Sprint 4 copy/docs (found: $hits)" $?

# ── Day 97 validation still passes ──
bash "$WEB_ROOT/scripts/validate-sprint-4-day-97.sh" >/dev/null 2>&1
check "Day 97 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Sprint 4 Day 98 validation FAILED"
  exit 1
fi
echo "Sprint 4 Day 98 validation PASSED"
