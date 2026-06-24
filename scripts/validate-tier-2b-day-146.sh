#!/usr/bin/env bash
# Validates the Day 146 Tier 2B deliverable: discovery coverage counters in the
# /coaching Suggested Trigger Candidates card. WEB-only polish — managers can see
# what AI Trigger Discovery analysed (raw segments, untriggered, triggered
# moments, mixed candidates) plus a source mode. No backend behaviour change.
# Own checks only — follows the Day 135 rhythm and does NOT recursively chain
# older day scripts. For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
MANAGER="$API_ROOT/src/routes/manager.ts"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
PKG="$WEB_ROOT/package.json"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Tier 2B Day 146 — own checks only (use validate-tier-2b-smoke for current smoke)"

grep -q "Discovery coverage" "$COACHING" 2>/dev/null
check "/coaching includes \"Discovery coverage\"" $?

grep -q "raw segments" "$COACHING" 2>/dev/null
check "/coaching includes \"raw segments\"" $?

grep -qi "untriggered" "$COACHING" 2>/dev/null
check "/coaching includes \"untriggered\"" $?

grep -qi "triggered moments" "$COACHING" 2>/dev/null
check "/coaching includes \"triggered moments\"" $?

grep -q "mixed candidates" "$COACHING" 2>/dev/null
check "/coaching includes \"mixed candidates\"" $?

grep -qi "Source mode" "$COACHING" 2>/dev/null
check "/coaching includes \"Source mode\"" $?

grep -q "Blind spot" "$COACHING" 2>/dev/null
check "/coaching still includes \"Blind spot\"" $?

grep -q "Mixed evidence" "$COACHING" 2>/dev/null
check "/coaching still includes \"Mixed evidence\"" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-tier-2b-day-146"' "$PKG" 2>/dev/null
check "package.json has validate-tier-2b-day-146 script" $?

# Day 146 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-tier-2b-day-1(3[0-9]|4[0-5])' "$0" 2>/dev/null; then
  check "Day 146 does not recursively invoke an older day" 1
else
  check "Day 146 does not recursively invoke an older day" 0
fi

# No new migration added today.
if ls "$API_ROOT"/sql/*day*146* "$API_ROOT"/sql/*20260624* 2>/dev/null | grep -q .; then
  check "no migration added today" 1
else
  check "no migration added today" 0
fi

# No ElevenLabs/TTS/Voice Agent added.
if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$COACHING" 2>/dev/null; then
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

# No auto-create / auto-enable trigger endpoint sneaked in.
if grep -qiE "auto.create.trigger|autoCreateTrigger|createTriggerFromCandidate" "$MANAGER" 2>/dev/null; then
  check "no auto-create trigger endpoint added" 1
else
  check "no auto-create trigger endpoint added" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 146 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 146 validation PASSED"
