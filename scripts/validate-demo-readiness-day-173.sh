#!/usr/bin/env bash
# Validates the Day 173 demo lane closeout: founder script, pre-demo
# runbook and closeout doc exist with the agreed content, docs updated,
# and no forbidden lanes opened. Own checks only, Day 135 rhythm, no
# recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_DOC="$WEB_ROOT/LIGHTHOUSE_DEMO_SCRIPT.md"
RUNBOOK="$WEB_ROOT/PRE_DEMO_RUNBOOK.md"
CLOSEOUT="$WEB_ROOT/DEMO_READINESS_CLOSEOUT.md"
DOC="$WEB_ROOT/LIGHTHOUSE_DEMO_REHEARSAL.md"
PLAN="$WEB_ROOT/DEMO_READINESS_PLAN.md"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
API_ROOT="$WEB_ROOT/../gravix-sales-trainer-api"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Demo Readiness Day 173 — own checks only (use validate-tier-2b-smoke for current smoke)"

# ── founder demo script ──
[[ -f "$SCRIPT_DOC" ]]
check "LIGHTHOUSE_DEMO_SCRIPT.md exists" $?

grep -q "Gravix helps sales managers" "$SCRIPT_DOC" 2>/dev/null
check "script includes opening positioning" $?

grep -q "Nate Diaz" "$SCRIPT_DOC" 2>/dev/null
check "script includes Nate Diaz hero call" $?

grep -q "Whisperer Insights" "$SCRIPT_DOC" 2>/dev/null
check "script includes Whisperer Insights" $?

grep -q "AI Discovery" "$SCRIPT_DOC" 2>/dev/null
check "script includes AI Discovery" $?

grep -q "Upload Call" "$SCRIPT_DOC" 2>/dev/null
check "script includes Upload Call" $?

# ── pre-demo runbook ──
[[ -f "$RUNBOOK" ]]
check "PRE_DEMO_RUNBOOK.md exists" $?

grep -q "npm run seed:demo" "$RUNBOOK" 2>/dev/null
check "runbook includes seed:demo" $?

grep -q "npm run seed:ufc-story" "$RUNBOOK" 2>/dev/null
check "runbook includes seed:ufc-story" $?

# ── closeout ──
[[ -f "$CLOSEOUT" ]]
check "DEMO_READINESS_CLOSEOUT.md exists" $?

grep -q "Ready for controlled lighthouse demo" "$CLOSEOUT" 2>/dev/null
check "closeout states Ready for controlled lighthouse demo" $?

# ── existing docs updated ──
grep -q "Day 173" "$PLAN" 2>/dev/null
check "DEMO_READINESS_PLAN.md includes Day 173" $?

grep -q "Day 173" "$DOC" 2>/dev/null
check "LIGHTHOUSE_DEMO_REHEARSAL.md includes Day 173" $?

# ── smoke harness still present ──
[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke still exists" $?

# ── no forbidden lanes opened today ──
grep -rqiE "elevenlabs|text-to-speech|voice[ _-]?agent" "$WEB_ROOT/src" 2>/dev/null
check "no ElevenLabs/TTS/Voice Agent in WEB src" $((! $?))

# live hot path = the WEB whisperer live page (same definition as tier-2b smoke)
grep -rqiE "openai|anthropic|claude|chat\.completions|responses\.create" "$WEB_ROOT/src/app/whisperer/page.tsx" 2>/dev/null
check "no LLM on Whisperer live hot path" $((! $?))

# no new Whisperer feature expansion in WEB (no new whisperer route dirs today)
! find "$WEB_ROOT/src/app" -type d -iname "*whisperer*" -newermt "2026-07-04 12:00:00" 2>/dev/null | grep -q .
check "no new Whisperer route added today" $?

if [[ -d "$API_ROOT/sql" ]]; then
  ls "$API_ROOT"/sql/2026070[45]*.sql >/dev/null 2>&1
  check "no new API migration added today" $((! $?))
fi

if [[ "$fail" == "0" ]]; then
  echo "Day 173 demo readiness checks passed."
else
  echo "Day 173 demo readiness checks FAILED."
  exit 1
fi
