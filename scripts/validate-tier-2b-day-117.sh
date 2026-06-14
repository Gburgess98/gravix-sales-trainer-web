#!/usr/bin/env bash
# Validates the Day 117 Tier 2B deliverable: semantic Whisperer trigger classifier.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
ENGINE="$API_ROOT/src/whisperer/triggers.ts"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

grep -q "export function normaliseTranscriptText" "$ENGINE" 2>/dev/null
check "normaliseTranscriptText exists" $?

grep -q "export function scoreTriggerIntent" "$ENGINE" 2>/dev/null
check "scoreTriggerIntent exists" $?

for d in Price Timing Authority Trust Competitor SendInfo; do
  grep -q "detect${d}Intent" "$ENGINE" 2>/dev/null
  check "detect${d}Intent exists" $?
done

grep -q "TRIGGER_THRESHOLD" "$ENGINE" 2>/dev/null
check "confidence threshold defined" $?

# Semantic detection unit assertions
if npx tsx "$API_ROOT/scripts/validate-whisperer-triggers.ts" >/dev/null 2>&1; then
  check "semantic trigger unit assertions pass" 0
else
  check "semantic trigger unit assertions pass" 1
fi

# Earlier flows intact
grep -q "isDuplicate" "$ENGINE" 2>/dev/null
check "30s de-duplication preserved" $?

grep -q 'speaker === "rep"' "$ENGINE" 2>/dev/null
check "rep-speech suppression preserved" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-115.sh" >/dev/null 2>&1
check "Day 115 validation still passes" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-116.sh" >/dev/null 2>&1
check "Day 116 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 117 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 117 validation PASSED"
