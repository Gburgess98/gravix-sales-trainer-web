#!/usr/bin/env bash
# Validates the Day 138 Tier 2B deliverable: AI Trigger candidate detail/review
# view. WEB-only, no migration, no new backend write. Own checks only — follows
# the Day 135 rhythm and does NOT recursively chain older day scripts.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
MANAGER="$API_ROOT/src/routes/manager.ts"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"
PKG="$WEB_ROOT/package.json"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Tier 2B Day 138 — own checks only (use validate-tier-2b-smoke for current smoke)"

grep -q "Review this candidate before adding it" "$COACHING" 2>/dev/null
check "/coaching has \"Review this candidate before adding it\"" $?

grep -q "Nothing goes live until" "$COACHING" 2>/dev/null
check "/coaching has \"Nothing goes live until\"" $?

grep -q "Why Gravix suggested this" "$COACHING" 2>/dev/null
check "/coaching has \"Why Gravix suggested this\"" $?

grep -q "Suggested trigger setup" "$COACHING" 2>/dev/null
check "/coaching has \"Suggested trigger setup\"" $?

grep -q "Suggested response" "$COACHING" 2>/dev/null
check "/coaching has \"Suggested response\"" $?

grep -q "Examples" "$COACHING" 2>/dev/null
check "/coaching has \"Examples\"" $?

grep -q "Use this candidate" "$COACHING" 2>/dev/null
check "/coaching still has \"Use this candidate\"" $?

grep -q "Reject" "$COACHING" 2>/dev/null
check "/coaching still has \"Reject\"" $?

grep -q "Restore" "$COACHING" 2>/dev/null
check "/coaching still has \"Restore\"" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh exists" $?

grep -q '"validate-tier-2b-day-138"' "$PKG" 2>/dev/null
check "package.json has validate-tier-2b-day-138 script" $?

# Day 138 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-tier-2b-day-13[0-7]' "$0" 2>/dev/null; then
  check "Day 138 does not recursively invoke an older day" 1
else
  check "Day 138 does not recursively invoke an older day" 0
fi

# No ElevenLabs/TTS/Voice Agent added.
if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$COACHING" "$MANAGER" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

# No LLM on the live hot path — detail view is read-only client rendering.
if grep -riqE "openai|anthropic|chat\.completions|responses\.create" "$MANAGER" 2>/dev/null; then
  check "no LLM call in manager route" 1
else
  check "no LLM call in manager route" 0
fi

# Day 138 is no-migration — no new whisperer candidate SQL file should appear.
if ls "$API_ROOT"/sql/*day*138* "$API_ROOT"/sql/*20260618* 2>/dev/null | grep -q .; then
  check "no new migration file added for Day 138" 1
else
  check "no new migration file added for Day 138" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 138 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 138 validation PASSED"
