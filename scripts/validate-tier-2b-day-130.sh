#!/usr/bin/env bash
# Validates the Day 130 Tier 2B deliverable: read-only AI Trigger Discovery
# foundation (manager-only candidates; no activation, no LLM on any hot path).
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
PLAN="$WEB_ROOT/WHISPERER_AI_TRIGGER_DISCOVERY_PLAN.md"
DISCOVERY="$API_ROOT/src/whisperer/discovery.ts"
MANAGER="$API_ROOT/src/routes/manager.ts"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

[[ -f "$PLAN" ]]
check "WHISPERER_AI_TRIGGER_DISCOVERY_PLAN.md exists" $?

[[ -f "$DISCOVERY" ]] && grep -q "discoverTriggerCandidates" "$DISCOVERY" 2>/dev/null
check "discovery helper exists" $?

grep -q "/whisperer-trigger-candidates" "$MANAGER" 2>/dev/null
check "manager endpoint /whisperer-trigger-candidates exists" $?

grep -q "requireManager" "$MANAGER" 2>/dev/null
check "requireManager is used" $?

# Endpoint must be read-only: the candidates handler must not insert anything.
python3 - "$MANAGER" <<'PY'
import re, sys
src = open(sys.argv[1]).read()
m = re.search(r'router\.get\("/whisperer-trigger-candidates".*?\n\}\);', src, re.S)
block = m.group(0) if m else ""
hit = re.search(r'\.insert\(|\.update\(|\.upsert\(|\.delete\(|whisperer_trigger_library', block)
sys.exit(1 if hit else 0)
PY
check "candidates endpoint does not write/insert triggers" $?

grep -q "Suggested Trigger Candidates" "$COACHING" 2>/dev/null
check "/coaching includes Suggested Trigger Candidates copy" $?

grep -qi "approve before anything goes live" "$COACHING" 2>/dev/null
check "/coaching includes manager approval copy" $?

# No LLM on the discovery hot path (helper module + endpoint block).
if grep -riqE "openai|anthropic|claude|chat\.completions|responses\.create" "$DISCOVERY" 2>/dev/null; then
  check "no LLM call in discovery helper" 1
else
  check "no LLM call in discovery helper" 0
fi

python3 - "$MANAGER" <<'PY'
import re, sys
src = open(sys.argv[1]).read()
m = re.search(r'router\.get\("/whisperer-trigger-candidates".*?\n\}\);', src, re.S)
block = m.group(0) if m else ""
hit = re.search(r'openai|anthropic|claude|chat\.completions|responses\.create', block, re.I)
sys.exit(1 if hit else 0)
PY
check "no LLM call in candidates endpoint" $?

if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$DISCOVERY" "$COACHING" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

bash "$WEB_ROOT/scripts/validate-tier-2b-day-129.sh" >/dev/null 2>&1
check "Day 129 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 130 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 130 validation PASSED"
