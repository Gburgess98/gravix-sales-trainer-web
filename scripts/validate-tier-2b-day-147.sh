#!/usr/bin/env bash
# Validates the Day 147 Tier 2B closeout: the AI Trigger Discovery closeout doc
# exists and records the preserved product principles, the shipped scope, and the
# final tracker. Closeout only — no new product features. Own checks only, follows
# the Day 135 rhythm and does NOT recursively chain older day scripts.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLOSE="$WEB_ROOT/TIER_2B_AI_DISCOVERY_CLOSE.md"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
PKG="$WEB_ROOT/package.json"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Tier 2B Day 147 — own checks only (use validate-tier-2b-smoke for current smoke)"

[[ -f "$CLOSE" ]]
check "closeout doc TIER_2B_AI_DISCOVERY_CLOSE.md exists" $?

grep -q "AI discovers, managers approve" "$CLOSE" 2>/dev/null
check "closeout doc includes \"AI discovers, managers approve\"" $?

grep -q "no auto-create" "$CLOSE" 2>/dev/null
check "closeout doc includes \"no auto-create\"" $?

grep -q "no auto-activation" "$CLOSE" 2>/dev/null
check "closeout doc includes \"no auto-activation\"" $?

grep -qi "Raw segment storage" "$CLOSE" 2>/dev/null
check "closeout doc includes \"Raw segment storage\"" $?

grep -qi "Blended / ranked discovery\|Blended/ranked discovery" "$CLOSE" 2>/dev/null
check "closeout doc includes \"Blended/ranked discovery\"" $?

grep -qi "Coverage counters\|coverage counters" "$CLOSE" 2>/dev/null
check "closeout doc includes \"Coverage counters\"" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-tier-2b-day-147"' "$PKG" 2>/dev/null
check "package.json has validate-tier-2b-day-147 script" $?

# Day 147 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-tier-2b-day-1(3[0-9]|4[0-6])' "$0" 2>/dev/null; then
  check "Day 147 does not recursively invoke an older day" 1
else
  check "Day 147 does not recursively invoke an older day" 0
fi

# No ElevenLabs/TTS/Voice Agent added.
if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$CLOSE" "$COACHING" 2>/dev/null; then
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
  echo "Tier 2B Day 147 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 147 validation PASSED"
