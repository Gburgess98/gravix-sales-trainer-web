#!/usr/bin/env bash
# Validates the Day 177 premium UX audit: the audit document exists and covers the
# agreed sections (premium/calm posture, navigation, visual noise, page-by-page notes,
# Day 178 plan). Audit day — no code changes shipped. Own checks only, Day 135 rhythm,
# no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 177 — own checks only (use validate-tier-2b-smoke for current smoke)"

[[ -f "$AUDIT" ]]
check "PREMIUM_UX_AUDIT.md exists" $?

grep -qi "premium" "$AUDIT" 2>/dev/null
check "audit doc includes \"premium\"" $?

grep -qi "calm" "$AUDIT" 2>/dev/null
check "audit doc includes \"calm\"" $?

grep -qi "navigation" "$AUDIT" 2>/dev/null
check "audit doc includes \"navigation\"" $?

grep -qi "visual noise" "$AUDIT" 2>/dev/null
check "audit doc includes \"visual noise\"" $?

grep -qi "page-by-page" "$AUDIT" 2>/dev/null
check "audit doc includes \"page-by-page\"" $?

grep -q "Day 178" "$AUDIT" 2>/dev/null
check "audit doc includes \"Day 178\"" $?

if [[ "$fail" == "0" ]]; then
  echo "✅ Day 177 premium UX validation PASSED"
  exit 0
else
  echo "❌ Day 177 premium UX validation FAILED"
  exit 1
fi
