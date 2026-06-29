#!/usr/bin/env bash
# Validates the Day 150 Coaching Queue consolidation on /coaching: one prioritised
# queue combining calls needing review, rep risk, assignments and weak skills, with
# recommended drills and an "all clear" empty state — plus the Day 150 doc section.
# Own checks only — follows the Day 135 rhythm and does NOT recursively chain older
# day scripts. For current core invariants run: npm run validate-tier-2b-smoke
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

echo "Manager Dashboard / Day 150 — own checks only (use validate-tier-2b-smoke for current smoke)"

[[ -f "$COACHING" ]]
check "coaching/page.tsx exists" $?

grep -q "Coaching Queue" "$COACHING" 2>/dev/null
check "/coaching includes \"Coaching Queue\"" $?

grep -q "Prioritised coaching moments" "$COACHING" 2>/dev/null
check "/coaching includes \"Prioritised coaching moments\"" $?

grep -q "Call review" "$COACHING" 2>/dev/null
check "/coaching includes \"Call review\"" $?

grep -q "Rep risk" "$COACHING" 2>/dev/null
check "/coaching includes \"Rep risk\"" $?

grep -q "Assignment" "$COACHING" 2>/dev/null
check "/coaching includes \"Assignment\"" $?

grep -q "Weak skill" "$COACHING" 2>/dev/null
check "/coaching includes \"Weak skill\"" $?

grep -q "Recommended drill" "$COACHING" 2>/dev/null
check "/coaching includes \"Recommended drill\"" $?

grep -q "Assign sparring" "$COACHING" 2>/dev/null
check "/coaching includes \"Assign sparring\"" $?

grep -q "All clear" "$COACHING" 2>/dev/null
check "/coaching includes \"All clear\" empty state" $?

[[ -f "$PLAN" ]] && grep -qi "Day 150" "$PLAN" 2>/dev/null
check "MANAGER_DASHBOARD_REENTRY_PLAN.md includes Day 150" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-manager-dashboard-day-150"' "$PKG" 2>/dev/null
check "package.json has validate-manager-dashboard-day-150 script" $?

# Day 150 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-(tier-2b-day|manager-dashboard-day)-1(3[0-9]|4[0-9])' "$0" 2>/dev/null; then
  check "Day 150 does not recursively invoke an older day" 1
else
  check "Day 150 does not recursively invoke an older day" 0
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

# No migration added today (WEB has no migrations dir, but guard the doc too).
if grep -riqE "CREATE TABLE|ALTER TABLE|migration_required.*add" "$COACHING" 2>/dev/null; then
  check "no migration added today" 1
else
  check "no migration added today" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Day 150 validation FAILED"
  exit 1
fi
echo "Day 150 validation PASSED"
