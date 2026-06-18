#!/usr/bin/env bash
# Validates the Day 137 Tier 2B checkpoint: Candidate Decision History +
# Un-dismiss is present and intact (live-proofed separately against the API).
# Day 137 ships NO new product feature — it proves Day 136 and tags. Own checks
# only — follows the Day 135 rhythm and does NOT recursively chain older days.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
MANAGER="$API_ROOT/src/routes/manager.ts"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
PKG="$WEB_ROOT/package.json"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Tier 2B Day 137 — own checks only (use validate-tier-2b-smoke for current smoke)"

# Day 136 reviewed decisions GET endpoint still present
grep -qE 'router\.get\("/whisperer-trigger-candidate-decisions' "$MANAGER" 2>/dev/null
check "reviewed decisions GET endpoint exists" $?

# Day 136 DELETE restore endpoint still present
grep -qE 'router\.delete\("/whisperer-trigger-candidates/:id/decision' "$MANAGER" 2>/dev/null
check "DELETE candidate decision endpoint exists" $?

grep -q "Reviewed candidates" "$COACHING" 2>/dev/null
check "/coaching has \"Reviewed candidates\" copy" $?

grep -q "Restore" "$COACHING" 2>/dev/null
check "/coaching has \"Restore\" copy" $?

grep -q "Candidate restored." "$COACHING" 2>/dev/null
check "/coaching has \"Candidate restored.\" copy" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-tier-2b-day-137"' "$PKG" 2>/dev/null
check "package.json has validate-tier-2b-day-137 script" $?

# Day 137 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-tier-2b-day-13[0-6]' "$0" 2>/dev/null; then
  check "Day 137 does not recursively invoke an older day" 1
else
  check "Day 137 does not recursively invoke an older day" 0
fi

# No ElevenLabs/TTS/Voice Agent added.
if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$COACHING" "$MANAGER" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

# No LLM on the live hot path — history/restore are pure DB ops.
if grep -riqE "openai|anthropic|chat\.completions|responses\.create" "$MANAGER" 2>/dev/null; then
  check "no LLM call in manager route" 1
else
  check "no LLM call in manager route" 0
fi

# No raw Deepgram key leaked into the web bundle.
if grep -rql "DEEPGRAM_API_KEY" "$WEB_ROOT/src" 2>/dev/null; then
  check "no DEEPGRAM_API_KEY in web" 1
else
  check "no DEEPGRAM_API_KEY in web" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 137 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 137 validation PASSED"
