#!/usr/bin/env bash
# Validates the Day 96 Sprint 4 deliverables: call review UX + demo readiness.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
CALLPAGE="$WEB_ROOT/src/app/calls/[id]/page.tsx"
CALLS="$API_ROOT/src/routes/calls.ts"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

# ── API: review read route ──
grep -q 'router.get("/:id/manager-review", requireManager' "$CALLS" 2>/dev/null
check "API GET /v1/calls/:id/manager-review exists (requireManager)" $?

grep -q 'reviewed: false, review: null' "$CALLS" 2>/dev/null
check "API returns reviewed:false when no review exists" $?

# ── WEB: call detail review state ──
grep -q 'proxyFetch(`/v1/calls/${encodeURIComponent(callId)}/manager-review`, { cache: "no-store" })' "$CALLPAGE" 2>/dev/null
check "WEB /calls/[id] fetches review state on load" $?

grep -q "Reviewed ✓" "$CALLPAGE" 2>/dev/null
check "WEB /calls/[id] shows Reviewed ✓ state" $?

grep -q "Manager Review Note" "$CALLPAGE" 2>/dev/null
check "WEB /calls/[id] shows Manager Review Note block" $?

grep -q "Mark Reviewed" "$CALLPAGE" 2>/dev/null
check "WEB /calls/[id] still includes Mark Reviewed" $?

grep -q "Assign Coaching" "$CALLPAGE" 2>/dev/null
check "WEB /calls/[id] still includes Assign Coaching" $?

grep -q "reviewedAt" "$CALLPAGE" 2>/dev/null
check "WEB reviewed state includes review date" $?

# ── Earlier flows intact ──
grep -q "'/v1/manager/review-queue" "$COACHING" 2>/dev/null
check "WEB /coaching review queue intact" $?

grep -q '"manager.call_reviewed"' "$CALLS" 2>/dev/null
check "Day 95: manager.call_reviewed audit event intact" $?

grep -q '"manager.coaching_assigned_from_call"' "$API_ROOT/src/routes/assignments.ts" 2>/dev/null
check "Day 95: manager.coaching_assigned_from_call audit event intact" $?

[[ -s "$WEB_ROOT/DEMO_CHECKLIST.md" ]]
check "DEMO_CHECKLIST.md exists" $?

if [[ $fail -ne 0 ]]; then
  echo "Sprint 4 Day 96 validation FAILED"
  exit 1
fi
echo "Sprint 4 Day 96 validation PASSED"
