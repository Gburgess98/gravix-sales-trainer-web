#!/usr/bin/env bash
# Validates the Day 170 lighthouse demo dress rehearsal: rehearsal doc written,
# every demo chapter covered, verdict recorded, and no forbidden lanes opened.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOC="$WEB_ROOT/LIGHTHOUSE_DEMO_REHEARSAL.md"
PLAN="$WEB_ROOT/DEMO_READINESS_PLAN.md"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
API_ROOT="$WEB_ROOT/../gravix-sales-trainer-api"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Demo Readiness Day 170 — own checks only (use validate-tier-2b-smoke for current smoke)"

# ── rehearsal doc exists and covers every demo chapter ──
[[ -f "$DOC" ]]
check "LIGHTHOUSE_DEMO_REHEARSAL.md exists" $?

grep -q "Manager Command Centre" "$DOC" 2>/dev/null
check "doc covers Manager Command Centre" $?

grep -q "Review Queue" "$DOC" 2>/dev/null
check "doc covers Review Queue" $?

grep -q "Coaching Queue" "$DOC" 2>/dev/null
check "doc covers Coaching Queue" $?

grep -qi "Sparring proof" "$DOC" 2>/dev/null
check "doc covers Sparring proof" $?

grep -q "Whisperer Insights" "$DOC" 2>/dev/null
check "doc covers Whisperer Insights" $?

grep -q "AI Discovery" "$DOC" 2>/dev/null
check "doc covers AI Discovery" $?

grep -q "Upload Call" "$DOC" 2>/dev/null
check "doc covers Upload Call" $?

grep -qi "Demo verdict" "$DOC" 2>/dev/null
check "doc records a demo verdict" $?

grep -qi "What not to show yet" "$DOC" 2>/dev/null
check "doc records what not to show yet" $?

grep -qi "total demo time" "$DOC" 2>/dev/null
check "doc records total demo time" $?

grep -q "Day 170" "$PLAN" 2>/dev/null
check "DEMO_READINESS_PLAN.md includes Day 170" $?

# ── smoke harness still present ──
[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke still exists" $?

grep -q '"validate-tier-2b-smoke"' "$WEB_ROOT/package.json" 2>/dev/null
check "validate-tier-2b-smoke package script still wired" $?

# ── no forbidden lanes opened today ──
grep -rqiE "elevenlabs|text-to-speech|voice[ _-]?agent" "$WEB_ROOT/src" 2>/dev/null
check "no ElevenLabs/TTS/Voice Agent in WEB src" $((! $?))

if [[ -d "$API_ROOT/src" ]]; then
  grep -rqiE "elevenlabs|text-to-speech|voice[ _-]?agent" "$API_ROOT/src" 2>/dev/null
  check "no ElevenLabs/TTS/Voice Agent in API src" $((! $?))

  ls "$API_ROOT"/sql/2026070[12]*.sql >/dev/null 2>&1
  check "no new API migration added today" $((! $?))
else
  echo "SKIP  API repo not found next to WEB (API-side lane checks skipped)"
fi

# live hot path = the WEB whisperer live page (same definition as tier-2b smoke)
grep -rqiE "openai|anthropic|claude|chat\.completions|responses\.create" "$WEB_ROOT/src/app/whisperer/page.tsx" 2>/dev/null
check "no LLM on Whisperer live hot path" $((! $?))

# ── rehearsal is docs + single patch, not feature expansion ──
grep -rqi "day.?170" "$WEB_ROOT/src" 2>/dev/null
check "no Day 170 feature code in WEB src (docs + validation only)" $((! $?))

# no new Whisperer feature expansion in WEB (no new whisperer route dirs today)
! find "$WEB_ROOT/src/app" -type d -iname "*whisperer*" -newermt "2026-07-02 00:00:00" 2>/dev/null | grep -q .
check "no new Whisperer route added today" $?

if [[ "$fail" == "0" ]]; then
  echo "Day 170 demo readiness checks passed."
else
  echo "Day 170 demo readiness checks FAILED."
  exit 1
fi
