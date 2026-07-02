#!/usr/bin/env bash
# Validates the Day 168 demo-org data visibility work: assignment scoping +
# /v1/team/users tenant scoping documented, seed strategy updated, and no
# forbidden lanes opened. Own checks only, Day 135 rhythm, no recursive
# historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAN="$WEB_ROOT/DEMO_READINESS_PLAN.md"
AUDIT="$WEB_ROOT/DEMO_DATA_READINESS_AUDIT.md"
STRATEGY="$WEB_ROOT/DEMO_ORG_SEED_STRATEGY.md"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
API_ROOT="$WEB_ROOT/../gravix-sales-trainer-api"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Demo Readiness Day 168 — own checks only (use validate-tier-2b-smoke for current smoke)"

# ── documentation updated ──
grep -q "Day 168" "$AUDIT" 2>/dev/null
check "DEMO_DATA_READINESS_AUDIT.md includes Day 168" $?

grep -qi "visibility/scoping blockers fixed" "$STRATEGY" 2>/dev/null
check "seed strategy notes visibility/scoping blockers fixed" $?

grep -q "Day 168" "$PLAN" 2>/dev/null
check "DEMO_READINESS_PLAN.md includes Day 168" $?

# ── API-side fixes present (when API repo sits next to WEB) ──
if [[ -f "$API_ROOT/src/routes/assignments.ts" ]]; then
  grep -q "function applyOrgScope" "$API_ROOT/src/routes/assignments.ts" 2>/dev/null
  check "API assignments.ts has applyOrgScope helper" $?

  ! grep -q 'q\.eq("office_id", managerContext\.office_id)' "$API_ROOT/src/routes/assignments.ts" 2>/dev/null
  check "API assignments.ts has no unguarded office filter" $?

  grep -q "resolveCompanyId" "$API_ROOT/src/routes/team.ts" 2>/dev/null
  check "API team.ts is tenant-scoped (resolveCompanyId)" $?
else
  echo "SKIP  API repo not found next to WEB (assignments/team checks)"
fi

# ── smoke baseline still present ──
test -f "$SMOKE"
check "validate-tier-2b-smoke.sh still exists" $?

grep -q "validate-tier-2b-smoke" "$WEB_ROOT/package.json" 2>/dev/null
check "package.json keeps validate-tier-2b-smoke" $?

# ── forbidden lanes stayed closed ──
! grep -riE "elevenlabs|text-to-speech|voice agent" "$WEB_ROOT/src" --include="*.ts" --include="*.tsx" -l >/dev/null 2>&1
check "no ElevenLabs/TTS/Voice Agent in WEB src" $?

! grep -riqE "chat\.completions|responses\.create" "$WEB_ROOT/src" --include="*.ts" --include="*.tsx" 2>/dev/null
check "no LLM on live hot path in WEB src" $?

# no new Whisperer feature expansion in WEB (no new whisperer route dirs today)
! find "$WEB_ROOT/src/app" -type d -iname "*whisperer*" -newermt "2026-07-02 00:00:00" 2>/dev/null | grep -q .
check "no new Whisperer route added today" $?

# no new migration added today
! find "$API_ROOT/sql" -name "*.sql" -newermt "2026-07-02 00:00:00" 2>/dev/null | grep -q .
check "no new API migration added today" $?

echo
if [[ "$fail" == "0" ]]; then
  echo "Day 168 validation PASSED"
else
  echo "Day 168 validation FAILED"
fi
exit "$fail"
