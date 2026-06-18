#!/usr/bin/env bash
# Validates the Day 142 Tier 2B deliverable: raw Whisperer segment storage.
# Every FINAL segment now persists (triggered or not) so Day 143 discovery can
# mine untriggered buyer language. Own checks only — follows the Day 135 rhythm
# and does NOT recursively chain older day scripts.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
MIGRATION="$API_ROOT/sql/20260618_whisperer_segments.sql"
WHISPERER="$API_ROOT/src/routes/whisperer.ts"
PLAN="$WEB_ROOT/WHISPERER_RAW_SEGMENTS_PLAN.md"
DISCOVERY="$API_ROOT/src/whisperer/discovery.ts"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
PKG="$WEB_ROOT/package.json"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Tier 2B Day 142 — own checks only (use validate-tier-2b-smoke for current smoke)"

[[ -f "$MIGRATION" ]]
check "migration file exists" $?

grep -q "whisperer_segments" "$MIGRATION" 2>/dev/null
check "migration includes whisperer_segments" $?

grep -q "triggers_count" "$MIGRATION" 2>/dev/null
check "migration includes triggers_count" $?

grep -q "trigger_types" "$MIGRATION" 2>/dev/null
check "migration includes trigger_types" $?

grep -qi "text only" "$MIGRATION" 2>/dev/null && grep -qi "never audio\|not audio" "$MIGRATION" 2>/dev/null
check "migration documents store text only / no audio" $?

# /segments route persists the segment regardless of triggers + fail-soft probe
grep -q "persistWhispererSegment" "$WHISPERER" 2>/dev/null
check "/segments route persists raw segment" $?

grep -q "whispererSegmentsTableMissing" "$WHISPERER" 2>/dev/null
check "table-missing fail-soft probe exists" $?

# Response includes segment persistence fields
grep -q "segmentPersist" "$WHISPERER" 2>/dev/null && grep -q "persistence: segmentPersist.persistence" "$WHISPERER" 2>/dev/null
check "/segments response includes segment persistence fields" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-tier-2b-day-142"' "$PKG" 2>/dev/null
check "package.json has validate-tier-2b-day-142 script" $?

# Day 142 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-tier-2b-day-1(3[0-9]|4[01])' "$0" 2>/dev/null; then
  check "Day 142 does not recursively invoke an older day" 1
else
  check "Day 142 does not recursively invoke an older day" 0
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
# not whisperer_segments (that's Day 143).
if grep -q "whisperer_segments" "$DISCOVERY" 2>/dev/null; then
  check "no AI discovery ranking change today (discovery untouched)" 1
else
  check "no AI discovery ranking change today (discovery untouched)" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 142 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 142 validation PASSED"
