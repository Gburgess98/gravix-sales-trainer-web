#!/usr/bin/env bash
# Validates the Day 155 sparring completion proof metadata on /coaching: when a
# manager marks a queue-assigned sparring assignment complete from a direct
# completed-session match, proof is persisted onto the assignment meta (no
# migration — assignments.meta jsonb already exists) and shown after refresh.
# Own checks only — Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAN="$WEB_ROOT/MANAGER_DASHBOARD_REENTRY_PLAN.md"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
PKG="$WEB_ROOT/package.json"
API_ASSIGNMENTS="$WEB_ROOT/../gravix-sales-trainer-api/src/routes/assignments.ts"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Manager Dashboard / Day 155 — own checks only (use validate-tier-2b-smoke for current smoke)"

[[ -f "$COACHING" ]]
check "coaching/page.tsx exists" $?

grep -q "Proof: sparring session match" "$COACHING" 2>/dev/null
check "/coaching includes \"Proof: sparring session match\"" $?

grep -q "Proof score" "$COACHING" 2>/dev/null
check "/coaching includes \"Proof score\"" $?

grep -q "Proof stored" "$COACHING" 2>/dev/null
check "/coaching includes \"Proof stored\"" $?

grep -q "Ready to mark complete" "$COACHING" 2>/dev/null
check "/coaching still includes \"Ready to mark complete\"" $?

grep -q "Sparring assignment marked complete." "$COACHING" 2>/dev/null
check "/coaching still includes \"Sparring assignment marked complete.\"" $?

grep -q "Mark complete" "$COACHING" 2>/dev/null
check "/coaching still includes \"Mark complete\"" $?

# Proof is sent only for a direct match, and not re-offered once stored.
grep -q "completion_proof" "$COACHING" 2>/dev/null
check "/coaching sends completion_proof" $?

grep -q "hasProof" "$COACHING" 2>/dev/null
check "/coaching gates Mark complete off once proof is stored (hasProof)" $?

[[ -f "$PLAN" ]] && grep -qi "Day 155" "$PLAN" 2>/dev/null
check "MANAGER_DASHBOARD_REENTRY_PLAN.md includes Day 155" $?

# API endpoint persists whitelisted proof keys.
[[ -f "$API_ASSIGNMENTS" ]] && grep -q "completed_via" "$API_ASSIGNMENTS" 2>/dev/null
check "API assignments route includes completed_via" $?

[[ -f "$API_ASSIGNMENTS" ]] && grep -q "matched_sparring_session_id" "$API_ASSIGNMENTS" 2>/dev/null
check "API assignments route includes matched_sparring_session_id" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-manager-dashboard-day-155"' "$PKG" 2>/dev/null
check "package.json has validate-manager-dashboard-day-155 script" $?

# Day 155 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-(tier-2b-day|manager-dashboard-day)-(1[0-4][0-9]|15[0-4])' "$0" 2>/dev/null; then
  check "Day 155 does not recursively invoke an older day" 1
else
  check "Day 155 does not recursively invoke an older day" 0
fi

# Manager click required — completion must not fire from an effect/auto path.
if grep -qE "useEffect\([^)]*markSparringComplete" "$COACHING" 2>/dev/null; then
  check "no auto-completion (markSparringComplete not called from an effect)" 1
else
  check "no auto-completion (markSparringComplete not called from an effect)" 0
fi

# No ElevenLabs/TTS/Voice Agent added.
if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$PLAN" "$COACHING" 2>/dev/null; then
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

# No new Whisperer feature expansion — no auto-create / auto-enable of triggers.
if grep -riqE "auto.?create.?trigger|auto.?enable.?trigger" "$COACHING" 2>/dev/null; then
  check "no new Whisperer feature expansion (no auto-create/enable triggers)" 1
else
  check "no new Whisperer feature expansion (no auto-create/enable triggers)" 0
fi

# No migration added today (proof reuses the existing assignments.meta jsonb).
if grep -riqE "CREATE TABLE|ALTER TABLE" "$COACHING" 2>/dev/null; then
  check "no migration added today" 1
else
  check "no migration added today" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Day 155 validation FAILED"
  exit 1
fi
echo "Day 155 validation PASSED"
