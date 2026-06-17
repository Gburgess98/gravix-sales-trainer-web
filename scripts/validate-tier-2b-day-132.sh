#!/usr/bin/env bash
# Validates the Day 132 Tier 2B deliverable: candidate dedupe against the custom
# trigger library + local hide/dismiss review lifecycle. No migration.
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

# Part A — dedupe references the custom trigger library
grep -q "suppressKnownCandidates" "$MANAGER" 2>/dev/null && grep -q "whisperer_trigger_library" "$MANAGER" 2>/dev/null
check "candidates endpoint dedupes against custom trigger library" $?

grep -q "suppressKnownCandidates" "$DISCOVERY" 2>/dev/null
check "dedupe helper exists in discovery module" $?

# Part B — response transparency
grep -q "suppressedExistingCount" "$MANAGER" 2>/dev/null
check "response includes suppressedExistingCount" $?

# Endpoint stays read-only (no writes in the candidate handler block).
python3 - "$MANAGER" <<'PY'
import re, sys
src = open(sys.argv[1]).read()
m = re.search(r'router\.get\("/whisperer-trigger-candidates".*?\n\}\);', src, re.S)
block = m.group(0) if m else ""
hit = re.search(r'\.insert\(|\.update\(|\.upsert\(|\.delete\(', block)
sys.exit(1 if hit else 0)
PY
check "candidates endpoint remains read-only (no writes)" $?

# Part C/D — local hide/dismiss
grep -qE "Dismiss|Hide for now" "$COACHING" 2>/dev/null
check "/coaching includes Dismiss / Hide for now" $?

grep -qi "Hidden candidates will reappear after refresh" "$COACHING" 2>/dev/null
check "/coaching includes hidden-candidates copy" $?

grep -q "dismissedCandidateIds" "$COACHING" 2>/dev/null
check "/coaching tracks dismissed candidates locally" $?

# Preserved from Day 131
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

if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$COACHING" "$DISCOVERY" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

# No migration added for candidate decisions
if ls "$API_ROOT"/sql/*candidate*decision* >/dev/null 2>&1 || ls "$API_ROOT"/sql/*trigger_candidate* >/dev/null 2>&1; then
  check "no migration added for candidate decisions" 1
else
  check "no migration added for candidate decisions" 0
fi

bash "$WEB_ROOT/scripts/validate-tier-2b-day-131.sh" >/dev/null 2>&1
check "Day 131 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 132 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 132 validation PASSED"
