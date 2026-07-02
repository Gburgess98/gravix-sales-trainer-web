#!/usr/bin/env bash
# Validates the Day 169 UFC demo story seed work: seed script + docs updated,
# story chapters recorded, and no forbidden lanes opened. Own checks only,
# Day 135 rhythm, no recursive historical chain.
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

echo "Demo Readiness Day 169 — own checks only (use validate-tier-2b-smoke for current smoke)"

# ── documentation updated ──
grep -q "Day 169" "$STRATEGY" 2>/dev/null
check "DEMO_ORG_SEED_STRATEGY.md includes Day 169" $?

grep -q "Day 169" "$AUDIT" 2>/dev/null
check "DEMO_DATA_READINESS_AUDIT.md includes Day 169" $?

grep -q "Day 169" "$PLAN" 2>/dev/null
check "DEMO_READINESS_PLAN.md includes Day 169" $?

grep -q "seed-ufc-demo-story" "$STRATEGY" 2>/dev/null
check "seed strategy records the seed script path" $?

grep -qi "Whisperer session" "$STRATEGY" 2>/dev/null
check "seed strategy covers Whisperer session" $?

grep -qi "queue-assigned sparring" "$STRATEGY" 2>/dev/null
check "seed strategy covers queue-assigned sparring" $?

grep -qi "completed sparring proof\|proof stored\|proof meta\|completed drills with .*proof" "$STRATEGY" 2>/dev/null
check "seed strategy covers completed sparring proof" $?

# ── API-side seeder present (when API repo sits next to WEB) ──
if [[ -f "$API_ROOT/scripts/seed-ufc-demo-story.ts" ]]; then
  check "API seed-ufc-demo-story.ts exists" 0
else
  check "API seed-ufc-demo-story.ts exists" 1
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
  echo "Day 169 validation PASSED"
else
  echo "Day 169 validation FAILED"
fi
exit "$fail"
