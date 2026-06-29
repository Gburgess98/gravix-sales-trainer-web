#!/usr/bin/env bash
# Validates the Day 160 Demo Readiness / Lighthouse Client Prep layer: the
# DEMO_READINESS_PLAN.md doc exists and records the manager demo path, the
# preserved product guardrails, and the "what not to demo yet" list.
# Readiness only — no new product features. Own checks only, follows the Day 135
# rhythm and does NOT recursively chain older day scripts.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOC="$WEB_ROOT/DEMO_READINESS_PLAN.md"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
PKG="$WEB_ROOT/package.json"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Demo Readiness Day 160 — own checks only (use validate-tier-2b-smoke for current smoke)"

[[ -f "$DOC" ]]
check "DEMO_READINESS_PLAN.md exists" $?

grep -q "Manager Command Centre" "$DOC" 2>/dev/null
check "doc includes \"Manager Command Centre\"" $?

grep -q "Coaching Queue" "$DOC" 2>/dev/null
check "doc includes \"Coaching Queue\"" $?

grep -qi "Assign recommended sparring\|Assign the recommended sparring" "$DOC" 2>/dev/null
check "doc includes \"Assign recommended sparring\"" $?

grep -q "AI Discovery" "$DOC" 2>/dev/null
check "doc includes \"AI Discovery\"" $?

grep -q "Whisperer Insights" "$DOC" 2>/dev/null
check "doc includes \"Whisperer Insights\"" $?

grep -qi "Lighthouse client readiness" "$DOC" 2>/dev/null
check "doc includes \"Lighthouse client readiness\"" $?

grep -qi "What not to demo yet" "$DOC" 2>/dev/null
check "doc includes \"What not to demo yet\"" $?

grep -q "Tier 2C voice" "$DOC" 2>/dev/null
check "doc includes \"Tier 2C voice\"" $?

grep -q "Tier 2D audio" "$DOC" 2>/dev/null
check "doc includes \"Tier 2D audio\"" $?

grep -q "auto-create" "$DOC" 2>/dev/null
check "doc includes \"auto-create\"" $?

grep -q "auto-activate" "$DOC" 2>/dev/null
check "doc includes \"auto-activate\"" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh still exists" $?

# Day 160 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-(tier-2b|manager-dashboard)-day-1[0-5][0-9]' "$0" 2>/dev/null; then
  check "Day 160 does not recursively invoke an older day" 1
else
  check "Day 160 does not recursively invoke an older day" 0
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

# No migration added today (readiness-only lane).
if ls "$WEB_ROOT"/migrations 2>/dev/null | grep -qiE 'day.?160|demo.readiness'; then
  check "no migration added today" 1
else
  check "no migration added today" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Demo Readiness Day 160 validation FAILED"
  exit 1
fi
echo "Demo Readiness Day 160 validation PASSED"
