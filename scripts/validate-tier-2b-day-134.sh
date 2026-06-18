#!/usr/bin/env bash
# Validates the Day 134 Tier 2B deliverable: candidate decision migration proof +
# close. No new features — confirms the Day 133 persistence surface is intact.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
MANAGER="$API_ROOT/src/routes/manager.ts"
DISCOVERY="$API_ROOT/src/whisperer/discovery.ts"
MIGRATION="$API_ROOT/sql/20260617_whisperer_trigger_candidate_decisions.sql"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

[[ -f "$MIGRATION" ]]
check "migration file exists" $?

grep -qE 'router\.post\("/whisperer-trigger-candidates/:id/decision' "$MANAGER" 2>/dev/null
check "decision endpoint exists" $?

grep -q "approved" "$MANAGER" 2>/dev/null && grep -q "dismissed" "$MANAGER" 2>/dev/null && grep -q "rejected" "$MANAGER" 2>/dev/null
check "approved/dismissed/rejected values exist" $?

grep -q "suppressedDecisionCount" "$MANAGER" 2>/dev/null
check "suppressedDecisionCount exists" $?

grep -qi "Dismissed candidates stay hidden" "$COACHING" 2>/dev/null
check "/coaching has \"Dismissed candidates stay hidden\"" $?

if grep -q "reappear after refresh" "$COACHING" 2>/dev/null; then
  check "no old reappear-after-refresh caveat" 1
else
  check "no old reappear-after-refresh caveat" 0
fi

if grep -riqE "openai|anthropic|claude|chat\.completions|responses\.create" "$DISCOVERY" 2>/dev/null; then
  check "no LLM call in discovery helper" 1
else
  check "no LLM call in discovery helper" 0
fi

if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$COACHING" "$DISCOVERY" "$MANAGER" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

bash "$WEB_ROOT/scripts/validate-tier-2b-day-133.sh" >/dev/null 2>&1
check "Day 133 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 134 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 134 validation PASSED"
