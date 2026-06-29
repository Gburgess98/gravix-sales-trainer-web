#!/usr/bin/env bash
# Validates the Day 153 sparring completion follow-through on /coaching: queue-
# assigned sparring items show matched completed sparring sessions (direct or
# inferred) with score/date, an unmatched fallback, and a "Matched completed
# sparring" summary — plus the Day 153 doc section. Own checks only — follows the
# Day 135 rhythm and does NOT recursively chain older day scripts.
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

echo "Manager Dashboard / Day 153 — own checks only (use validate-tier-2b-smoke for current smoke)"

[[ -f "$COACHING" ]]
check "coaching/page.tsx exists" $?

grep -q "Completed sparring" "$COACHING" 2>/dev/null
check "/coaching includes \"Completed sparring\"" $?

grep -q "No completed sparring found yet" "$COACHING" 2>/dev/null
check "/coaching includes \"No completed sparring found yet\"" $?

grep -q "Matched completed sparring" "$COACHING" 2>/dev/null
check "/coaching includes \"Matched completed sparring\"" $?

grep -q "Match: inferred" "$COACHING" 2>/dev/null
check "/coaching includes \"Match: inferred\"" $?

grep -q "Queue-assigned sparring" "$COACHING" 2>/dev/null
check "/coaching includes \"Queue-assigned sparring\"" $?

grep -q "Open sparring drills" "$COACHING" 2>/dev/null
check "/coaching includes \"Open sparring drills\"" $?

grep -q "Overdue sparring drills" "$COACHING" 2>/dev/null
check "/coaching includes \"Overdue sparring drills\"" $?

grep -q "Assign sparring" "$COACHING" 2>/dev/null
check "/coaching still includes \"Assign sparring\"" $?

# The follow-through must use a real session-matching helper (not faked).
grep -q "findRelatedSparringSession" "$COACHING" 2>/dev/null
check "/coaching uses findRelatedSparringSession helper" $?

[[ -f "$PLAN" ]] && grep -qi "Day 153" "$PLAN" 2>/dev/null
check "MANAGER_DASHBOARD_REENTRY_PLAN.md includes Day 153" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-manager-dashboard-day-153"' "$PKG" 2>/dev/null
check "package.json has validate-manager-dashboard-day-153 script" $?

# Day 153 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-(tier-2b-day|manager-dashboard-day)-(1[0-4][0-9]|15[0-2])' "$0" 2>/dev/null; then
  check "Day 153 does not recursively invoke an older day" 1
else
  check "Day 153 does not recursively invoke an older day" 0
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

# No assignment auto-completion mutation added today (display-only tracking).
# Guards against a new assignment-completion endpoint call; the pre-existing
# call manager-review action is unrelated and intentionally not matched.
if grep -riqE "assignments/[^\"']*/complete|/assignments/[^\"']*(complete|mark-complete)" "$COACHING" 2>/dev/null; then
  check "no assignment auto-completion mutation added" 1
else
  check "no assignment auto-completion mutation added" 0
fi

# No migration added today (WEB has no migrations; guard against stray SQL DDL).
if grep -riqE "CREATE TABLE|ALTER TABLE" "$COACHING" 2>/dev/null; then
  check "no migration added today" 1
else
  check "no migration added today" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Day 153 validation FAILED"
  exit 1
fi
echo "Day 153 validation PASSED"
