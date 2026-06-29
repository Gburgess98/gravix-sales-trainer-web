#!/usr/bin/env bash
# Validates the Day 161 UX simplification / calm manager navigation layer: the
# /coaching Command Centre exposes an obvious Upload Call CTA and a calm
# "Manager workflow" navigation strip, and the UX_SIMPLIFICATION_PRINCIPLES.md
# doc records the rules future days must follow. UX-simplification only — no new
# features. Own checks only, follows the Day 135 rhythm and does NOT recursively
# chain older day scripts.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
UXDOC="$WEB_ROOT/UX_SIMPLIFICATION_PRINCIPLES.md"
PLAN="$WEB_ROOT/DEMO_READINESS_PLAN.md"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Demo Readiness Day 161 — own checks only (use validate-tier-2b-smoke for current smoke)"

# ── /coaching exposes the calm Upload-first navigation ──
grep -q "Upload Call" "$COACHING" 2>/dev/null
check "/coaching includes \"Upload Call\"" $?

grep -q "Start by uploading a recorded sales call" "$COACHING" 2>/dev/null
check "/coaching includes \"Start by uploading a recorded sales call\"" $?

grep -q "Manager workflow" "$COACHING" 2>/dev/null
check "/coaching includes \"Manager workflow\"" $?

grep -q "Review Calls" "$COACHING" 2>/dev/null
check "/coaching includes \"Review Calls\"" $?

grep -q "Coaching Queue" "$COACHING" 2>/dev/null
check "/coaching includes \"Coaching Queue\"" $?

grep -q "Sparring" "$COACHING" 2>/dev/null
check "/coaching includes \"Sparring\"" $?

grep -q "AI Discovery" "$COACHING" 2>/dev/null
check "/coaching includes \"AI Discovery\"" $?

# ── UX principles doc ──
[[ -f "$UXDOC" ]]
check "UX_SIMPLIFICATION_PRINCIPLES.md exists" $?

grep -qi "one obvious primary action" "$UXDOC" 2>/dev/null
check "UX doc includes \"one obvious primary action\"" $?

grep -qi "max three competing elements above the fold" "$UXDOC" 2>/dev/null
check "UX doc includes \"max three competing elements above the fold\"" $?

grep -qi "manager stays in control" "$UXDOC" 2>/dev/null
check "UX doc includes \"manager stays in control\"" $?

# ── Demo readiness plan records Day 161 ──
grep -q "Day 161" "$PLAN" 2>/dev/null
check "DEMO_READINESS_PLAN.md includes Day 161" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh still exists" $?

# Day 161 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-(tier-2b|manager-dashboard|demo-readiness)-day-1[0-5][0-9]' "$0" 2>/dev/null; then
  check "Day 161 does not recursively invoke an older day" 1
else
  check "Day 161 does not recursively invoke an older day" 0
fi

# No ElevenLabs/TTS/Voice Agent added in the coaching command centre.
if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$COACHING" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added in /coaching" 1
else
  check "no ElevenLabs/TTS/Voice Agent added in /coaching" 0
fi

# No LLM on the live hot path sneaked into the coaching page.
if grep -riqE "openai|anthropic|chat\.completions|responses\.create" "$COACHING" 2>/dev/null; then
  check "no LLM on live hot path" 1
else
  check "no LLM on live hot path" 0
fi

# No new Whisperer feature expansion in the coaching page (UX-only day).
if grep -riqE "new whisperer|whisperer v2|whisperer.feature" "$COACHING" 2>/dev/null; then
  check "no new Whisperer feature expansion" 1
else
  check "no new Whisperer feature expansion" 0
fi

# No migration added today (UX-simplification-only lane).
if ls "$WEB_ROOT"/migrations 2>/dev/null | grep -qiE 'day.?161|ux.simplification'; then
  check "no migration added today" 1
else
  check "no migration added today" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Demo Readiness Day 161 validation FAILED"
  exit 1
fi
echo "Demo Readiness Day 161 validation PASSED"
