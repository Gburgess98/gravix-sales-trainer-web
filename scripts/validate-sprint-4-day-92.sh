#!/usr/bin/env bash
# Validates the Day 92 Sprint 4 deliverables: Assign Coaching from a call.
# Reuses the existing POST /v1/assignments engine — no new API endpoint.
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

# ── API: existing assignment engine supports call-linked coaching ──
grep -q 'r.post("/", requireManager' "$API_ROOT/src/routes/assignments.ts" 2>/dev/null
check "API POST /v1/assignments exists with manager gate" $?

grep -q '"call_review"' "$API_ROOT/src/routes/assignments.ts" 2>/dev/null
check "API assignments accept type call_review" $?

grep -q "payload.target_id = " "$API_ROOT/src/routes/assignments.ts" 2>/dev/null
check "API assignments support target_id call link" $?

grep -q "repId: call.user_id ? String(call.user_id) : null" "$API_ROOT/src/routes/manager.ts" 2>/dev/null
check "API command-centre callsNeedingReview includes repId" $?

# ── WEB: Assign Coaching UI ──
grep -q "Assign Coaching" "$WEB_ROOT/src/app/coaching/page.tsx" 2>/dev/null
check "WEB /coaching has Assign Coaching UI" $?

grep -q "openAssignCoaching" "$WEB_ROOT/src/app/coaching/page.tsx" 2>/dev/null
check "WEB /coaching pre-fills assignment draft from call" $?

grep -q "proxyFetch('/v1/assignments', {" "$WEB_ROOT/src/app/coaching/page.tsx" 2>/dev/null
check "WEB /coaching posts to /v1/assignments" $?

grep -q "Assign Coaching" "$WEB_ROOT/src/app/calls/[id]/page.tsx" 2>/dev/null
check "WEB /calls/[id] has Assign Coaching UI" $?

grep -q 'proxyFetch("/v1/assignments"' "$WEB_ROOT/src/app/calls/[id]/page.tsx" 2>/dev/null
check "WEB /calls/[id] posts to /v1/assignments" $?

# ── Existing flows intact ──
grep -q "proxyFetch('/v1/manager/command-centre" "$WEB_ROOT/src/app/coaching/page.tsx" 2>/dev/null
check "WEB command-centre fetch intact" $?

grep -q "manager-review" "$WEB_ROOT/src/app/coaching/page.tsx" 2>/dev/null
check "WEB manager-review flow intact" $?

grep -q '"/review-queue"' "$API_ROOT/src/routes/manager.ts" 2>/dev/null
check "API review-queue intact" $?

if [[ $fail -ne 0 ]]; then
  echo "Sprint 4 Day 92 validation FAILED"
  exit 1
fi
echo "Sprint 4 Day 92 validation PASSED"
