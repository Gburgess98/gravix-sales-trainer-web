#!/usr/bin/env bash
# Validates the Day 131 Tier 2B deliverable: manager approval flow — prefill the
# existing Custom Trigger form from a discovery candidate. No activation without
# the manager saving; no new API endpoint.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
MANAGER="$API_ROOT/src/routes/manager.ts"
DISCOVERY="$API_ROOT/src/whisperer/discovery.ts"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

grep -q "Use this candidate" "$COACHING" 2>/dev/null
check "/coaching includes \"Use this candidate\"" $?

grep -q "Candidate loaded into Custom Trigger form" "$COACHING" 2>/dev/null
check "/coaching includes \"Candidate loaded into Custom Trigger form\"" $?

grep -q "Manager approval required" "$COACHING" 2>/dev/null
check "/coaching includes \"Manager approval required\"" $?

grep -qi "will not go live until saved" "$COACHING" 2>/dev/null
check "/coaching includes updated approval copy" $?

# Prefill reuses the existing Custom Trigger form draft.
grep -q "useCandidate" "$COACHING" 2>/dev/null && grep -q "setTriggerDraft" "$COACHING" 2>/dev/null
check "candidate prefills the existing Custom Trigger form (setTriggerDraft)" $?

# Approval stays manual: no auto-create / approve endpoint added to the API.
if grep -qE 'router\.(post|put)\("/whisperer-trigger-candidates' "$MANAGER" 2>/dev/null \
  || grep -qE '/whisperer-trigger-candidates/[^"]*approve' "$MANAGER" 2>/dev/null; then
  check "no auto-create/approve endpoint added" 1
else
  check "no auto-create/approve endpoint added" 0
fi

# Candidates endpoint remains GET-only and read-only.
grep -qE 'router\.get\("/whisperer-trigger-candidates' "$MANAGER" 2>/dev/null
check "candidates endpoint still GET-only" $?

# No LLM on the discovery hot path.
if grep -riqE "openai|anthropic|claude|chat\.completions|responses\.create" "$DISCOVERY" 2>/dev/null; then
  check "no LLM call in discovery helper" 1
else
  check "no LLM call in discovery helper" 0
fi

if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$COACHING" "$DISCOVERY" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

bash "$WEB_ROOT/scripts/validate-tier-2b-day-130.sh" >/dev/null 2>&1
check "Day 130 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 131 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 131 validation PASSED"
