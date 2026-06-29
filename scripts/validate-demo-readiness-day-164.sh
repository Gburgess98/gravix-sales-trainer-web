#!/usr/bin/env bash
# Validates the Day 164 upload fix + layout pass: the missing_user processing
# failure is fixed (job polling goes through the authenticated getJobStatus helper,
# not a raw unauthenticated fetch), /upload uses a two-column layout with a calm
# right-hand guidance panel, and the error copy explains what happened. WEB-only,
# no migration. Own checks only, follows the Day 135 rhythm and does NOT recursively
# chain older day scripts.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UPLOAD="$WEB_ROOT/src/app/upload/page.tsx"
API_LIB="$WEB_ROOT/src/lib/api.ts"
UXDOC="$WEB_ROOT/UX_SIMPLIFICATION_PRINCIPLES.md"
PLAN="$WEB_ROOT/DEMO_READINESS_PLAN.md"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Demo Readiness Day 164 — own checks only (use validate-tier-2b-smoke for current smoke)"

# ── right-hand guidance panel ──
grep -q "What happens next" "$UPLOAD" 2>/dev/null
check "/upload includes \"What happens next\"" $?

grep -q "We upload the recording" "$UPLOAD" 2>/dev/null
check "/upload includes \"We upload the recording\"" $?

grep -q "review queue" "$UPLOAD" 2>/dev/null
check "/upload includes \"review queue\"" $?

grep -q "manager reviews score" "$UPLOAD" 2>/dev/null
check "/upload includes \"manager reviews score\"" $?

grep -q "Demo tip" "$UPLOAD" 2>/dev/null
check "/upload includes \"Demo tip\"" $?

grep -q "Need a new client?" "$UPLOAD" 2>/dev/null
check "/upload includes \"Need a new client?\"" $?

grep -q "Create new client" "$UPLOAD" 2>/dev/null
check "/upload includes \"Create new client\"" $?

# ── clearer error copy + preserved primary action ──
grep -q "Call uploaded, but processing could not start\." "$UPLOAD" 2>/dev/null
check "/upload includes \"Call uploaded, but processing could not start.\"" $?

grep -q "Reason:" "$UPLOAD" 2>/dev/null
check "/upload includes \"Reason:\"" $?

grep -q "Upload and send to review queue" "$UPLOAD" 2>/dev/null
check "/upload still includes \"Upload and send to review queue\"" $?

# ── missing_user fix: authenticated job polling ──
grep -q "getJobStatus" "$UPLOAD" 2>/dev/null
check "/upload polls via getJobStatus (authenticated)" $?

grep -q "export async function getJobStatus" "$API_LIB" 2>/dev/null
check "lib/api.ts exports getJobStatus" $?

if grep -qE 'fetch\(`/api/proxy/v1/jobs' "$UPLOAD" 2>/dev/null; then
  check "/upload no longer uses a raw unauthenticated jobs fetch" 1
else
  check "/upload no longer uses a raw unauthenticated jobs fetch" 0
fi

# ── docs ──
grep -q "Day 164" "$PLAN" 2>/dev/null
check "DEMO_READINESS_PLAN.md includes Day 164" $?

grep -qi "compact does not mean tiny" "$UXDOC" 2>/dev/null
check "UX_SIMPLIFICATION_PRINCIPLES.md includes \"compact does not mean tiny\"" $?

grep -qi "use space intentionally" "$UXDOC" 2>/dev/null
check "UX_SIMPLIFICATION_PRINCIPLES.md includes \"use space intentionally\"" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh still exists" $?

# Day 164 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-(tier-2b|manager-dashboard|demo-readiness)-day-1[0-6][0-3]' "$0" 2>/dev/null; then
  check "Day 164 does not recursively invoke an older day" 1
else
  check "Day 164 does not recursively invoke an older day" 0
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

# No migration added today (WEB-only fix + layout).
if ls "$WEB_ROOT"/migrations 2>/dev/null | grep -qiE 'day.?164|missing.user'; then
  check "no migration added today" 1
else
  check "no migration added today" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Demo Readiness Day 164 validation FAILED"
  exit 1
fi
echo "Demo Readiness Day 164 validation PASSED"
