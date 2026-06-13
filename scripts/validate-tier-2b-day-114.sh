#!/usr/bin/env bash
# Validates the Day 114 Tier 2B deliverables: manager whisperer visibility.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
MANAGER="$API_ROOT/src/routes/manager.ts"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

grep -q '"/whisperer-sessions"' "$MANAGER" 2>/dev/null
check "GET /v1/manager/whisperer-sessions exists" $?

grep -q "router.use(requireManager)" "$MANAGER" 2>/dev/null || grep -q "requireManager" "$MANAGER"
check "manager router gated by requireManager" $?

grep -q "whisperer_sessions" "$MANAGER" 2>/dev/null && grep -q "whisperer_triggers" "$MANAGER"
check "whisperer_sessions / whisperer_triggers referenced" $?

grep -q "applyHierarchyFilters(sessionQuery, userContext)" "$MANAGER" 2>/dev/null
check "hierarchy/tenant scoping applied" $?

grep -q "whispererTablesAvailable" "$MANAGER" 2>/dev/null
check "fail-soft persistence probe used" $?

grep -q "'/v1/manager/whisperer-sessions?days=30&limit=5'" "$COACHING" 2>/dev/null
check "/coaching fetches manager whisperer sessions" $?

grep -q '"Whisperer Insights"' "$COACHING" 2>/dev/null
check "/coaching includes Whisperer Insights card" $?

grep -q "No Whisperer sessions yet." "$COACHING" 2>/dev/null && \
grep -q "Could not load Whisperer sessions." "$COACHING" && \
grep -q "Whisperer persistence is not enabled yet." "$COACHING"
check "/coaching includes empty/error/persistence copy" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-113.sh" >/dev/null 2>&1
check "Day 113 validation still passes" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-112.sh" >/dev/null 2>&1
check "Day 112 validation still passes" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-111.sh" >/dev/null 2>&1
check "Day 111 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 114 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 114 validation PASSED"
