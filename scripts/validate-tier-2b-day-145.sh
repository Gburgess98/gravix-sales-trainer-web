#!/usr/bin/env bash
# Validates the Day 145 Tier 2B deliverable: blended / ranked AI Trigger
# Discovery — raw blind-spot candidates AND triggered-moment candidates both
# surface, blind spots ranked first, overlapping patterns merged as "mixed".
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

echo "Tier 2B Day 145 — own checks only (use validate-tier-2b-smoke for current smoke)"

grep -q "whisperer_segments" "$MANAGER" 2>/dev/null
check "manager endpoint queries whisperer_segments" $?

grep -q "whisperer_triggers" "$MANAGER" 2>/dev/null
check "manager endpoint queries whisperer_triggers" $?

grep -q "blendTriggerCandidates" "$DISCOVERY" 2>/dev/null && grep -q "blendTriggerCandidates" "$MANAGER" 2>/dev/null
check "blendTriggerCandidates helper exists and is used" $?

grep -q "rawCandidateCount" "$MANAGER" 2>/dev/null
check "summary includes rawCandidateCount" $?

grep -q "triggerCandidateCount" "$MANAGER" 2>/dev/null
check "summary includes triggerCandidateCount" $?

grep -q "mixedCandidateCount" "$MANAGER" 2>/dev/null
check "summary includes mixedCandidateCount" $?

grep -q "Mixed evidence" "$COACHING" 2>/dev/null
check "/coaching includes \"Mixed evidence\"" $?

grep -qi "triggered moments" "$COACHING" 2>/dev/null
check "/coaching includes \"triggered moments\"" $?

grep -q "Blind spot" "$COACHING" 2>/dev/null
check "/coaching still includes \"Blind spot\"" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-tier-2b-day-145"' "$PKG" 2>/dev/null
check "package.json has validate-tier-2b-day-145 script" $?

# Day 145 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-tier-2b-day-1(3[0-9]|4[0-4])' "$0" 2>/dev/null; then
  check "Day 145 does not recursively invoke an older day" 1
else
  check "Day 145 does not recursively invoke an older day" 0
fi

# No new migration added today.
if ls "$API_ROOT"/sql/*day*145* "$API_ROOT"/sql/*20260619* 2>/dev/null | grep -q .; then
  check "no migration added today" 1
else
  check "no migration added today" 0
fi

# No ElevenLabs/TTS/Voice Agent added.
if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$COACHING" "$MANAGER" "$DISCOVERY" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

# No LLM in the offline discovery helper.
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
  echo "Tier 2B Day 145 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 145 validation PASSED"
