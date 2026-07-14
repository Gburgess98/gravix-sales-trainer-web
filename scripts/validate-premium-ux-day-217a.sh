#!/usr/bin/env bash
# Validates the Day 217A call review rubric data fix on /calls/[id]:
#  - the stage reader accepts every real rubric shape (analysis_json.stages,
#    seeded/demo rubric.stages, legacy top-level rubric keys) so seeded calls
#    like the Nate Diaz hero render the full Day 215/216 audit;
#  - the voice reader accepts seeded rubric.voice_rubric / rubric.voice_score;
#  - fallbacks stay honest: scored-but-no-stages calls get re-score copy,
#    unscored calls keep the original copy — no fake stages invented.
# WEB-only reader fix; seed data was verified complete (no reseed needed).
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CALL="$WEB_ROOT/src/app/calls/[id]/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 217A — call review rubric data QA (own checks only)"

# --- Stage reader covers all real shapes ---
grep -q 'analysis_json?.stages ?? (rubric as any)?.stages ?? rubric' "$CALL"
check "stage reader: analysis_json.stages -> rubric.stages -> legacy rubric" $?

grep -q 'rubricStages' "$CALL" && grep -q 'STAGE_LABELS' "$CALL"
check "audit still renders from the real rubric stage source only" $?

# --- Voice reader covers seeded rubric shape ---
grep -q 'callMeta?.rubric?.voice_rubric' "$CALL"
check "voice rubric reader accepts rubric.voice_rubric (seeded rows)" $?

grep -q 'callMeta?.rubric?.voice_score' "$CALL"
check "voice score reader accepts rubric.voice_score (seeded rows)" $?

# --- Honest fallbacks, no fake stages ---
grep -q 'This call has an overall score but no stage breakdown.' "$CALL"
check "scored-but-no-rubric calls get honest re-score copy" $?

grep -q 'Re-score the call to generate a full audit.' "$CALL"
check "re-score guidance present" $?

grep -q 'No scored rubric for this call yet.' "$CALL"
check "unscored calls keep the original honest empty state" $?

if grep -qE 'placeholder[sS]tage|fakeStage|mockRubric' "$CALL"; then false; else true; fi
check "no fabricated stage data in the page" $?

# --- Day 215/216 surfaces intact ---
grep -q 'Why this call scored' "$CALL" && grep -q 'Where this call lost points' "$CALL" && grep -q 'Scoring transparency' "$CALL"
check "Day 215/216 audit surfaces preserved" $?

echo
if [[ "$fail" == "0" ]]; then
  echo "Day 217A validation PASSED"
else
  echo "Day 217A validation FAILED"
  exit 1
fi
