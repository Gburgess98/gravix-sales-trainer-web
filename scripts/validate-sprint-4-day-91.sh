#!/usr/bin/env bash
# Validates the Day 91 Sprint 4 deliverables:
#  - migration for call_manager_reviews exists
#  - POST /v1/calls/:id/manager-review exists
#  - GET /v1/manager/review-queue exists
#  - command-centre uses the review history helper
#  - WEB posts to manager-review and still fetches command-centre
#
# Known pre-existing blockers (not Day 91 regressions):
#  - web `next build` fails on a JSX syntax error in AdminAssignmentsClient.tsx
#  - web typecheck: 195 pre-existing errors; API typecheck: 71 pre-existing errors
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"

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

# ── Migration ──
[[ -s "$API_ROOT/sql/20260610_call_manager_reviews.sql" ]]
check "API migration sql/20260610_call_manager_reviews.sql exists" $?

grep -q "create table if not exists public.call_manager_reviews" "$API_ROOT/sql/20260610_call_manager_reviews.sql" 2>/dev/null
check "Migration creates call_manager_reviews" $?

# ── API endpoints ──
grep -q '"/:id/manager-review"' "$API_ROOT/src/routes/calls.ts" 2>/dev/null
check "API POST /v1/calls/:id/manager-review exists" $?

grep -q '"/review-queue"' "$API_ROOT/src/routes/manager.ts" 2>/dev/null
check "API GET /v1/manager/review-queue exists" $?

grep -q "call_manager_reviews" "$API_ROOT/src/routes/manager.ts" 2>/dev/null
check "API command-centre references call_manager_reviews history" $?

# ── WEB wiring ──
grep -q "manager-review" "$WEB_ROOT/src/app/coaching/page.tsx" 2>/dev/null
check "WEB /coaching posts to /v1/calls/:id/manager-review" $?

grep -q "manager-review" "$WEB_ROOT/src/app/calls/[id]/page.tsx" 2>/dev/null
check "WEB /calls/[id] posts to /v1/calls/:id/manager-review" $?

grep -q "proxyFetch('/v1/manager/command-centre" "$WEB_ROOT/src/app/coaching/page.tsx" 2>/dev/null
check "WEB /coaching still fetches /v1/manager/command-centre" $?

grep -q "proxyFetch('/v1/manager/review-queue" "$WEB_ROOT/src/app/coaching/page.tsx" 2>/dev/null
check "WEB /coaching fetches /v1/manager/review-queue" $?

# ── Optional live checks (dev API on :4000) ──
if curl -s -o /dev/null --max-time 2 http://localhost:4000/v1/debug/health 2>/dev/null; then
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
    -H "x-user-id: 00000000-0000-4000-8000-000000000000" \
    http://localhost:4000/v1/manager/review-queue)
  [[ "$code" == "403" ]]
  check "API live: review-queue rejects non-manager (403)" $?
else
  echo "SKIP  live API checks (dev server not running on :4000)"
fi

if [[ $fail -ne 0 ]]; then
  echo "Sprint 4 Day 91 validation FAILED"
  exit 1
fi
echo "Sprint 4 Day 91 validation PASSED"
echo "NOTE: full review loop activates after running sql/20260610_call_manager_reviews.sql in the Supabase SQL editor."
