#!/usr/bin/env bash
# Validates the Day 108 Tier 2A consolidation deliverables.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
SPEC="$WEB_ROOT/tests/e2e/sparring-summary.spec.ts"
CLOSE="$WEB_ROOT/TIER_2A_CLOSE.md"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

[[ -s "$SPEC" ]];  check "sparring-summary.spec.ts exists" $?

grep -q "Sparring Summary" "$SPEC" 2>/dev/null
check "spec asserts Sparring Summary" $?

grep -q "Confidence Drill" "$SPEC" 2>/dev/null
check "spec asserts recommended drill" $?

grep -q "/complete" "$SPEC" 2>/dev/null
check "spec mocks /complete endpoint" $?

grep -q "page.reload()" "$SPEC" 2>/dev/null
check "spec asserts persistence after reload" $?

[[ -s "$CLOSE" ]]; check "TIER_2A_CLOSE.md exists" $?

grep -q "Final workflow" "$CLOSE" 2>/dev/null && grep -q "Manager assigns sparring" "$CLOSE"
check "close doc includes final workflow" $?

grep -q "original 16 Tier 2A items" "$CLOSE" 2>/dev/null
check "close doc includes honest 16-item status" $?

grep -q '"outDir": "dist"' "$API_ROOT/tsconfig.json" 2>/dev/null
check "API tsconfig outDir set" $?

if ls "$API_ROOT/src/sparring/"*.js >/dev/null 2>&1; then
  check "no stale .js artefacts in API src/sparring/" 1
else
  check "no stale .js artefacts in API src/sparring/" 0
fi

bash "$WEB_ROOT/scripts/validate-tier-2a-day-107.sh" >/dev/null 2>&1
check "Day 107 validation still passes" $?

bash "$API_ROOT/scripts/validate-tier-2a-day-106.sh" >/dev/null 2>&1
check "Day 106 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2A Day 108 validation FAILED"
  exit 1
fi
echo "Tier 2A Day 108 validation PASSED"
