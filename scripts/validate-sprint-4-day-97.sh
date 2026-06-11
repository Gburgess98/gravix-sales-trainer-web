#!/usr/bin/env bash
# Validates the Day 97 Sprint 4 deliverables: manager workflow e2e regression test.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SPEC="$WEB_ROOT/tests/e2e/manager-workflow.spec.ts"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

[[ -s "$SPEC" ]]
check "manager-workflow.spec.ts exists" $?

grep -q "/v1/manager/command-centre" "$SPEC" 2>/dev/null
check "spec mocks command-centre proxy" $?

grep -q "/v1/manager/review-queue" "$SPEC" 2>/dev/null
check "spec mocks review-queue proxy" $?

grep -q "/v1/calls/call-1/manager-review" "$SPEC" 2>/dev/null
check "spec mocks manager-review POST" $?

grep -q "'/v1/assignments') && method === 'POST'" "$SPEC" 2>/dev/null
check "spec mocks assignment POST" $?

grep -q "Assign Coaching" "$SPEC" 2>/dev/null
check "spec covers Assign Coaching" $?

grep -q "Mark Reviewed" "$SPEC" 2>/dev/null
check "spec covers Mark Reviewed" $?

grep -q "Call marked as reviewed." "$SPEC" 2>/dev/null && grep -q "Coaching assigned." "$SPEC"
check "spec asserts success copy" $?

grep -q "No calls need manager review." "$SPEC" 2>/dev/null
check "spec asserts queue clears" $?

grep -q "From call" "$SPEC" 2>/dev/null
check "spec asserts From call link" $?

grep -q "test:smoke" "$WEB_ROOT/package.json" 2>/dev/null
check "existing smoke command intact" $?

if [[ $fail -ne 0 ]]; then
  echo "Sprint 4 Day 97 validation FAILED"
  exit 1
fi
echo "Sprint 4 Day 97 validation PASSED"
