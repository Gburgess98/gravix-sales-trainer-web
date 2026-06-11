#!/usr/bin/env bash
# Validates the Day 99 Sprint 4 close-out.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

[[ -s "$WEB_ROOT/SPRINT_4_CLOSE.md" ]]
check "SPRINT_4_CLOSE.md exists" $?

[[ -s "$WEB_ROOT/DEMO_CHECKLIST.md" ]]
check "DEMO_CHECKLIST.md exists" $?

[[ -s "$WEB_ROOT/tests/e2e/manager-workflow.spec.ts" ]]
check "manager workflow e2e spec exists" $?

grep -q "As-built status" "$WEB_ROOT/SPRINT_4_ROADMAP.md" 2>/dev/null \
  && grep -q "As-built outcome" "$WEB_ROOT/SPRINT_4_MANAGER_VALUE_AUDIT.md" 2>/dev/null
check "Sprint 4 docs contain as-built markers" $?

bash "$WEB_ROOT/scripts/validate-sprint-4-day-98.sh" >/dev/null 2>&1
check "Day 98 validation still passes" $?

# ── Tags (informational before tagging, hard check after) ──
if git -C "$WEB_ROOT" rev-parse sprint-day-99-complete >/dev/null 2>&1; then
  check "WEB tag sprint-day-99-complete exists" 0
else
  echo "PEND  WEB tag sprint-day-99-complete not created yet"
fi
if git -C "$API_ROOT" rev-parse sprint-day-99-complete >/dev/null 2>&1; then
  check "API tag sprint-day-99-complete exists" 0
else
  echo "PEND  API tag sprint-day-99-complete not created yet"
fi

# ── Working trees clean after final commit/tag ──
[[ -z "$(git -C "$WEB_ROOT" status --porcelain)" ]]
check "WEB working tree clean" $?
[[ -z "$(git -C "$API_ROOT" status --porcelain)" ]]
check "API working tree clean" $?

if [[ $fail -ne 0 ]]; then
  echo "Sprint 4 Day 99 validation FAILED"
  exit 1
fi
echo "Sprint 4 Day 99 validation PASSED"
