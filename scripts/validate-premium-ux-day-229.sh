#!/usr/bin/env bash
# Validates the Day 229 Scorecard Studio builder UX pass:
#  - the editor reads as a builder, not a long developer form: a weight
#    distribution strip, a stage rail carrying weight/criteria/critical
#    counts and an empty-stage hint, chip toggles for call types, compact
#    criteria rows with a content preview that expand into the full detail,
#    and label autofocus on a freshly added criterion;
#  - the fixed four-stage scope is stated in visible UI copy, not just
#    comments;
#  - every Day 227/228 safeguard is re-asserted unchanged: real endpoints
#    only, draft-only editing, fork for locked versions, confirmed
#    activation, replace_conflicts never automatic, archive only for
#    never-active cards, no AI Builder / Autofill / custom stages;
#  - saving with an invalid weight total stays allowed, with the activation
#    requirement spelled out.
# WEB-only: no API changes, no scoring changes, no data-model changes.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke

set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EDITOR="$WEB_ROOT/src/app/intelligence/ScorecardStudioEditor.tsx"
APILIB="$WEB_ROOT/src/lib/scorecardStudioApi.ts"
SC="$WEB_ROOT/src/app/intelligence/ScorecardsTab.tsx"
HELPER="$WEB_ROOT/src/lib/scorecardReadiness.ts"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
QA="$WEB_ROOT/DEMO_VISUAL_QA_NOTES.md"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fi
  [[ "$ok" == "0" ]] || fail=1
}

code_of() { grep -vE '^[[:space:]]*(//|/\*|\*)' "$1"; }

echo "Premium UX / Day 229 — scorecard builder UX (own checks only)"

# --- Builder surfaces --------------------------------------------------------
test -f "$EDITOR"; check "Scorecard Studio editor exists" $?

grep -q 'function WeightStrip' "$EDITOR" && grep -q '<WeightStrip state={state} selected={stage}' "$EDITOR"
check "weight distribution strip exists and is rendered" $?

grep -q 'STAGE_SEGMENT_TINT' "$EDITOR"
check "strip segments and rail dots share one stage tint scale" $?

grep -q 'Weights total' "$EDITOR" && grep -q 'must be 100% to activate (saving is fine)' "$EDITOR"
check "total is shown with saving-allowed / activation-requires-100 copy" $?

grep -q 'criticalCount' "$EDITOR" && grep -q '· {criticalCount} critical' "$EDITOR"
check "stage rail surfaces the critical-criteria count" $?

grep -q 'No criteria yet' "$EDITOR"
check "empty stages carry a readiness hint in the rail" $?

grep -q 'function toggleChipClass' "$EDITOR" && grep -q 'aria-pressed={on}' "$EDITOR"
check "call types are chip toggles, not a checkbox wall" $?

# --- Compact rows / expanded detail ------------------------------------------
grep -q 'function CriterionRow' "$EDITOR" && grep -q 'aria-expanded={expanded}' "$EDITOR"
check "criteria render as rows with an expand toggle" $?

grep -q 'line-clamp-1' "$EDITOR" && grep -q '!expanded && (c.description.trim() || c.scoring_guidance.trim())' "$EDITOR"
check "collapsed rows show a one-line content preview" $?

grep -q 'autoFocus={!c.label}' "$EDITOR"
check "a new criterion opens with its label focused" $?

grep -q '{expanded && (' "$EDITOR"
check "full fields live in the expanded detail area" $?

ok=0
for field in scoring_guidance good_example weak_example coaching_prompt pass_fail critical emphasis; do
  grep -q "$field" "$EDITOR" || ok=1
done
check "expanded detail still carries the full criteria field set" $ok

# --- Fixed stages, stated honestly -------------------------------------------
grep -q 'four core sales stages' "$EDITOR"
check "fixed-stage scope is visible UI copy, not just a comment" $?

grep -q 'SCORECARD_STAGES' "$EDITOR" && grep -q 'from "@/lib/scorecardReadiness"' "$EDITOR"
check "the editor still iterates the pinned fixed stage set" $?

ok=0
for f in "$EDITOR" "$APILIB"; do
  if code_of "$f" | grep -qiE 'addStage|newStage|createStage|removeStage|custom stage'; then ok=1; fi
done
check "no custom/arbitrary stage editor" $ok

# --- Day 227/228 safeguards unchanged -----------------------------------------
grep -q 'export function createScorecard' "$APILIB" &&
  grep -q 'export function saveDraftVersion' "$APILIB" &&
  grep -q 'export function forkVersion' "$APILIB" &&
  grep -q 'export function activateScorecard' "$APILIB"
check "real Day 219B/220 endpoints only — mutation client unchanged" $?

grep -q 'function ActivateModal' "$EDITOR" && grep -q 'setShowActivate(true)' "$EDITOR"
check "activation still opens the confirmation modal" $?

grep -q 'activateScorecard(card.id, { activation_note: note })' "$EDITOR" &&
  grep -q 'if (!replaceArmed) return' "$EDITOR" &&
  [ "$(grep -c 'replace_conflicts: true' "$EDITOR")" = "1" ]
check "replace_conflicts still gated behind the armed second confirmation" $?

grep -q 'opts.replace_conflicts === true' "$APILIB"
check "mutation client still never defaults replace_conflicts" $?

grep -q 'saveDraftVersion(card.id, draft.id, state)' "$EDITOR" &&
  grep -q 'Create editable draft' "$EDITOR"
check "draft-only editing and the fork path preserved" $?

grep -q 'patch.pass_fail === false ? { ...patch, critical: false }' "$EDITOR"
check "critical-requires-pass/fail rule still mirrored" $?

grep -q 'card.status === "draft" && (' "$EDITOR" && grep -q 'function ArchiveModal' "$EDITOR"
check "archive still only for never-active cards, behind confirmation" $?

grep -q 'computeReadiness' "$EDITOR" &&
  if code_of "$EDITOR" | grep -qE 'total !== 100 \|\| criteriaCount === 0'; then false; else true; fi
check "readiness still comes from the shared Day 226 helper" $?

grep -q 'sm:grid-cols-2' "$SC" && grep -q 'readiness.checks.map' "$SC"
check "readiness checks scan as a grid" $?

# --- Honest copy ---------------------------------------------------------------
grep -q 'Draft changes do not affect scoring until activated' "$EDITOR" ||
  grep -q 'do not affect scoring until activated' "$EDITOR"
check "draft-changes-don't-score copy present" $?

grep -q 'locked so old call reviews stay explainable' "$EDITOR"
check "version-locking rationale present" $?

ok=0
for f in "$EDITOR" "$APILIB"; do
  if code_of "$f" | grep -qiE 'autofill|auto-fill|ai builder|build with ai|generate with ai|ai generated|template gallery'; then ok=1; fi
done
check "no AI Builder / Autofill / generation fakery" $ok

ok=0
for f in "$EDITOR" "$APILIB"; do
  if grep -qE 'fuchsia|purple-|pink-|cyan-[0-9]|emerald' "$f"; then ok=1; fi
done
check "no arcade colour introduced" $ok

# --- Documentation ---------------------------------------------------------------
grep -q 'Day 229' "$AUDIT"
check "PREMIUM_UX_AUDIT.md includes the Day 229 section" $?

grep -q 'Day 229' "$QA"
check "DEMO_VISUAL_QA_NOTES.md carries the Day 229 checklist" $?

echo
if [[ "$fail" == "0" ]]; then
  echo "Day 229 validation PASSED"
else
  echo "Day 229 validation FAILED"
  exit 1
fi
