#!/usr/bin/env bash
# Validates the Day 171 pins demo polish: no raw "forbidden" on the call
# detail pins card, calm empty state in place, docs updated, and no
# forbidden lanes opened. Own checks only, Day 135 rhythm, no recursive
# historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOC="$WEB_ROOT/LIGHTHOUSE_DEMO_REHEARSAL.md"
PLAN="$WEB_ROOT/DEMO_READINESS_PLAN.md"
CALL_PAGE="$WEB_ROOT/src/app/calls/[id]/page.tsx"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
API_ROOT="$WEB_ROOT/../gravix-sales-trainer-api"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Demo Readiness Day 171 — own checks only (use validate-tier-2b-smoke for current smoke)"

# ── docs updated ──
grep -q "Day 171" "$DOC" 2>/dev/null
check "LIGHTHOUSE_DEMO_REHEARSAL.md includes Day 171" $?

grep -q "Day 171" "$PLAN" 2>/dev/null
check "DEMO_READINESS_PLAN.md includes Day 171" $?

# ── pins card renders calm copy, not raw API errors ──
grep -q "No pinned coaching notes yet" "$CALL_PAGE" 2>/dev/null
check "pins card has calm empty state copy" $?

# load failures must not surface e.message on the pins card
grep -q "setPinsErr(e?.message" "$CALL_PAGE" 2>/dev/null
check "pins card never renders raw API error messages" $((! $?))

# ── API-side read scope (when API repo sits next to WEB) ──
if [[ -f "$API_ROOT/src/routes/pins.ts" ]]; then
  grep -q "canAccessCall" "$API_ROOT/src/routes/pins.ts" 2>/dev/null
  check "API pins read uses shared call visibility (canAccessCall)" $?

  [[ -f "$API_ROOT/scripts/validate-manager-pins-access.ts" ]]
  check "API validate-manager-pins-access.ts exists" $?
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
! find "$WEB_ROOT/src/app" -type d -iname "*whisperer*" -newermt "2026-07-03 00:00:00" 2>/dev/null | grep -q .
check "no new Whisperer route added today" $?

if [[ -d "$API_ROOT/sql" ]]; then
  ls "$API_ROOT"/sql/2026070[23]*.sql >/dev/null 2>&1
  check "no new API migration added today" $((! $?))
fi

if [[ "$fail" == "0" ]]; then
  echo "Day 171 demo readiness checks passed."
else
  echo "Day 171 demo readiness checks FAILED."
  exit 1
fi
