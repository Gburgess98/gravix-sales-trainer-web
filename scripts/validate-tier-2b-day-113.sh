#!/usr/bin/env bash
# Validates the Day 113 Tier 2B deliverables: live validation + reconnect hardening.
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${API_ROOT:-$HOME/Dev/gravix-sales-trainer-api}"
ROUTE="$API_ROOT/src/routes/whisperer.ts"
PAGE="$WEB_ROOT/src/app/whisperer/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

grep -q 'router.post("/deepgram-token"' "$ROUTE" 2>/dev/null
check "/v1/whisperer/deepgram-token still exists" $?

grep -q "Reconnecting" "$PAGE" 2>/dev/null
check "/whisperer includes reconnecting copy" $?

grep -q "reconnectAttemptRef" "$PAGE" 2>/dev/null && grep -q "RECONNECT_BACKOFF_MS" "$PAGE"
check "/whisperer has bounded retry/backoff logic" $?

grep -q "userStoppedRef" "$PAGE" 2>/dev/null
check "/whisperer does not reconnect after user stop" $?

grep -q "Start listening" "$PAGE" 2>/dev/null
check "/whisperer still includes Start listening" $?

grep -q "Stop listening" "$PAGE" 2>/dev/null
check "/whisperer still includes Stop listening" $?

grep -q "Manual Simulator" "$PAGE" 2>/dev/null
check "/whisperer still includes Manual Simulator" $?

grep -q "/segments" "$PAGE" 2>/dev/null
check "/whisperer posts final segments to /segments" $?

if grep -q "DEEPGRAM_API_KEY" "$PAGE" 2>/dev/null; then
  check "/whisperer does not reference DEEPGRAM_API_KEY" 1
else
  check "/whisperer does not reference DEEPGRAM_API_KEY" 0
fi

bash "$WEB_ROOT/scripts/validate-tier-2b-day-112.sh" >/dev/null 2>&1
check "Day 112 validation still passes" $?

bash "$WEB_ROOT/scripts/validate-tier-2b-day-111.sh" >/dev/null 2>&1
check "Day 111 validation still passes" $?

if [[ $fail -ne 0 ]]; then
  echo "Tier 2B Day 113 validation FAILED"
  exit 1
fi
echo "Tier 2B Day 113 validation PASSED"
