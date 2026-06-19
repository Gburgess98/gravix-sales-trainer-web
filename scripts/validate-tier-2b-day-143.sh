#!/usr/bin/env bash
# Validates the Day 143 Tier 2B checkpoint: whisperer_segments migration applied
# + raw segment persistence live-proofed. Day 143 ships NO new product feature —
# it proves Day 142 and tags. Own checks only — follows the Day 135 rhythm and
# does NOT recursively chain older day scripts.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
MIGRATION="$API_ROOT/sql/20260618_whisperer_segments.sql"
WHISPERER="$API_ROOT/src/routes/whisperer.ts"
DISCOVERY="$API_ROOT/src/whisperer/discovery.ts"
SEG_VALIDATOR="$API_ROOT/scripts/validate-whisperer-segments.ts"
DAY142="$WEB_ROOT/scripts/validate-tier-2b-day-142.sh"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
PKG="$WEB_ROOT/package.json"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Tier 2B Day 143 — own checks only (use validate-tier-2b-smoke for current smoke)"

[[ -f "$DAY142" ]]
check "Day 142 validation script exists" $?

[[ -f "$MIGRATION" ]] && grep -q "whisperer_segments" "$MIGRATION" 2>/dev/null
check "whisperer_segments migration exists" $?

grep -q "persistence: segmentPersist.persistence" "$WHISPERER" 2>/dev/null
check "segment persistence response exists" $?

[[ -f "$SEG_VALIDATOR" ]]
check "validate-whisperer-segments.ts exists" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-tier-2b-day-143"' "$PKG" 2>/dev/null
check "package.json has validate-tier-2b-day-143 script" $?

# Day 143 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-tier-2b-day-1(3[0-9]|4[0-2])' "$0" 2>/dev/null; then
  check "Day 143 does not recursively invoke an older day" 1
else
  check "Day 143 does not recursively invoke an older day" 0
fi

# No ElevenLabs/TTS/Voice Agent added.
if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$WHISPERER" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

# No LLM on the live segments hot path — slice the segments route and check.
SEG_ROUTE="$(awk '/sessions\/:id\/segments/{f=1} f{print} f&&/^}\);/{exit}' "$WHISPERER" 2>/dev/null)"
if printf '%s' "$SEG_ROUTE" | grep -iqE "openai|anthropic|chat\.completions|responses\.create"; then
  check "no LLM call on segments hot path" 1
else
  check "no LLM call on segments hot path" 0
fi

# Discovery ranking must NOT change today — discovery still mines trigger text,
# not whisperer_segments (that's the next day).
if grep -q "whisperer_segments" "$DISCOVERY" 2>/dev/null; then
  check "no discovery ranking change today (discovery untouched)" 1
else
  check "no discovery ranking change today (discovery untouched)" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 143 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 143 validation PASSED"
