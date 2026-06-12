#!/usr/bin/env bash
# Validates the Day 109 Tier 2A close-out.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

[[ -s "$WEB_ROOT/TIER_2A_CLOSE.md" ]]
check "TIER_2A_CLOSE.md exists" $?

grep -q "Sparring Summary" "$WEB_ROOT/DEMO_CHECKLIST.md" 2>/dev/null
check "demo checklist addendum includes Sparring Summary" $?

grep -q "Recent Sparring" "$WEB_ROOT/DEMO_CHECKLIST.md" 2>/dev/null
check "demo checklist addendum includes Recent Sparring" $?

[[ -s "$WEB_ROOT/tests/e2e/sparring-summary.spec.ts" ]]
check "sparring-summary e2e spec exists" $?

grep -q '"outDir": "dist"' "$API_ROOT/tsconfig.json" 2>/dev/null
check "API tsconfig has outDir" $?

if ls "$API_ROOT/src/sparring/"*.js >/dev/null 2>&1; then
  check "no stale .js artefacts in API src/sparring/" 1
else
  check "no stale .js artefacts in API src/sparring/" 0
fi

bash "$WEB_ROOT/scripts/validate-tier-2a-day-108.sh" >/dev/null 2>&1
check "Day 108 validation still passes" $?

# ── Tag (informational pre-tag, hard check post-tag) ──
if git -C "$WEB_ROOT" rev-parse sprint-day-109-complete >/dev/null 2>&1; then
  check "WEB tag sprint-day-109-complete exists" 0
else
  echo "PEND  WEB tag sprint-day-109-complete not created yet"
fi
if git -C "$API_ROOT" rev-parse sprint-day-109-complete >/dev/null 2>&1; then
  check "API tag sprint-day-109-complete exists" 0
else
  echo "PEND  API tag sprint-day-109-complete not created yet"
fi

[[ -z "$(git -C "$WEB_ROOT" status --porcelain)" ]]
check "WEB working tree clean" $?
[[ -z "$(git -C "$API_ROOT" status --porcelain)" ]]
check "API working tree clean" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2A Day 109 validation FAILED"
  exit 1
fi
echo "Tier 2A Day 109 validation PASSED"
