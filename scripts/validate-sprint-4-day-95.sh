#!/usr/bin/env bash
# Validates the Day 95 Sprint 4 deliverables: manager workflow hardening.
# Source-level scoping checks + live 403 checks when the dev API is running.
#
# Cross-scope fixture note: no scored call exists outside the dev office, so
# the live cross-scope rejection was verified manually using a null-office
# call (office manager → 403 forbidden_out_of_scope). This script validates
# the scoping at source level.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
MANAGER="$API_ROOT/src/routes/manager.ts"
CALLS="$API_ROOT/src/routes/calls.ts"
ASSIGN="$API_ROOT/src/routes/assignments.ts"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

# ── Route gates (requireManager) ──
grep -q 'router.use(requireManager)' "$MANAGER" 2>/dev/null || grep -q 'requireManager' "$MANAGER" 2>/dev/null
check "manager router gated by requireManager" $?

grep -q '"/:id/manager-review", requireManager' "$CALLS" 2>/dev/null
check "POST /v1/calls/:id/manager-review gated by requireManager" $?

grep -q 'r.post("/", requireManager' "$ASSIGN" 2>/dev/null
check "POST /v1/assignments gated by requireManager" $?

grep -q '"/manager", requireManager' "$ASSIGN" 2>/dev/null
check "GET /v1/assignments/manager gated by requireManager" $?

# ── Hierarchy scoping ──
grep -q "applyHierarchyFilters(callsQuery, userContext)" "$MANAGER" 2>/dev/null
check "command-centre applies hierarchy filters to calls" $?

grep -q "applyHierarchyFilters(assignmentsQuery, userContext)" "$MANAGER" 2>/dev/null
check "command-centre applies hierarchy filters to assignments" $?

grep -qc "applyHierarchyFilters" "$MANAGER" >/dev/null && [[ "$(grep -c applyHierarchyFilters "$MANAGER")" -ge 5 ]]
check "review-queue/trend queries also hierarchy-filtered (>=5 uses)" $?

grep -q "forbidden_out_of_scope" "$CALLS" 2>/dev/null
check "manager-review rejects out-of-scope calls" $?

grep -q "getManagerUserContext" "$CALLS" 2>/dev/null
check "manager-review resolves UserContext for scope check" $?

# ── Audit events ──
grep -q '"manager.call_reviewed"' "$CALLS" 2>/dev/null
check "audit event manager.call_reviewed exists" $?

grep -q '"manager.coaching_assigned_from_call"' "$ASSIGN" 2>/dev/null
check "audit event manager.coaching_assigned_from_call exists" $?

grep -q "void logAuditEvent" "$CALLS" 2>/dev/null && grep -q "void logAuditEvent" "$ASSIGN"
check "audit writes are fail-soft (fire-and-forget)" $?

# ── Day 90–94 flows still present ──
grep -q '"/command-centre"' "$MANAGER"; check "Day 90: command-centre route present" $?
grep -q '"/review-queue"' "$MANAGER"; check "Day 91: review-queue route present" $?
grep -q "call_manager_reviews" "$MANAGER"; check "Day 91: review history used" $?
grep -q "openAssignCoaching" "$COACHING"; check "Day 92: Assign Coaching flow present" $?
grep -q "value: 'completed', label: 'Completed'" "$COACHING"; check "Day 93: assignment filters present" $?
grep -q "trendLabel" "$MANAGER"; check "Day 94: trend fields present" $?
grep -q "coachingImpact" "$MANAGER"; check "Day 94: coachingImpact present" $?

# ── Live checks (dev API on :4000) ──
if curl -s -o /dev/null --max-time 2 http://localhost:4000/ 2>/dev/null; then
  NM="00000000-0000-4000-8000-000000000000"
  for ep in "manager/command-centre" "manager/review-queue"; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -H "x-user-id: $NM" "http://localhost:4000/v1/$ep")
    [[ "$code" == "403" ]]
    check "live: non-manager 403 on /v1/$ep" $?
  done
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -X POST -H "x-user-id: $NM" \
    "http://localhost:4000/v1/calls/00000000-0000-4000-8000-000000000001/manager-review")
  [[ "$code" == "403" ]]
  check "live: non-manager 403 on manager-review" $?
else
  echo "SKIP  live 403 checks (dev API not running on :4000)"
fi

if [[ $fail -ne 0 ]]; then
  echo "Sprint 4 Day 95 validation FAILED"
  exit 1
fi
echo "Sprint 4 Day 95 validation PASSED"
