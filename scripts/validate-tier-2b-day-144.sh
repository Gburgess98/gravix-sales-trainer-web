#!/usr/bin/env bash
# Validates the Day 144 Tier 2B deliverable: AI Trigger Discovery now mines raw
# whisperer_segments first (blind-spot candidates from untriggered final
# segments) with the whisperer_triggers.segment_text fallback preserved.
# Own checks only — follows the Day 135 rhythm and does NOT recursively chain
# older day scripts. For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
MANAGER="$API_ROOT/src/routes/manager.ts"
DISCOVERY="$API_ROOT/src/whisperer/discovery.ts"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
PKG="$WEB_ROOT/package.json"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Tier 2B Day 144 — own checks only (use validate-tier-2b-smoke for current smoke)"

grep -q "whisperer_segments" "$MANAGER" 2>/dev/null
check "manager endpoint references whisperer_segments" $?

grep -q "whisperer_triggers" "$MANAGER" 2>/dev/null
check "manager endpoint still references whisperer_triggers fallback" $?

grep -q "rawSegmentsConsidered" "$MANAGER" 2>/dev/null
check "summary includes rawSegmentsConsidered" $?

grep -q "untriggeredSegmentsConsidered" "$MANAGER" 2>/dev/null
check "summary includes untriggeredSegmentsConsidered" $?

grep -q "triggerMomentsConsidered" "$MANAGER" 2>/dev/null
check "summary includes triggerMomentsConsidered" $?

grep -q "untriggered" "$DISCOVERY" 2>/dev/null
check "candidate carries untriggered field" $?

grep -q "raw_segment" "$DISCOVERY" 2>/dev/null && grep -q "exampleSegmentIds" "$DISCOVERY" 2>/dev/null
check "candidate carries source / raw-segment fields" $?

grep -q "Blind spot" "$COACHING" 2>/dev/null
check "/coaching includes \"Blind spot\"" $?

grep -qi "untriggered transcript" "$COACHING" 2>/dev/null
check "/coaching includes \"untriggered transcript\"" $?

grep -q "whispererSegmentsTableMissing" "$MANAGER" 2>/dev/null
check "raw-table fail-soft probe exists in manager endpoint" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-tier-2b-day-144"' "$PKG" 2>/dev/null
check "package.json has validate-tier-2b-day-144 script" $?

# Day 144 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-tier-2b-day-1(3[0-9]|4[0-3])' "$0" 2>/dev/null; then
  check "Day 144 does not recursively invoke an older day" 1
else
  check "Day 144 does not recursively invoke an older day" 0
fi

# No ElevenLabs/TTS/Voice Agent added.
if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$COACHING" "$MANAGER" "$DISCOVERY" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

# No LLM in the offline discovery path (helper + the candidate endpoint).
if grep -riqE "openai|anthropic|chat\.completions|responses\.create" "$DISCOVERY" 2>/dev/null; then
  check "no LLM in discovery helper" 1
else
  check "no LLM in discovery helper" 0
fi

# No auto-create / auto-enable trigger endpoint sneaked in.
if grep -qiE "auto.create.trigger|autoCreateTrigger|createTriggerFromCandidate" "$MANAGER" 2>/dev/null; then
  check "no auto-create trigger endpoint added" 1
else
  check "no auto-create trigger endpoint added" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 144 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 144 validation PASSED"
