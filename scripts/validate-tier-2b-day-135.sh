#!/usr/bin/env bash
# Validates the Day 135 Tier 2B deliverable: validation speed cleanup.
#
# Day 135 ships NO product change. It introduces a fast smoke validation and
# stops new day scripts from recursively re-running the whole day-111..134
# history. This script validates its OWN changes only — it deliberately does
# NOT recursively invoke Day 134 (that chain is what we're fixing).
#
# For current core invariants, run: npm run validate-tier-2b-smoke
# The historical recursive chain is intentionally not run by default.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
PKG="$WEB_ROOT/package.json"
NOTES="$WEB_ROOT/TIER_2B_VALIDATION_NOTES.md"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Tier 2B Day 135 — own checks only (use validate-tier-2b-smoke for current smoke)"

[[ -f "$SMOKE" ]]; check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-tier-2b-smoke"' "$PKG" 2>/dev/null
check "package.json has validate-tier-2b-smoke script" $?

grep -q '"validate-tier-2b-day-135"' "$PKG" 2>/dev/null
check "package.json has validate-tier-2b-day-135 script" $?

[[ -f "$NOTES" ]]; check "TIER_2B_VALIDATION_NOTES.md exists" $?

grep -qi "recursive" "$NOTES" 2>/dev/null
check "notes document the slow recursive chain" $?

# Day 135 must NOT recursively invoke Day 134 (the regression we're fixing).
# Look for an actual shell invocation, not a mention in a comment/guard.
if grep -qE 'bash[^#]*validate-tier-2b-day-134' "$0" 2>/dev/null; then
  check "Day 135 does not recursively invoke Day 134" 1
else
  check "Day 135 does not recursively invoke Day 134" 0
fi

# No product/business-logic files should change for a validation-only day.
if grep -rql "DEEPGRAM_API_KEY" "$WEB_ROOT/src" 2>/dev/null; then
  check "no DEEPGRAM_API_KEY in web" 1
else
  check "no DEEPGRAM_API_KEY in web" 0
fi

if grep -riql "elevenlabs\|text-to-speech\|voice.agent" "$WEB_ROOT/src" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent in web" 1
else
  check "no ElevenLabs/TTS/Voice Agent in web" 0
fi

# Optionally run the smoke validation to confirm the new fast path is green.
if [[ "${SKIP_SMOKE:-0}" != "1" ]]; then
  echo "--- running validate-tier-2b-smoke ---"
  bash "$SMOKE"
  check "validate-tier-2b-smoke passes" $?
else
  echo "SKIP  validate-tier-2b-smoke (SKIP_SMOKE=1)"
fi

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 135 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 135 validation PASSED"
