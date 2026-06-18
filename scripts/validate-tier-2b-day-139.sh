#!/usr/bin/env bash
# Validates the Day 139 Tier 2B deliverable: approved candidate → source link.
# Adds source_candidate_id / source_meta to the custom trigger library so an
# approved candidate traces to the trigger it created. Own checks only — follows
# the Day 135 rhythm and does NOT recursively chain older day scripts.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
MANAGER="$API_ROOT/src/routes/manager.ts"
MIGRATION="$API_ROOT/sql/20260618_whisperer_trigger_library_source.sql"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
PKG="$WEB_ROOT/package.json"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Tier 2B Day 139 — own checks only (use validate-tier-2b-smoke for current smoke)"

[[ -f "$MIGRATION" ]]
check "migration file exists" $?

grep -q "source_candidate_id" "$MIGRATION" 2>/dev/null
check "migration adds source_candidate_id" $?

grep -q "source_meta" "$MIGRATION" 2>/dev/null
check "migration adds source_meta" $?

# API POST handles sourceCandidateId / sourceMeta
grep -q "buildLibrarySourcePatch" "$MANAGER" 2>/dev/null && grep -q "sourceCandidateId" "$MANAGER" 2>/dev/null
check "API POST handles sourceCandidateId/sourceMeta" $?

# API GET returns source fields (normaliser emits them)
grep -q "sourceCandidateId" "$MANAGER" 2>/dev/null && grep -q "sourceMeta" "$MANAGER" 2>/dev/null
check "API library item returns sourceCandidateId/sourceMeta" $?

# API fail-soft when the source columns are not migrated
grep -q "librarySourceColumnsMissing" "$MANAGER" 2>/dev/null
check "API fail-soft for missing source columns" $?

# Web sends source fields on save
grep -q "sourceCandidateId" "$COACHING" 2>/dev/null && grep -q "sourceMeta" "$COACHING" 2>/dev/null
check "/coaching sends sourceCandidateId/sourceMeta" $?

grep -q "From AI candidate" "$COACHING" 2>/dev/null
check "/coaching shows \"From AI candidate\"" $?

grep -q "Use this candidate" "$COACHING" 2>/dev/null
check "/coaching still has \"Use this candidate\"" $?

grep -qiE "Manager approval required|review and save to activate|Nothing goes live until" "$COACHING" 2>/dev/null
check "/coaching keeps manager approval copy" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-tier-2b-day-139"' "$PKG" 2>/dev/null
check "package.json has validate-tier-2b-day-139 script" $?

# Day 139 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-tier-2b-day-13[0-8]' "$0" 2>/dev/null; then
  check "Day 139 does not recursively invoke an older day" 1
else
  check "Day 139 does not recursively invoke an older day" 0
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

# No auto-create trigger endpoint — triggers are only created by the manager
# POST save (the existing endpoint), never auto-generated from a candidate.
if grep -qiE "auto.create.trigger|autoCreateTrigger|createTriggerFromCandidate" "$MANAGER" 2>/dev/null; then
  check "no auto-create trigger endpoint added" 1
else
  check "no auto-create trigger endpoint added" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 139 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 139 validation PASSED"
