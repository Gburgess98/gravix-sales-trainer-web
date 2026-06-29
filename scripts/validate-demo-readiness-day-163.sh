#!/usr/bin/env bash
# Validates the Day 163 Upload Call compact-layout + create-client layer: /upload
# is grouped into a single compact card (Call ownership / Call context / Recording),
# exposes a "Create new client" path with a temporary free-text fallback, and the
# docs record the change. UX / demo-readiness only — no new features. Own checks
# only, follows the Day 135 rhythm and does NOT recursively chain older day scripts.
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

echo "Demo Readiness Day 163 — own checks only (use validate-tier-2b-smoke for current smoke)"

# ── /upload compact, structured flow ──
grep -q "Upload a sales call" "$UPLOAD" 2>/dev/null
check "/upload includes \"Upload a sales call\"" $?

grep -q "Link the recording to the right client, rep and review queue" "$UPLOAD" 2>/dev/null
check "/upload includes \"Link the recording to the right client, rep and review queue\"" $?

grep -q "Call ownership" "$UPLOAD" 2>/dev/null
check "/upload includes \"Call ownership\"" $?

grep -q "Call context" "$UPLOAD" 2>/dev/null
check "/upload includes \"Call context\"" $?

grep -q "Recording" "$UPLOAD" 2>/dev/null
check "/upload includes \"Recording\"" $?

grep -q "Create new client" "$UPLOAD" 2>/dev/null
check "/upload includes \"Create new client\"" $?

grep -q "Client not listed" "$UPLOAD" 2>/dev/null
check "/upload includes \"Client not listed\"" $?

grep -q "Upload and send to review queue" "$UPLOAD" 2>/dev/null
check "/upload includes \"Upload and send to review queue\"" $?

grep -q "Back to Command Centre" "$UPLOAD" 2>/dev/null
check "/upload includes \"Back to Command Centre\"" $?

grep -q "Call uploaded\." "$UPLOAD" 2>/dev/null
check "/upload includes \"Call uploaded.\"" $?

grep -q 'type="file"' "$UPLOAD" 2>/dev/null
check "/upload still includes a file picker" $?

# ── Docs ──
grep -q "Day 163" "$PLAN" 2>/dev/null
check "DEMO_READINESS_PLAN.md includes Day 163" $?

grep -qi "normal laptop screen" "$UXDOC" 2>/dev/null
check "UX_SIMPLIFICATION_PRINCIPLES.md includes \"normal laptop screen\"" $?

grep -qi "create/add fallback" "$UXDOC" 2>/dev/null
check "UX_SIMPLIFICATION_PRINCIPLES.md includes \"create/add fallback\"" $?

[[ -f "$SMOKE" ]]
check "validate-tier-2b-smoke.sh still exists" $?

# Day 163 must NOT recursively invoke an older day script (Day 135 rhythm).
if grep -qE 'bash[^#]*validate-(tier-2b|manager-dashboard|demo-readiness)-day-1[0-6][0-2]' "$0" 2>/dev/null; then
  check "Day 163 does not recursively invoke an older day" 1
else
  check "Day 163 does not recursively invoke an older day" 0
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

# No migration added today (WEB-only layout pass).
if ls "$WEB_ROOT"/migrations 2>/dev/null | grep -qiE 'day.?163|upload.compact'; then
  check "no migration added today" 1
else
  check "no migration added today" 0
fi

if [[ $fail -ne 0 ]]; then
  echo "Demo Readiness Day 163 validation FAILED"
  exit 1
fi
echo "Demo Readiness Day 163 validation PASSED"
