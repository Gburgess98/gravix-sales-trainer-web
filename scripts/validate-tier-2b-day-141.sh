#!/usr/bin/env bash
# Validates the Day 141 Tier 2B deliverable: raw transcript blind-spot discovery
# PLAN. Planning/schema day only — no migration and no product behaviour change.
# Own checks only — follows the Day 135 rhythm and does NOT recursively chain
# older day scripts. For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
PLAN="$WEB_ROOT/WHISPERER_RAW_SEGMENTS_PLAN.md"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
MANAGER="$API_ROOT/src/routes/manager.ts"
WHISPERER="$API_ROOT/src/routes/whisperer.ts"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
PKG="$WEB_ROOT/package.json"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Tier 2B Day 141 — own checks only (use validate-tier-2b-smoke for current smoke)"

[[ -f "$PLAN" ]]
check "WHISPERER_RAW_SEGMENTS_PLAN.md exists" $?

grep -q "whisperer_segments" "$PLAN" 2>/dev/null
check "doc includes whisperer_segments" $?

grep -qi "final transcript segment" "$PLAN" 2>/dev/null
check "doc includes final transcript segments" $?

grep -qi "interim" "$PLAN" 2>/dev/null && grep -qi "not store interim\|no need to send interim\|final-only" "$PLAN" 2>/dev/null
check "doc includes no interim by default" $?

grep -qi "text only" "$PLAN" 2>/dev/null && grep -qi "never audio\|not audio" "$PLAN" 2>/dev/null
check "doc includes store text only, not audio" $?

grep -qi "manager approval" "$PLAN" 2>/dev/null
check "doc includes manager approval required" $?

grep -qi "fail-soft" "$PLAN" 2>/dev/null
check "doc includes fail-soft" $?

grep -qi "Day 142 implementation plan" "$PLAN" 2>/dev/null
check "doc includes Day 142 implementation plan" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-tier-2b-day-141"' "$PKG" 2>/dev/null
check "package.json has validate-tier-2b-day-141 script" $?

# Day 141 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-tier-2b-day-1(3[0-9]|40)' "$0" 2>/dev/null; then
  check "Day 141 does not recursively invoke an older day" 1
else
  check "Day 141 does not recursively invoke an older day" 0
fi

# Planning day — no new whisperer_segments migration should appear yet.
if ls "$API_ROOT"/sql/*whisperer_segments* 2>/dev/null | grep -q .; then
  check "no whisperer_segments migration added today" 1
else
  check "no whisperer_segments migration added today" 0
fi

# No ElevenLabs/TTS/Voice Agent added.
if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$COACHING" "$MANAGER" "$WHISPERER" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

# No LLM on the live hot path. The hot path is the segments route — slice just
# that route block and confirm it stays rule-based. (whisperer.ts elsewhere has
# a pre-existing /preview coaching rewrite that legitimately uses an LLM; that
# is off the live path and out of scope here.)
SEG_ROUTE="$(awk '/sessions\/:id\/segments/{f=1} f{print} f&&/^}\);/{exit}' "$WHISPERER" 2>/dev/null)"
if printf '%s' "$SEG_ROUTE" | grep -iqE "openai|anthropic|chat\.completions|responses\.create"; then
  check "no LLM call on segments hot path" 1
else
  check "no LLM call on segments hot path" 0
fi

# The plan must commit to keeping the live hot path LLM-free.
grep -qi "No LLM on the live hot path" "$PLAN" 2>/dev/null
check "plan asserts no LLM on the live hot path" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 141 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 141 validation PASSED"
