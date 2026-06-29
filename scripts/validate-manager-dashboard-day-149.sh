#!/usr/bin/env bash
# Validates the Day 149 Manager Command Centre deliverable on /coaching: the
# command-centre header, four priority action cards, recommended sparring drill
# mapping, and manager empty-states — plus the Day 149 doc section. Own checks
# only — follows the Day 135 rhythm and does NOT recursively chain older day
# scripts. For current core invariants run: npm run validate-tier-2b-smoke
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

echo "Manager Dashboard / Day 149 — own checks only (use validate-tier-2b-smoke for current smoke)"

[[ -f "$COACHING" ]]
check "coaching/page.tsx exists" $?

grep -q "Your team coaching command centre" "$COACHING" 2>/dev/null
check "/coaching includes \"Your team coaching command centre\"" $?

grep -q "Review calls" "$COACHING" 2>/dev/null
check "/coaching includes \"Review calls\"" $?

grep -q "Coach reps at risk" "$COACHING" 2>/dev/null
check "/coaching includes \"Coach reps at risk\"" $?

grep -q "Assign sparring" "$COACHING" 2>/dev/null
check "/coaching includes \"Assign sparring\"" $?

grep -q "Review AI discovery candidates" "$COACHING" 2>/dev/null
check "/coaching includes \"Review AI discovery candidates\"" $?

grep -q "Recommended drill" "$COACHING" 2>/dev/null
check "/coaching includes \"Recommended drill\"" $?

grep -q "Price objection sparring" "$COACHING" 2>/dev/null
check "/coaching includes a drill label (\"Price objection sparring\")" $?

# Manager empty-states.
grep -q "No calls waiting for review." "$COACHING" 2>/dev/null
check "/coaching includes empty-state \"No calls waiting for review.\"" $?

grep -q "No reps need urgent coaching." "$COACHING" 2>/dev/null
check "/coaching includes empty-state \"No reps need urgent coaching.\"" $?

grep -q "No new AI trigger candidates yet." "$COACHING" 2>/dev/null
check "/coaching includes empty-state \"No new AI trigger candidates yet.\"" $?

grep -q "No sparring sessions completed yet." "$COACHING" 2>/dev/null
check "/coaching includes empty-state \"No sparring sessions completed yet.\"" $?

[[ -f "$PLAN" ]] && grep -qi "Day 149" "$PLAN" 2>/dev/null
check "MANAGER_DASHBOARD_REENTRY_PLAN.md includes Day 149" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-manager-dashboard-day-149"' "$PKG" 2>/dev/null
check "package.json has validate-manager-dashboard-day-149 script" $?

# Day 149 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-(tier-2b-day|manager-dashboard-day)-1(3[0-9]|4[0-8])' "$0" 2>/dev/null; then
  check "Day 149 does not recursively invoke an older day" 1
else
  check "Day 149 does not recursively invoke an older day" 0
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

# No new Whisperer feature expansion — discovery/triggers stay read-only +
# manager-gated; this WEB change must not auto-create or auto-enable triggers.
if grep -riqE "auto.?create.?trigger|auto.?enable.?trigger" "$COACHING" 2>/dev/null; then
  check "no new Whisperer feature expansion (no auto-create/enable triggers)" 1
else
  check "no new Whisperer feature expansion (no auto-create/enable triggers)" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Day 149 validation FAILED"
  exit 1
fi
echo "Day 149 validation PASSED"
