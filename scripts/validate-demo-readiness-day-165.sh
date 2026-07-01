#!/usr/bin/env bash
# Validates the Day 165 Upload → Review Queue pipeline proof: /upload honestly
# distinguishes "processing has started" vs "ready for review", routes to the
# Review Queue, and keeps the clear failure copy. The uploaded call is now stamped
# with the uploader's office/company (API) so it is in scope for the manager's
# Review Queue. Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UPLOAD="$WEB_ROOT/src/app/upload/page.tsx"
API_LIB="$WEB_ROOT/src/lib/api.ts"
COACHING="$WEB_ROOT/src/app/coaching/page.tsx"
PLAN="$WEB_ROOT/DEMO_READINESS_PLAN.md"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Demo Readiness Day 165 — own checks only (use validate-tier-2b-smoke for current smoke)"

# ── post-upload status copy ──
grep -q "Call uploaded. Processing has started." "$UPLOAD" 2>/dev/null
check "/upload includes \"Call uploaded. Processing has started.\"" $?

grep -q "It will appear in the Review Queue once scoring finishes." "$UPLOAD" 2>/dev/null
check "/upload includes \"It will appear in the Review Queue once scoring finishes.\"" $?

grep -q "Call ready for review." "$UPLOAD" 2>/dev/null
check "/upload includes \"Call ready for review.\"" $?

grep -q "Open Review Queue" "$UPLOAD" 2>/dev/null
check "/upload includes \"Open Review Queue\"" $?

grep -q "Call uploaded, but processing could not start." "$UPLOAD" 2>/dev/null
check "/upload includes \"Call uploaded, but processing could not start.\"" $?

grep -q "Reason:" "$UPLOAD" 2>/dev/null
check "/upload includes \"Reason:\"" $?

# ── pipeline wiring ──
grep -q "getCallStatus" "$UPLOAD" 2>/dev/null
check "/upload polls the call status (getCallStatus)" $?

grep -q "export async function getCallStatus" "$API_LIB" 2>/dev/null
check "lib/api.ts exports getCallStatus" $?

grep -q "coaching?tab=review" "$UPLOAD" 2>/dev/null
check "/upload Review Queue CTA deep-links to /coaching?tab=review" $?

grep -q "params.get('tab')" "$COACHING" 2>/dev/null
check "/coaching reads initial tab from the URL" $?

# ── docs ──
grep -q "Day 165" "$PLAN" 2>/dev/null
check "DEMO_READINESS_PLAN.md includes Day 165" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh still exists" $?

# Day 165 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-(tier-2b|manager-dashboard|demo-readiness)-day-1[0-6][0-4]' "$0" 2>/dev/null; then
  check "Day 165 does not recursively invoke an older day" 1
else
  check "Day 165 does not recursively invoke an older day" 0
fi

# No ElevenLabs/TTS/Voice Agent added in the upload flow.
if grep -riqE "elevenlabs|text.to.speech|voice.agent" "$UPLOAD" 2>/dev/null; then
  check "no ElevenLabs/TTS/Voice Agent added" 1
else
  check "no ElevenLabs/TTS/Voice Agent added" 0
fi

# No LLM on the live hot path sneaked into the upload page.
if grep -riqE "openai|anthropic|chat\.completions|responses\.create" "$UPLOAD" 2>/dev/null; then
  check "no LLM on live hot path" 1
else
  check "no LLM on live hot path" 0
fi

# No new Whisperer feature expansion in the upload page.
if grep -riqE "new whisperer|whisperer v2|whisperer.feature" "$UPLOAD" 2>/dev/null; then
  check "no new Whisperer feature expansion" 1
else
  check "no new Whisperer feature expansion" 0
fi

# No migration added today (fix reuses existing calls columns).
if ls "$WEB_ROOT"/migrations 2>/dev/null | grep -qiE 'day.?165|review.scope'; then
  check "no migration added today" 1
else
  check "no migration added today" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Demo Readiness Day 165 validation FAILED"
  exit 1
fi
echo "Demo Readiness Day 165 validation PASSED"
