#!/usr/bin/env bash
# Validates the Day 167 demo-data readiness audit + live walkthrough artefacts:
# the checklist result is documented (ready/weak/blocker per section), the top
# blocker (manager 403 on rep call detail) is recorded with its fix, and no
# forbidden feature lanes were opened. Own checks only, Day 135 rhythm, no
# recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAN="$WEB_ROOT/DEMO_READINESS_PLAN.md"
AUDIT="$WEB_ROOT/DEMO_DATA_READINESS_AUDIT.md"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
API_ROOT="$WEB_ROOT/../gravix-sales-trainer-api"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Demo Readiness Day 167 — own checks only (use validate-tier-2b-smoke for current smoke)"

# ── documentation exists ──
grep -q "Day 167" "$PLAN" 2>/dev/null
check "DEMO_READINESS_PLAN.md includes Day 167" $?

test -f "$AUDIT"
check "DEMO_DATA_READINESS_AUDIT.md exists" $?

# ── audit covers the checklist verdict vocabulary ──
grep -q "Ready" "$AUDIT" 2>/dev/null
check "audit includes \"Ready\"" $?

grep -q "Weak" "$AUDIT" 2>/dev/null
check "audit includes \"Weak\"" $?

grep -q "Demo blocker" "$AUDIT" 2>/dev/null
check "audit includes \"Demo blocker\"" $?

grep -q "Ready to demo?" "$AUDIT" 2>/dev/null
check "audit includes a \"Ready to demo?\" verdict" $?

# ── audit covers every demo-path surface ──
grep -q "Review Queue" "$AUDIT" 2>/dev/null
check "audit covers Review Queue" $?

grep -q "Coaching Queue" "$AUDIT" 2>/dev/null
check "audit covers Coaching Queue" $?

grep -q "Queue-assigned sparring" "$AUDIT" 2>/dev/null
check "audit covers Queue-assigned sparring" $?

grep -q "AI Discovery" "$AUDIT" 2>/dev/null
check "audit covers AI Discovery" $?

grep -q "Whisperer" "$AUDIT" 2>/dev/null
check "audit covers Whisperer" $?

# ── top blocker + fix recorded ──
grep -q "getRequesterOrgId" "$AUDIT" 2>/dev/null
check "audit records the call-detail 403 fix (getRequesterOrgId)" $?

if [[ -f "$API_ROOT/src/routes/calls.ts" ]]; then
  grep -q 'from("reps")' "$API_ROOT/src/routes/calls.ts" 2>/dev/null && \
    grep -q "Day 167" "$API_ROOT/src/routes/calls.ts" 2>/dev/null
  check "API calls route has the Day 167 reps-table org fallback" $?
else
  echo "SKIP  API repo not found next to WEB (calls.ts fallback check)"
fi

# ── Day 167 official build day: seed strategy documented ──
STRATEGY="$WEB_ROOT/DEMO_ORG_SEED_STRATEGY.md"

test -f "$STRATEGY"
check "DEMO_ORG_SEED_STRATEGY.md exists" $?

grep -q "UFC Elite" "$STRATEGY" 2>/dev/null
check "seed strategy targets UFC Elite" $?

grep -qi "Whisperer session" "$STRATEGY" 2>/dev/null
check "seed strategy includes Whisperer session" $?

grep -qi "AI trigger candidate" "$STRATEGY" 2>/dev/null
check "seed strategy includes AI trigger candidate" $?

grep -qi "custom trigger" "$STRATEGY" 2>/dev/null
check "seed strategy includes custom trigger" $?

grep -qi "queue-assigned sparring" "$STRATEGY" 2>/dev/null
check "seed strategy includes queue-assigned sparring" $?

grep -qi "completed sparring proof" "$STRATEGY" 2>/dev/null
check "seed strategy includes completed sparring proof" $?

grep -q "Day 167" "$AUDIT" 2>/dev/null
check "DEMO_DATA_READINESS_AUDIT.md includes Day 167" $?

# ── Day 167 null-office patch: applyLibraryScope guards office_id ──
if [[ -f "$API_ROOT/src/routes/manager.ts" ]]; then
  grep -q "Day 167" "$API_ROOT/src/routes/manager.ts" 2>/dev/null && \
    grep -A8 "function applyLibraryScope" "$API_ROOT/src/routes/manager.ts" 2>/dev/null | \
    grep -q 'if (ctx.office_id) return query.eq("office_id", ctx.office_id);'
  check "API applyLibraryScope has Day 167 null-office company fallback" $?
else
  echo "SKIP  API repo not found next to WEB (applyLibraryScope check)"
fi

# ── no LLM on the live hot path in WEB src ──
! grep -riqE "chat\.completions|responses\.create" "$WEB_ROOT/src" --include="*.ts" --include="*.tsx" 2>/dev/null
check "no LLM on live hot path in WEB src" $?

# ── smoke baseline still present ──
test -f "$SMOKE"
check "validate-tier-2b-smoke.sh still exists" $?

grep -q "validate-tier-2b-smoke" "$WEB_ROOT/package.json" 2>/dev/null
check "package.json keeps validate-tier-2b-smoke" $?

# ── forbidden lanes stayed closed (WEB src) ──
! grep -riE "elevenlabs|text-to-speech|voice agent" "$WEB_ROOT/src" --include="*.ts" --include="*.tsx" -l >/dev/null 2>&1
check "no ElevenLabs/TTS/Voice Agent in WEB src" $?

# no new migration added today unless absolutely required (none expected)
! find "$API_ROOT/sql" -name "*.sql" -newermt "2026-07-02 00:00:00" 2>/dev/null | grep -q .
check "no new API migration added today" $?

echo
if [[ "$fail" == "0" ]]; then
  echo "Day 167 validation PASSED"
else
  echo "Day 167 validation FAILED"
fi
exit "$fail"
