#!/usr/bin/env bash
# Validates the Day 93 Sprint 4 deliverables: assignment tracking polish.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"

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

# ── API: extended openAssignments shape ──
grep -q "resolveAssignmentPriority" "$API_ROOT/src/routes/manager.ts" 2>/dev/null
check "API command-centre prefers meta.priority" $?

grep -q "assignmentOrigin" "$API_ROOT/src/routes/manager.ts" 2>/dev/null
check "API command-centre includes origin/source" $?

grep -q "assignmentSourceCallId" "$API_ROOT/src/routes/manager.ts" 2>/dev/null
check "API command-centre includes sourceCallId" $?

grep -q "originLabel: origin.label" "$API_ROOT/src/routes/manager.ts" 2>/dev/null
check "API openAssignments expose originLabel" $?

# ── WEB: assignments tab polish ──
grep -q "value: 'completed', label: 'Completed'" "$COACHING" 2>/dev/null
check "WEB assignment filters include Open/Overdue/Completed/All" $?

grep -q "Assigned via review" "$COACHING" 2>/dev/null
check "WEB shows 'Assigned via review' origin label" $?

grep -q 'href={`/calls/${sourceCallId}`}' "$COACHING" 2>/dev/null
check "WEB assignments tab links source call via /calls/" $?

grep -q 'href={`/calls/${a.sourceCallId}`}' "$COACHING" 2>/dev/null
check "WEB Open Coaching card links source call via /calls/" $?

grep -q "'/v1/assignments/manager?limit=100'" "$COACHING" 2>/dev/null
check "WEB assignments tab uses manager-scoped endpoint" $?

grep -q "No overdue coaching assignments." "$COACHING" 2>/dev/null
check "WEB per-filter empty states present" $?

# ── Earlier flows intact ──
grep -q "proxyFetch('/v1/manager/command-centre" "$COACHING" 2>/dev/null
check "WEB command-centre fetch intact (Day 90)" $?

grep -q "manager-review" "$COACHING" 2>/dev/null
check "WEB manager-review flow intact (Day 91)" $?

grep -q "openAssignCoaching" "$COACHING" 2>/dev/null
check "WEB Assign Coaching flow intact (Day 92)" $?

if [[ $fail -ne 0 ]]; then
  echo "Sprint 4 Day 93 validation FAILED"
  exit 1
fi
echo "Sprint 4 Day 93 validation PASSED"
