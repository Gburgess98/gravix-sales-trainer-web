#!/usr/bin/env bash
# Validates the Day 148 Manager Dashboard re-entry deliverable: the re-entry plan
# doc exists and records the recommended dashboard sections, the Day 149 lane, and
# the "no new Whisperer feature expansion" guardrail. Own checks only — follows the
# Day 135 rhythm and does NOT recursively chain older day scripts.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAN="$WEB_ROOT/MANAGER_DASHBOARD_REENTRY_PLAN.md"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
PKG="$WEB_ROOT/package.json"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Tier 2B / Day 148 — own checks only (use validate-tier-2b-smoke for current smoke)"

[[ -f "$PLAN" ]]
check "MANAGER_DASHBOARD_REENTRY_PLAN.md exists" $?

grep -qi "Manager Dashboard" "$PLAN" 2>/dev/null
check "doc includes \"Manager Dashboard\"" $?

grep -qi "Coaching Queue" "$PLAN" 2>/dev/null
check "doc includes \"Coaching Queue\"" $?

grep -qi "Whisperer Insights" "$PLAN" 2>/dev/null
check "doc includes \"Whisperer Insights\"" $?

grep -qi "AI Discovery" "$PLAN" 2>/dev/null
check "doc includes \"AI Discovery\"" $?

grep -qi "Sparring Progress" "$PLAN" 2>/dev/null
check "doc includes \"Sparring Progress\"" $?

grep -qi "Manager Actions" "$PLAN" 2>/dev/null
check "doc includes \"Manager Actions\"" $?

grep -qi "Day 149" "$PLAN" 2>/dev/null
check "doc includes Day 149 recommendation" $?

grep -qi "no new Whisperer feature expansion" "$PLAN" 2>/dev/null
check "doc says no new Whisperer feature expansion" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-manager-dashboard-day-148"' "$PKG" 2>/dev/null
check "package.json has validate-manager-dashboard-day-148 script" $?

# Day 148 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-tier-2b-day-1(3[0-9]|4[0-7])' "$0" 2>/dev/null; then
  check "Day 148 does not recursively invoke an older day" 1
else
  check "Day 148 does not recursively invoke an older day" 0
fi

# No ElevenLabs/TTS/Voice Agent added.
if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$PLAN" "$COACHING" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

# No LLM on the live hot path sneaked into the coaching page.
if grep -riqE "openai|anthropic|chat\.completions|responses\.create" "$COACHING" 2>/dev/null; then
  check "no LLM on live hot path" 1
else
  check "no LLM on live hot path" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Day 148 validation FAILED"
  exit 1
fi
echo "Day 148 validation PASSED"
