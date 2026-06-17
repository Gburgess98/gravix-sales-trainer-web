#!/usr/bin/env bash
# Validates the Day 133 Tier 2B deliverable: persistent candidate lifecycle
# decisions (approved/dismissed/rejected) for AI Trigger Discovery.
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

# Part A — migration
[[ -f "$MIGRATION" ]]
check "migration file exists" $?

grep -q "whisperer_trigger_candidate_decisions" "$MIGRATION" 2>/dev/null
check "decisions table in SQL" $?

grep -q "approved" "$MIGRATION" 2>/dev/null && grep -q "dismissed" "$MIGRATION" 2>/dev/null && grep -q "rejected" "$MIGRATION" 2>/dev/null
check "decision values approved/dismissed/rejected exist" $?

# Part C — decision endpoint
grep -qE 'router\.post\("/whisperer-trigger-candidates/:id/decision' "$MANAGER" 2>/dev/null
check "decision endpoint exists" $?

grep -q "migration_required" "$MANAGER" 2>/dev/null && grep -q "candidateDecisionsTableMissing" "$MANAGER" 2>/dev/null
check "decision endpoint validates migration_required" $?

# Part D — filter + summary
grep -q "suppressedDecisionCount" "$MANAGER" 2>/dev/null
check "trigger candidates endpoint references suppressedDecisionCount" $?

# Part E — web copy + wiring
if grep -q "reappear after refresh" "$COACHING" 2>/dev/null; then
  check "/coaching no longer has old reappear-after-refresh caveat" 1
else
  check "/coaching no longer has old reappear-after-refresh caveat" 0
fi

grep -qi "Dismissed candidates stay hidden" "$COACHING" 2>/dev/null
check "/coaching has dismissed-candidates-stay-hidden copy" $?

grep -q "/whisperer-trigger-candidates/" "$COACHING" 2>/dev/null && grep -q "/decision" "$COACHING" 2>/dev/null
check "/coaching calls candidate decision endpoint" $?

grep -q "Use this candidate" "$COACHING" 2>/dev/null
check "Use this candidate still exists" $?

grep -q "Manager approval required" "$COACHING" 2>/dev/null
check "manager approval copy still exists" $?

# No LLM on the discovery hot path
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

bash "$WEB_ROOT/scripts/validate-tier-2b-day-132.sh" >/dev/null 2>&1
check "Day 132 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 133 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 133 validation PASSED"
