#!/usr/bin/env bash
# Validates the Day 172 call identity polish: human-friendly call titles in
# the demo path (helper + fallbacks), calm "Needs review" weakest copy, docs
# updated, and no forbidden lanes opened. Own checks only, Day 135 rhythm,
# no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOC="$WEB_ROOT/LIGHTHOUSE_DEMO_REHEARSAL.md"
PLAN="$WEB_ROOT/DEMO_READINESS_PLAN.md"
CALL_PAGE="$WEB_ROOT/src/app/calls/[id]/page.tsx"
COACHING_PAGE="$WEB_ROOT/src/app/coaching/page.tsx"
HELPER="$WEB_ROOT/src/lib/callDisplay.ts"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
API_ROOT="$WEB_ROOT/../gravix-sales-trainer-api"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Demo Readiness Day 172 — own checks only (use validate-tier-2b-smoke for current smoke)"

# ── friendly call identity helper ──
[[ -f "$HELPER" ]]
check "callDisplay helper exists" $?

grep -q "formatCallDisplayTitle" "$HELPER" 2>/dev/null
check "helper exposes formatCallDisplayTitle" $?

grep -q "Needs review" "$HELPER" 2>/dev/null
check "helper falls back to 'Needs review' (never Unknown)" $?

# ── demo-facing pages use the helper ──
grep -q "formatCallDisplayTitle" "$COACHING_PAGE" 2>/dev/null
check "coaching page (Review Queue) uses friendly titles" $?

grep -q "weakestSkillLabel" "$COACHING_PAGE" 2>/dev/null
check "coaching page uses calm weakest-skill copy" $?

grep -q "formatCallDisplayTitle" "$CALL_PAGE" 2>/dev/null
check "call detail header uses friendly title" $?

# header must not fall back to a raw UUID title
grep -q 'callMeta?.filename || `Call ${callId}`' "$CALL_PAGE" 2>/dev/null
check "call detail header no longer falls back to raw Call <uuid>" $((! $?))

# ── docs updated ──
grep -q "Day 172" "$DOC" 2>/dev/null
check "LIGHTHOUSE_DEMO_REHEARSAL.md includes Day 172" $?

grep -q "Nate Diaz" "$DOC" 2>/dev/null
check "LIGHTHOUSE_DEMO_REHEARSAL.md includes Nate Diaz" $?

grep -q "Price Objection" "$DOC" 2>/dev/null
check "LIGHTHOUSE_DEMO_REHEARSAL.md includes Price Objection" $?

grep -q "Day 172" "$PLAN" 2>/dev/null
check "DEMO_READINESS_PLAN.md includes Day 172" $?

# ── API-side (when API repo sits next to WEB) ──
if [[ -f "$API_ROOT/scripts/seed-ufc-demo-story.ts" ]]; then
  grep -q "Nate Diaz — Price Objection Call" "$API_ROOT/scripts/seed-ufc-demo-story.ts" 2>/dev/null
  check "UFC seed stamps friendly hero call title" $?

  grep -q "stageSourceOf" "$API_ROOT/src/routes/manager.ts" 2>/dev/null
  check "manager routes derive weakest skill with rubric fallback" $?
else
  echo "SKIP  API repo not found next to WEB (API-side checks skipped)"
fi

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
! find "$WEB_ROOT/src/app" -type d -iname "*whisperer*" -newermt "2026-07-04 00:00:00" 2>/dev/null | grep -q .
check "no new Whisperer route added today" $?

if [[ -d "$API_ROOT/sql" ]]; then
  ls "$API_ROOT"/sql/2026070[45]*.sql >/dev/null 2>&1
  check "no new API migration added today" $((! $?))
fi

if [[ "$fail" == "0" ]]; then
  echo "Day 172 demo readiness checks passed."
else
  echo "Day 172 demo readiness checks FAILED."
  exit 1
fi
