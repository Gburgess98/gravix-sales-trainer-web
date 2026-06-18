#!/usr/bin/env bash
# Tier 2B SMOKE validation — stable core invariants only.
#
# Purpose: a fast (seconds, not minutes) check that the Whisperer Tier 2B
# surface is structurally intact. This replaces the habit of recursively
# re-running the entire day-111..134 chain just to confirm nothing regressed.
#
# It checks invariants that should hold on every day, regardless of which
# day's feature shipped most recently. Per-day scripts still validate that
# day's specific change; this validates the foundation underneath all of them.
#
# Product rule: Gravix listens, coaches, scores and trains — it does not own
# the call. No voice output, no LLM on the live hot path.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"

WHISP="$WEB_ROOT/src/app/whisperer/page.tsx"
COACH="$WEB_ROOT/src/app/coaching/page.tsx"
CALL="$WEB_ROOT/src/app/calls/[id]/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Tier 2B smoke — core invariants only (run per-day scripts for day-specific changes)"

# --- /whisperer live page foundation -----------------------------------------
[[ -f "$WHISP" ]]; check "/whisperer page exists" $?

grep -q "'bearer', token" "$WHISP" 2>/dev/null
check "Deepgram bearer WS subprotocol present" $?

grep -q "diarize: 'true'" "$WHISP" 2>/dev/null
check "diarize=true present" $?

grep -qi "calibrat" "$WHISP" 2>/dev/null
check "speaker calibration copy present" $?

grep -q "SILENCE" "$WHISP" 2>/dev/null && grep -q "COOLDOWN" "$WHISP" 2>/dev/null
check "silence threshold / cooldown constants present" $?

# --- /coaching Whisperer surfaces --------------------------------------------
grep -q "Whisperer Insights" "$COACH" 2>/dev/null
check "/coaching has Whisperer Insights" $?

grep -q "Custom Triggers" "$COACH" 2>/dev/null
check "/coaching has Custom Triggers" $?

grep -q "Suggested Trigger Candidates" "$COACH" 2>/dev/null
check "/coaching has Suggested Trigger Candidates" $?

# --- /calls/[id] replay surface ----------------------------------------------
grep -q "Whisperer Moments" "$CALL" 2>/dev/null
check "/calls/[id] has Whisperer Moments" $?

# --- Guardrails: no forbidden capabilities in the web app --------------------
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

if grep -riqE "openai|anthropic|claude|chat\.completions|responses\.create" "$WHISP" 2>/dev/null; then
  check "no LLM on live whisperer hot path" 1
else
  check "no LLM on live whisperer hot path" 0
fi

# --- API pure validations (siblings; pathing guarded) ------------------------
# These are in-memory unit assertions — no DB, no network — so they're cheap.
if [[ -d "$API_ROOT" ]]; then
  npx tsx "$API_ROOT/scripts/validate-whisperer-triggers.ts" >/dev/null 2>&1
  check "API whisperer trigger assertions pass" $?
  npx tsx "$API_ROOT/scripts/validate-whisperer-discovery.ts" >/dev/null 2>&1
  check "API whisperer discovery assertions pass" $?
else
  echo "SKIP  API validations (API_ROOT not found at $API_ROOT — run them in the API repo)"
fi

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B smoke validation FAILED"
  exit 1
fi
echo "Tier 2B smoke validation PASSED"
