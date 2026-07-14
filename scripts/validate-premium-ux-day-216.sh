#!/usr/bin/env bash
# Validates the Day 216 criteria-depth / scorecard-ready pass on /calls/[id]:
#  - stage audit blocks: verdict + labelled Evidence block + Coaching
#    implication derived from the real verdict thresholds;
#  - the only stage signal is the real weak_close review tag (Close stage);
#  - "Where this call lost points" breakdown (below-70 stages, weakest
#    first) mapped to existing next actions (Assign Drill handler,
#    /sparring/default practise link) — honest empty line when none;
#  - Scoring transparency panel: Gravix default fixed-stage rubric named,
#    model when present, custom scorecards mentioned ONLY as the neutral
#    future-tense line — no active custom-scorecard claim;
#  - audit still renders from the real rubric/analysis stages only;
#  - all key handlers/anchors/drawers/audio preserved.
# WEB-only, visual-only, no API changes.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CALL="$WEB_ROOT/src/app/calls/[id]/page.tsx"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
SPEC="$WEB_ROOT/SCORECARD_STUDIO_SPEC.md"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 216 — call review criteria depth (own checks only)"

# --- Stage audit blocks ---
grep -q '>Evidence<' "$CALL"
check "stage blocks carry a labelled Evidence quote block" $?

grep -q '>Coaching implication<' "$CALL" && grep -q 'stageImplication' "$CALL"
check "coaching implication line derived from verdict thresholds" $?

grep -q 'Signal observed · Weak close' "$CALL" && grep -q 'stage.key === "close" && reviewBot.weakClose' "$CALL"
check "weak_close is the only stage signal, mapped to Close from the real tag" $?

grep -q 'rubricStages' "$CALL" && grep -q 'analysis_json?.stages' "$CALL"
check "audit renders from real rubric/analysis stages (current data model)" $?

# --- Where this call lost points ---
grep -q 'Where this call lost points' "$CALL"
check "lost-points breakdown present" $?

grep -q 'priorityStages' "$CALL" && grep -q '< 70' "$CALL"
check "priorities are real below-target stages, weakest first" $?

grep -q 'Practise this stage' "$CALL" && grep -q '/sparring/default?focus=' "$CALL"
check "each priority maps to the existing practise route" $?

grep -q 'No stage fell below target on this call' "$CALL"
check "honest line when nothing scored below target" $?

# --- Scoring transparency ---
grep -q 'Scoring transparency' "$CALL"
check "scoring transparency panel present" $?

grep -q 'Gravix default rubric' "$CALL" && grep -q 'fixed set of call' "$CALL"
check "default fixed-stage rubric named honestly" $?

grep -q 'Scoring model:' "$CALL"
check "scoring model shown when available" $?

grep -q 'Custom scorecards will appear here once activated.' "$CALL"
check "future scorecards are neutral future-tense copy" $?

if grep -iE 'custom scorecard' "$CALL" | grep -viE 'will appear here once activated' | grep -q .; then false; else true; fi
check "no active custom-scorecard claim" $?

if grep -qiE 'scorecard studio|criterion weight|weighted criteri|pass/miss' "$CALL"; then false; else true; fi
check "no fake criteria-level features claimed" $?

# --- Manager guidance ---
grep -q 'Assign Coaching auto-targets the weakest stage' "$CALL"
check "next-actions strip explains Assign Coaching targeting" $?

# --- Behaviour preserved (key handlers/anchors/drawers/audio) ---
ok=0
for a in summary review transcript player pins whisperer-moments coach crm assign-form; do
  grep -q "id=\"$a\"" "$CALL" || ok=1
done
check "all section anchors preserved" $ok

grep -q 'CRM DRAWER' "$CALL" && grep -q 'COACH DRAWER' "$CALL" && grep -q '"keydown", onKey' "$CALL"
check "drawers + keyboard shortcuts preserved" $?

grep -q 'markCallReviewed' "$CALL" && grep -q 'assignCoachingFromCall' "$CALL" && grep -q 'onSaveAssign' "$CALL" && grep -q 'markMomentOutcome' "$CALL"
check "review/coaching/moment handlers preserved" $?

grep -q 'signed-audio' "$CALL" && grep -q '<audio ref={audioRef}' "$CALL"
check "audio element + signed-audio path preserved" $?

grep -q 'onCreatePin' "$CALL" && grep -q 'linkContactId' "$CALL" && grep -q 'unlink("contact")' "$CALL"
check "pins + CRM link/unlink preserved" $?

# --- Documentation ---
grep -q 'Day 216' "$AUDIT"
check "PREMIUM_UX_AUDIT.md includes the Day 216 section" $?

grep -q 'Day 216' "$SPEC"
check "SCORECARD_STUDIO_SPEC.md notes the render surface is ready" $?

echo
if [[ "$fail" == "0" ]]; then
  echo "Day 216 validation PASSED"
else
  echo "Day 216 validation FAILED"
  exit 1
fi
