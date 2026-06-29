#!/usr/bin/env bash
# Validates the Day 162 Upload Call structured-linking / demo-data-readiness layer:
# /upload asks "who is this call for?" (account + rep) before file details, keeps a
# free-text fallback, and the docs record the change. Demo-readiness / data-quality
# only — no new features. Own checks only, follows the Day 135 rhythm and does NOT
# recursively chain older day scripts.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UPLOAD="$WEB_ROOT/src/app/upload/page.tsx"
UXDOC="$WEB_ROOT/UX_SIMPLIFICATION_PRINCIPLES.md"
PLAN="$WEB_ROOT/DEMO_READINESS_PLAN.md"
SMOKE="$WEB_ROOT/scripts/validate-tier-2b-smoke.sh"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Demo Readiness Day 162 — own checks only (use validate-tier-2b-smoke for current smoke)"

# ── /upload structured, calm flow ──
grep -q "Upload a sales call" "$UPLOAD" 2>/dev/null
check "/upload includes \"Upload a sales call\"" $?

grep -q "Who is this call for?" "$UPLOAD" 2>/dev/null
check "/upload includes \"Who is this call for?\"" $?

grep -q "Account / Company" "$UPLOAD" 2>/dev/null
check "/upload includes \"Account / Company\"" $?

grep -qE ">Rep( |<|\b)" "$UPLOAD" 2>/dev/null
check "/upload includes \"Rep\"" $?

grep -q "Add call context" "$UPLOAD" 2>/dev/null
check "/upload includes \"Add call context\"" $?

grep -q "Call type" "$UPLOAD" 2>/dev/null
check "/upload includes \"Call type\"" $?

grep -q "Upload recording" "$UPLOAD" 2>/dev/null
check "/upload includes \"Upload recording\"" $?

grep -q "Upload and send to review queue" "$UPLOAD" 2>/dev/null
check "/upload includes \"Upload and send to review queue\"" $?

grep -q "Back to Manager Command Centre" "$UPLOAD" 2>/dev/null
check "/upload includes \"Back to Manager Command Centre\"" $?

grep -q 'type="file"' "$UPLOAD" 2>/dev/null
check "/upload still includes a file picker" $?

# ── Docs ──
grep -q "Day 162" "$PLAN" 2>/dev/null
check "DEMO_READINESS_PLAN.md includes Day 162" $?

grep -qi "who is this call for" "$UXDOC" 2>/dev/null
check "UX_SIMPLIFICATION_PRINCIPLES.md includes \"who is this call for\"" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh still exists" $?

# Day 162 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-(tier-2b|manager-dashboard|demo-readiness)-day-1[0-6][0-1]' "$0" 2>/dev/null; then
  check "Day 162 does not recursively invoke an older day" 1
else
  check "Day 162 does not recursively invoke an older day" 0
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

# No migration added today (account linking reused an existing column).
if ls "$WEB_ROOT"/migrations 2>/dev/null | grep -qiE 'day.?162|upload.link'; then
  check "no migration added today" 1
else
  check "no migration added today" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Demo Readiness Day 162 validation FAILED"
  exit 1
fi
echo "Demo Readiness Day 162 validation PASSED"
