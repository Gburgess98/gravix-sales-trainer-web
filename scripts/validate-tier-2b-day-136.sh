#!/usr/bin/env bash
# Validates the Day 136 Tier 2B deliverable: reviewed candidate history +
# un-dismiss/restore. Own checks only — follows the Day 135 rhythm and does NOT
# recursively chain Day 135/134. For current core invariants run:
#   npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
MANAGER="$API_ROOT/src/routes/manager.ts"
PKG="$WEB_ROOT/package.json"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Tier 2B Day 136 — own checks only (use validate-tier-2b-smoke for current smoke)"

# API — reviewed decisions GET endpoint
grep -qE 'router\.get\("/whisperer-trigger-candidate-decisions' "$MANAGER" 2>/dev/null
check "reviewed decisions GET endpoint exists" $?

# API — restore DELETE endpoint
grep -qE 'router\.delete\("/whisperer-trigger-candidates/:id/decision' "$MANAGER" 2>/dev/null
check "DELETE candidate decision endpoint exists" $?

# Web — Reviewed candidates copy
grep -q "Reviewed candidates" "$COACHING" 2>/dev/null
check "/coaching has \"Reviewed candidates\" copy" $?

# Web — Restore copy
grep -q "Restore" "$COACHING" 2>/dev/null
check "/coaching has \"Restore\" copy" $?

# Web — Candidate restored notice
grep -q "Candidate restored." "$COACHING" 2>/dev/null
check "/coaching has \"Candidate restored.\" copy" $?

# Web — empty state
grep -q "No reviewed candidates yet." "$COACHING" 2>/dev/null
check "/coaching has \"No reviewed candidates yet.\" copy" $?

# Web — fail-soft copy
grep -q "Candidate decision history is not enabled yet." "$COACHING" 2>/dev/null
check "/coaching has fail-soft history copy" $?

grep -q '"validate-tier-2b-smoke"' "$PKG" 2>/dev/null
check "package.json has validate-tier-2b-smoke script" $?

grep -q '"validate-tier-2b-day-136"' "$PKG" 2>/dev/null
check "package.json has validate-tier-2b-day-136 script" $?

# Day 136 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-tier-2b-day-13[0-5]' "$0" 2>/dev/null; then
  check "Day 136 does not recursively invoke an older day" 1
else
  check "Day 136 does not recursively invoke an older day" 0
fi

# No ElevenLabs/TTS/Voice Agent added.
if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$COACHING" "$MANAGER" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

# No LLM on the live hot path — restore/history are pure DB ops, no model calls.
if grep -riqE "openai|anthropic|chat\.completions|responses\.create" "$MANAGER" 2>/dev/null; then
  check "no LLM call in manager route" 1
else
  check "no LLM call in manager route" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 136 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 136 validation PASSED"
