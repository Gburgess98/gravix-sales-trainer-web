#!/usr/bin/env bash
# Validates the Day 158 sparring score breakdown by rep / drill on /coaching:
# proof-backed performance grouped from the Day 156 proof rows (assignment meta),
# with trend labels and honest empty states (WEB-only, no backend, no migration).
# Own checks only — Day 135 rhythm, no recursive historical chain.
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

echo "Manager Dashboard / Day 158 — own checks only (use validate-tier-2b-smoke for current smoke)"

[[ -f "$COACHING" ]]
check "coaching/page.tsx exists" $?

grep -q "By rep" "$COACHING" 2>/dev/null
check "/coaching includes \"By rep\"" $?

grep -q "By drill" "$COACHING" 2>/dev/null
check "/coaching includes \"By drill\"" $?

grep -q "No rep-level sparring trend yet." "$COACHING" 2>/dev/null
check "/coaching includes \"No rep-level sparring trend yet.\"" $?

grep -q "No drill-level sparring trend yet." "$COACHING" 2>/dev/null
check "/coaching includes \"No drill-level sparring trend yet.\"" $?

grep -q "Trends need at least two proof-backed scores." "$COACHING" 2>/dev/null
check "/coaching includes \"Trends need at least two proof-backed scores.\"" $?

grep -q "Improving" "$COACHING" 2>/dev/null
check "/coaching includes \"Improving\"" $?

grep -q "Declining" "$COACHING" 2>/dev/null
check "/coaching includes \"Declining\"" $?

grep -q "Need more scores" "$COACHING" 2>/dev/null
check "/coaching includes \"Need more scores\"" $?

# Grouping must come from the pure helpers, not a backend call.
grep -q "groupProofScoresByRep" "$COACHING" 2>/dev/null
check "/coaching uses groupProofScoresByRep helper" $?

grep -q "groupProofScoresByDrill" "$COACHING" 2>/dev/null
check "/coaching uses groupProofScoresByDrill helper" $?

# Day 156 trend foundation must still be present (no regression).
grep -q "Sparring score trend" "$COACHING" 2>/dev/null
check "/coaching still includes \"Sparring score trend\"" $?

grep -q "Proof-backed completions" "$COACHING" 2>/dev/null
check "/coaching still includes \"Proof-backed completions\"" $?

[[ -f "$PLAN" ]] && grep -qi "Day 158" "$PLAN" 2>/dev/null
check "MANAGER_DASHBOARD_REENTRY_PLAN.md includes Day 158" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-manager-dashboard-day-158"' "$PKG" 2>/dev/null
check "package.json has validate-manager-dashboard-day-158 script" $?

# Day 158 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-(tier-2b-day|manager-dashboard-day)-(1[0-4][0-9]|15[0-7])' "$0" 2>/dev/null; then
  check "Day 158 does not recursively invoke an older day" 1
else
  check "Day 158 does not recursively invoke an older day" 0
fi

# No charting library pulled in for the breakdown.
if grep -riqE "recharts|chart\.js|chartjs|victory|nivo|d3-" "$COACHING" 2>/dev/null; then
  check "no charting library added" 1
else
  check "no charting library added" 0
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
  echo "Day 158 validation FAILED"
  exit 1
fi
echo "Day 158 validation PASSED"
