#!/usr/bin/env bash
# Validates the Day 154 sparring assignment completion sync on /coaching: a manager
# can mark a queue-assigned sparring assignment complete when a direct completed
# session match exists, via the existing manager-scoped PATCH endpoint (no new API,
# no migration). Manager click only; inferred matches stay display-only. Own checks
# only — Day 135 rhythm, no recursive historical chain.
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

echo "Manager Dashboard / Day 154 — own checks only (use validate-tier-2b-smoke for current smoke)"

[[ -f "$COACHING" ]]
check "coaching/page.tsx exists" $?

grep -q "Mark complete" "$COACHING" 2>/dev/null
check "/coaching includes \"Mark complete\"" $?

grep -q "Marking…" "$COACHING" 2>/dev/null
check "/coaching includes \"Marking…\"" $?

grep -q "Sparring assignment marked complete." "$COACHING" 2>/dev/null
check "/coaching includes \"Sparring assignment marked complete.\"" $?

grep -q "Could not mark sparring assignment complete." "$COACHING" 2>/dev/null
check "/coaching includes \"Could not mark sparring assignment complete.\"" $?

grep -q "Ready to mark complete" "$COACHING" 2>/dev/null
check "/coaching includes \"Ready to mark complete\"" $?

grep -q "Completed via sparring session" "$COACHING" 2>/dev/null
check "/coaching includes \"Completed via sparring session\"" $?

grep -q "Match: inferred" "$COACHING" 2>/dev/null
check "/coaching still includes \"Match: inferred\"" $?

grep -q "Queue-assigned sparring" "$COACHING" 2>/dev/null
check "/coaching still includes \"Queue-assigned sparring\"" $?

# Completion must go through the manager-scoped assignment PATCH, gated on a direct match.
grep -q "assignments/manager/" "$COACHING" 2>/dev/null
check "/coaching PATCHes /v1/assignments/manager/:id" $?

grep -q "canMarkComplete" "$COACHING" 2>/dev/null
check "/coaching gates Mark complete behind a direct match (canMarkComplete)" $?

[[ -f "$PLAN" ]] && grep -qi "Day 154" "$PLAN" 2>/dev/null
check "MANAGER_DASHBOARD_REENTRY_PLAN.md includes Day 154" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-manager-dashboard-day-154"' "$PKG" 2>/dev/null
check "package.json has validate-manager-dashboard-day-154 script" $?

# Day 154 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-(tier-2b-day|manager-dashboard-day)-(1[0-4][0-9]|15[0-3])' "$0" 2>/dev/null; then
  check "Day 154 does not recursively invoke an older day" 1
else
  check "Day 154 does not recursively invoke an older day" 0
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

# No migration added today (WEB has no migrations; guard against stray SQL DDL).
if grep -riqE "CREATE TABLE|ALTER TABLE" "$COACHING" 2>/dev/null; then
  check "no migration added today" 1
else
  check "no migration added today" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Day 154 validation FAILED"
  exit 1
fi
echo "Day 154 validation PASSED"
