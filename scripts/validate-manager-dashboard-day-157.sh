#!/usr/bin/env bash
# Validates the Day 157 manager demo polish on /coaching: a demo flow strip wired
# to existing tabs/anchors confirms /coaching as the primary Manager Command
# Centre (WEB-only, no new data, no AI, no migration). Own checks only —
# Day 135 rhythm, no recursive historical chain.
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

echo "Manager Dashboard / Day 157 — own checks only (use validate-tier-2b-smoke for current smoke)"

[[ -f "$COACHING" ]]
check "coaching/page.tsx exists" $?

grep -q "Demo flow" "$COACHING" 2>/dev/null
check "/coaching includes \"Demo flow\"" $?

grep -q "Review calls" "$COACHING" 2>/dev/null
check "/coaching includes \"Review calls\"" $?

grep -q "Assign sparring" "$COACHING" 2>/dev/null
check "/coaching includes \"Assign sparring\"" $?

grep -q "Track follow-through" "$COACHING" 2>/dev/null
check "/coaching includes \"Track follow-through\"" $?

grep -q "Review AI discoveries" "$COACHING" 2>/dev/null
check "/coaching includes \"Review AI discoveries\"" $?

# Demo strip targets existing anchors/tabs only (no new data).
grep -q 'id="coaching-queue"' "$COACHING" 2>/dev/null
check "/coaching has #coaching-queue anchor" $?

grep -q 'id="queue-sparring"' "$COACHING" 2>/dev/null
check "/coaching has #queue-sparring anchor" $?

# Day 156 trend + Day 155 proof copy must still be present (no regressions).
grep -q "Sparring score trend" "$COACHING" 2>/dev/null
check "/coaching still includes \"Sparring score trend\"" $?

grep -q "Proof stored" "$COACHING" 2>/dev/null
check "/coaching still includes \"Proof stored\"" $?

[[ -f "$PLAN" ]] && grep -qi "Day 157" "$PLAN" 2>/dev/null
check "MANAGER_DASHBOARD_REENTRY_PLAN.md includes Day 157" $?

grep -q "primary Manager Command Centre" "$PLAN" 2>/dev/null
check "MANAGER_DASHBOARD_REENTRY_PLAN.md includes \"primary Manager Command Centre\"" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-manager-dashboard-day-157"' "$PKG" 2>/dev/null
check "package.json has validate-manager-dashboard-day-157 script" $?

# Day 157 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-(tier-2b-day|manager-dashboard-day)-(1[0-4][0-9]|15[0-6])' "$0" 2>/dev/null; then
  check "Day 157 does not recursively invoke an older day" 1
else
  check "Day 157 does not recursively invoke an older day" 0
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
  echo "Day 157 validation FAILED"
  exit 1
fi
echo "Day 157 validation PASSED"
