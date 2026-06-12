#!/usr/bin/env bash
# Validates the Day 107 Tier 2A deliverables: rep-facing sparring summary UX.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
PAGE="$WEB_ROOT/src/app/sparring/[id]/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

grep -q "Sparring Summary" "$PAGE" 2>/dev/null
check "page shows Sparring Summary panel" $?

grep -q "dimensionAverages" "$PAGE" 2>/dev/null
check "page renders dimension breakdown" $?

grep -q "Recommended drill" "$PAGE" 2>/dev/null
check "page renders recommended drill" $?

grep -q "Weak moments" "$PAGE" 2>/dev/null
check "page renders weak moments" $?

grep -q "Next best action" "$PAGE" 2>/dev/null
check "page renders next best action" $?

grep -q "Strongest area" "$PAGE" && grep -q "Weakest area" "$PAGE"
check "page renders strongest/weakest areas" $?

grep -q "/complete" "$PAGE" 2>/dev/null && grep -q "setSessionSummary(completeData.summary)" "$PAGE"
check "page calls /complete and renders returned summary" $?

grep -q "meta?.session_summary" "$PAGE" 2>/dev/null
check "page hydrates persisted summary on load (refresh-safe)" $?

grep -q "Complete the sparring session to see your coaching summary." "$PAGE" 2>/dev/null
check "active-session empty state present" $?

grep -q "'/v1/manager/sparring-sessions?days=30&limit=5'" "$WEB_ROOT/src/app/coaching/page.tsx" 2>/dev/null
check "Day 105 Recent Sparring web fetch intact" $?

# API untouched today, but guard the artefact rule anyway
if ls "$API_ROOT/src/sparring/"*.js >/dev/null 2>&1; then
  check "no stale .js artefacts in API src/sparring/" 1
else
  check "no stale .js artefacts in API src/sparring/" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Tier 2A Day 107 validation FAILED"
  exit 1
fi
echo "Tier 2A Day 107 validation PASSED"
