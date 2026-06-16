#!/usr/bin/env bash
# Validates the Day 125 Tier 2B deliverables: custom trigger health flags + AI discovery plan.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
MANAGER="$API_ROOT/src/routes/manager.ts"
WROUTE="$API_ROOT/src/routes/whisperer.ts"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
PLAN="$WEB_ROOT/WHISPERER_AI_TRIGGER_DISCOVERY_PLAN.md"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

grep -q "customTriggerHealth" "$MANAGER" 2>/dev/null && grep -q "needsEditing" "$MANAGER"
check "manager summary includes customTriggerHealth/needsEditing" $?

grep -q "Needs editing" "$COACHING" 2>/dev/null
check "/coaching includes Needs editing" $?

grep -q "No custom trigger issues detected" "$COACHING" 2>/dev/null
check "/coaching includes No custom trigger issues detected" $?

[[ -f "$PLAN" ]]
check "AI Trigger Discovery plan doc exists" $?

grep -qi "manager approval required" "$PLAN" 2>/dev/null
check "doc includes manager approval required" $?

# No LLM on the live hot path: the /segments handler block must not call an LLM.
python3 - "$WROUTE" <<'PY'
import re, sys
src = open(sys.argv[1]).read()
m = re.search(r'router\.post\("/sessions/:id/segments".*?(?=\nrouter\.(?:post|get|patch|delete)\()', src, re.S)
block = m.group(0) if m else ""
hit = re.search(r'openai|chat\.completions|responses\.create|client\.responses', block, re.I)
sys.exit(1 if hit else 0)
PY
check "no LLM on live hot path (/segments)" $?

if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$MANAGER" "$COACHING" "$PLAN" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

bash "$WEB_ROOT/scripts/validate-tier-2b-day-124.sh" >/dev/null 2>&1
check "Day 124 validation still passes" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-123.sh" >/dev/null 2>&1
check "Day 123 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 125 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 125 validation PASSED"
