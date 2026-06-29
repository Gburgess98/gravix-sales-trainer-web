#!/usr/bin/env bash
# Validates the Day 159 Manager Dashboard lane closeout: the lane-close tracker
# document exists with the expected status, shipped-features, paused-tiers and
# not-next guardrails. Closeout/checkpoint day — no new features. Own checks only,
# Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLOSE="$WEB_ROOT/MANAGER_DASHBOARD_LANE_CLOSE.md"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
PKG="$WEB_ROOT/package.json"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Manager Dashboard / Day 159 — own checks only (use validate-tier-2b-smoke for current smoke)"

[[ -f "$CLOSE" ]]
check "MANAGER_DASHBOARD_LANE_CLOSE.md exists" $?

grep -q "Manager Dashboard / Team Coaching Visibility" "$CLOSE" 2>/dev/null
check "close doc includes \"Manager Dashboard / Team Coaching Visibility\"" $?

grep -q "Coaching Queue" "$CLOSE" 2>/dev/null
check "close doc includes \"Coaching Queue\"" $?

grep -q "Assign sparring" "$CLOSE" 2>/dev/null
check "close doc includes \"Assign sparring\"" $?

grep -q "Completion proof metadata" "$CLOSE" 2>/dev/null
check "close doc includes \"Completion proof metadata\"" $?

grep -q "Sparring score trend" "$CLOSE" 2>/dev/null
check "close doc includes \"Sparring score trend\"" $?

grep -q "Score breakdown" "$CLOSE" 2>/dev/null
check "close doc includes \"Score breakdown\"" $?

grep -q "Tier 2C Voice Sparring — Paused" "$CLOSE" 2>/dev/null
check "close doc includes \"Tier 2C Voice Sparring — Paused\"" $?

grep -q "Tier 2D Voice Score" "$CLOSE" 2>/dev/null
check "close doc includes \"Tier 2D Voice Score\"" $?

grep -q "auto-create" "$CLOSE" 2>/dev/null
check "close doc includes \"auto-create\"" $?

grep -q "auto-activate" "$CLOSE" 2>/dev/null
check "close doc includes \"auto-activate\"" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-manager-dashboard-day-159"' "$PKG" 2>/dev/null
check "package.json has validate-manager-dashboard-day-159 script" $?

# Day 159 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-(tier-2b-day|manager-dashboard-day)-(1[0-4][0-9]|15[0-8])' "$0" 2>/dev/null; then
  check "Day 159 does not recursively invoke an older day" 1
else
  check "Day 159 does not recursively invoke an older day" 0
fi

# No ElevenLabs/TTS/Voice Agent added to code. (The close doc legitimately names
# these tiers as Paused / not-next, so only the live coaching page is scanned.)
if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$COACHING" 2>/dev/null; then
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

# No new Whisperer feature expansion — no auto-create / auto-enable of triggers in code.
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
  echo "Day 159 validation FAILED"
  exit 1
fi
echo "Day 159 validation PASSED"
