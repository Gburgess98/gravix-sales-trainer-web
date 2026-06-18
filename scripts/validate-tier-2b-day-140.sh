#!/usr/bin/env bash
# Validates the Day 140 Tier 2B checkpoint: approved candidate → source link
# migration applied + happy path live-proofed against the API/tenant DB.
# Day 140 ships NO new product feature — it proves Day 139 and tags. Own checks
# only — follows the Day 135 rhythm and does NOT recursively chain older days.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
MANAGER="$API_ROOT/src/routes/manager.ts"
MIGRATION="$API_ROOT/sql/20260618_whisperer_trigger_library_source.sql"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
DAY139="$WEB_ROOT/scripts/validate-tier-2b-day-139.sh"
PKG="$WEB_ROOT/package.json"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Tier 2B Day 140 — own checks only (use validate-tier-2b-smoke for current smoke)"

[[ -f "$DAY139" ]]
check "Day 139 validation script exists" $?

[[ -f "$MIGRATION" ]]
check "migration file exists" $?

grep -q "source_candidate_id" "$MIGRATION" 2>/dev/null
check "migration has source_candidate_id" $?

grep -q "source_meta" "$MIGRATION" 2>/dev/null
check "migration has source_meta" $?

grep -q "From AI candidate" "$COACHING" 2>/dev/null
check "/coaching shows \"From AI candidate\"" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-tier-2b-day-140"' "$PKG" 2>/dev/null
check "package.json has validate-tier-2b-day-140 script" $?

# Day 140 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-tier-2b-day-13[0-9]' "$0" 2>/dev/null; then
  check "Day 140 does not recursively invoke an older day" 1
else
  check "Day 140 does not recursively invoke an older day" 0
fi

# No ElevenLabs/TTS/Voice Agent added.
if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$COACHING" "$MANAGER" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

# No LLM on the live hot path.
if grep -riqE "openai|anthropic|chat\.completions|responses\.create" "$MANAGER" 2>/dev/null; then
  check "no LLM call in manager route" 1
else
  check "no LLM call in manager route" 0
fi

# No auto-create trigger endpoint — triggers are only created by manager save.
if grep -qiE "auto.create.trigger|autoCreateTrigger|createTriggerFromCandidate" "$MANAGER" 2>/dev/null; then
  check "no auto-create trigger endpoint added" 1
else
  check "no auto-create trigger endpoint added" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 140 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 140 validation PASSED"
