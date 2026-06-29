#!/usr/bin/env bash
# Validates the Day 151 "Assign sparring from the Coaching Queue" deliverable: the
# /coaching page wires the Assign sparring CTA to a real assignment create flow via
# the existing POST /v1/assignments (manager-gated, no migration) with success /
# loading / error / no-rep notices — plus the Day 151 doc section. Own checks only —
# follows the Day 135 rhythm and does NOT recursively chain older day scripts.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAN="$WEB_ROOT/MANAGER_DASHBOARD_REENTRY_PLAN.md"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
PKG="$WEB_ROOT/package.json"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Manager Dashboard / Day 151 — own checks only (use validate-tier-2b-smoke for current smoke)"

[[ -f "$COACHING" ]]
check "coaching/page.tsx exists" $?

grep -q "Sparring drill assigned." "$COACHING" 2>/dev/null
check "/coaching includes \"Sparring drill assigned.\"" $?

grep -q "Could not assign sparring drill." "$COACHING" 2>/dev/null
check "/coaching includes \"Could not assign sparring drill.\"" $?

grep -q "Assigning…" "$COACHING" 2>/dev/null
check "/coaching includes \"Assigning…\"" $?

grep -q "Choose a rep to assign this drill." "$COACHING" 2>/dev/null
check "/coaching includes \"Choose a rep to assign this drill.\"" $?

grep -q "Assign sparring" "$COACHING" 2>/dev/null
check "/coaching includes \"Assign sparring\"" $?

grep -q "Recommended drill" "$COACHING" 2>/dev/null
check "/coaching includes \"Recommended drill\"" $?

# The CTA must hit the real assignment endpoint with a sparring type.
grep -q "/v1/assignments" "$COACHING" 2>/dev/null
check "/coaching posts to /v1/assignments" $?

grep -q "type: 'sparring'" "$COACHING" 2>/dev/null
check "/coaching assigns type: 'sparring'" $?

[[ -f "$PLAN" ]] && grep -qi "Day 151" "$PLAN" 2>/dev/null
check "MANAGER_DASHBOARD_REENTRY_PLAN.md includes Day 151" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-manager-dashboard-day-151"' "$PKG" 2>/dev/null
check "package.json has validate-manager-dashboard-day-151 script" $?

# Day 151 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-(tier-2b-day|manager-dashboard-day)-(1[0-4][0-9]|150)' "$0" 2>/dev/null; then
  check "Day 151 does not recursively invoke an older day" 1
else
  check "Day 151 does not recursively invoke an older day" 0
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

# No migration added today (WEB has no migrations; guard against stray SQL DDL).
if grep -riqE "CREATE TABLE|ALTER TABLE" "$COACHING" 2>/dev/null; then
  check "no migration added today" 1
else
  check "no migration added today" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Day 151 validation FAILED"
  exit 1
fi
echo "Day 151 validation PASSED"
