#!/usr/bin/env bash
# Validates the Day 227 Scorecard Studio editor MVP:
#  - the editor exists and is wired from the Scorecards tab (create button +
#    per-card workbench), while ScorecardsTab.tsx itself STAYS read-only —
#    the Day 225/226 boundary (no mutating request, no editor fields, no
#    lifecycle endpoint in that file) is re-asserted here, not weakened;
#  - every mutating request lives in src/lib/scorecardStudioApi.ts and goes
#    through proxyFetch: create, draft metadata PUT, draft version PUT, fork,
#    activate, archive — the real Day 219B/220 endpoints, nothing invented;
#  - activation is never silent: a confirmation modal gates the first POST,
#    replace_conflicts is NEVER sent on a first attempt, and after a 409 it
#    is only sent once a second, explicit confirmation is armed;
#  - the fixed four-stage frame is preserved (no custom/arbitrary stages) and
#    the criteria editor carries the full detail field set;
#  - immutable versions are never edited — the editor only PUTs the draft,
#    and locked versions get a fork ("Create editable draft") path instead;
#  - archive renders only for never-active scorecards and requires its own
#    confirmation; nothing is deleted;
#  - no AI Builder / Autofill / template fakery, no raw UUID labels, no
#    arcade colour.
# WEB-only: no API changes, no scoring-runtime changes, no migrations.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke

set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="$WEB_ROOT/src/app/intelligence/page.tsx"
SC="$WEB_ROOT/src/app/intelligence/ScorecardsTab.tsx"
EDITOR="$WEB_ROOT/src/app/intelligence/ScorecardStudioEditor.tsx"
APILIB="$WEB_ROOT/src/lib/scorecardStudioApi.ts"
HELPER="$WEB_ROOT/src/lib/scorecardReadiness.ts"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
QA="$WEB_ROOT/DEMO_VISUAL_QA_NOTES.md"
SPEC="$WEB_ROOT/SCORECARD_STUDIO_SPEC.md"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fi
  [[ "$ok" == "0" ]] || fail=1
}

# Code only — strips `//` line comments AND `/* … */` block-comment lines, so
# honest comments about what is deliberately NOT built can't trip the greps.
code_of() { grep -vE '^[[:space:]]*(//|/\*|\*)' "$1"; }

echo "Premium UX / Day 227 — Scorecard Studio editor MVP (own checks only)"

# --- Surfaces exist ----------------------------------------------------------
test -f "$PAGE";   check "/intelligence route still exists" $?
test -f "$SC";     check "Scorecards tab still exists" $?
test -f "$EDITOR"; check "Scorecard Studio editor component exists" $?
test -f "$APILIB"; check "scorecard studio mutation client exists" $?

grep -q "id: \"context\", label: \"Context\"" "$PAGE" &&
  grep -q "id: \"scorecards\", label: \"Scorecards\"" "$PAGE"
check "Context and Scorecards tabs preserved" $?

# --- Editor is wired from the tab -------------------------------------------
grep -q 'NewScorecardPanel' "$SC" && grep -q 'ScorecardWorkbench' "$SC"
check "Scorecards tab renders the create action + per-card workbench" $?

grep -q 'from "./ScorecardStudioEditor"' "$SC"
check "the tab imports the editor rather than inlining it" $?

# --- The Day 225/226 read-only boundary still holds in the tab ---------------
if code_of "$SC" | grep -qE 'method: "(POST|PUT|PATCH|DELETE)"'; then false; else true; fi
check "ScorecardsTab still issues no mutating request" $?

if code_of "$SC" | grep -qE '/activate|/archive|/fork|/versions/'; then false; else true; fi
check "ScorecardsTab still wires no lifecycle endpoint" $?

if code_of "$SC" | grep -qE 'addCriterion|newCriterion|editCriterion|<textarea|<input'; then false; else true; fi
check "ScorecardsTab still renders no editor fields" $?

# --- Real endpoints, all via proxyFetch --------------------------------------
grep -q 'import { proxyFetch } from "@/lib/api"' "$APILIB"
check "mutation client goes through proxyFetch" $?

if code_of "$APILIB" | grep -qE 'fetch\("http|fetch\(`http|NEXT_PUBLIC_API|localhost:'; then false; else true; fi
check "no direct-backend calls in the mutation client" $?

grep -q 'export function createScorecard' "$APILIB" &&
  code_of "$APILIB" | grep -q '`/v1/intelligence/scorecards`'
check "create scorecard endpoint wired (POST /v1/intelligence/scorecards)" $?

grep -q 'export function updateScorecardMeta' "$APILIB" &&
  code_of "$APILIB" | grep -q '`/v1/intelligence/scorecards/${scorecardId}`'
check "draft metadata save wired (PUT /:id)" $?

grep -q 'export function saveDraftVersion' "$APILIB" &&
  code_of "$APILIB" | grep -q '/versions/${versionId}`'
check "draft version save wired (PUT /:id/versions/:versionId)" $?

grep -q 'export function forkVersion' "$APILIB" &&
  code_of "$APILIB" | grep -q '/versions/${versionId}/fork`'
check "fork endpoint wired (POST …/fork)" $?

grep -q 'export function activateScorecard' "$APILIB" &&
  code_of "$APILIB" | grep -q '/activate`'
check "activate endpoint wired (POST /:id/activate)" $?

grep -q 'export function archiveScorecard' "$APILIB" &&
  code_of "$APILIB" | grep -q '/archive`'
check "archive endpoint wired (POST /:id/archive)" $?

if code_of "$APILIB" | grep -oE '/v1/[a-z${}/`_.-]*' | grep -vE '^/v1/intelligence/scorecards' | grep -q .; then false; else true; fi
check "mutation client touches only /v1/intelligence/scorecards endpoints" $?

# --- Activation is confirmed, replacement is doubly confirmed ----------------
grep -q 'function ActivateModal' "$EDITOR"
check "activation goes through a confirmation modal" $?

grep -q 'setShowActivate(true)' "$EDITOR" &&
  if code_of "$EDITOR" | grep -qE 'onClick=\{\(\) => void activateScorecard'; then false; else true; fi
check "no button calls activate directly — the modal is the only path" $?

grep -q 'activateScorecard(card.id, { activation_note: note })' "$EDITOR"
check "first activation attempt never carries replace_conflicts" $?

grep -q 'if (!replaceArmed) return' "$EDITOR"
check "replace path is dead until the second confirmation is armed" $?

[ "$(grep -c 'replace_conflicts: true' "$EDITOR")" = "1" ]
check "replace_conflicts: true appears exactly once (the armed path)" $?

grep -q 'res.status === 409 && res.conflicts' "$EDITOR"
check "conflicts come from the API 409, not assumed locally" $?

grep -q 'opts.replace_conflicts === true' "$APILIB"
check "mutation client never defaults replace_conflicts" $?

grep -q 'future scoring only' "$EDITOR"
check "activation copy states scoring is future-only" $?

grep -q 'locked so old call reviews stay explainable' "$EDITOR"
check "activation copy explains why versions lock" $?

# --- Immutable versions are never edited -------------------------------------
grep -q 'versions.find((v) => v.status === "draft")' "$EDITOR"
check "the editor only opens for the draft version" $?

grep -q 'saveDraftVersion(card.id, draft.id, state)' "$EDITOR"
check "the version PUT only ever targets the draft id" $?

grep -q 'Create editable draft' "$EDITOR" && grep -q 'forkVersion(card.id, locked.id)' "$EDITOR"
check "locked versions offer fork, not editing" $?

grep -q 'draft_already_exists' "$EDITOR"
check "an existing draft is surfaced, never silently replaced" $?

# --- Fixed stages only --------------------------------------------------------
grep -q 'SCORECARD_STAGES' "$EDITOR" && grep -q 'from "@/lib/scorecardReadiness"' "$EDITOR"
check "the editor iterates the pinned fixed stage set" $?

ok=0
for f in "$EDITOR" "$APILIB"; do
  if code_of "$f" | grep -qiE 'addStage|newStage|createStage|removeStage|custom stage'; then ok=1; fi
done
check "no custom/arbitrary stage editor" $ok

grep -q '"intro", "discovery", "objection", "close"' "$HELPER"
check "helper still pins intro/discovery/objection/close" $?

# --- Criteria depth (the moat) ------------------------------------------------
ok=0
for field in label description scoring_guidance good_example weak_example coaching_prompt pass_fail critical emphasis; do
  grep -q "$field" "$APILIB" || ok=1
done
check "criteria carry the full detail field set" $ok

grep -q 'sort_order is the array position' "$APILIB" && grep -q 'moveCriterion' "$EDITOR"
check "criteria order is editable and serialised as sort order" $?

grep -q "CRITERION_EMPHASIS = \[\"minor\", \"standard\", \"major\"\]" "$APILIB"
check "emphasis is the fixed minor/standard/major set, not numeric weights" $?

grep -q 'patch.pass_fail === false ? { ...patch, critical: false }' "$EDITOR"
check "turning pass/fail off clears critical (API rule mirrored)" $?

grep -q 'MAX_CRITERIA_PER_STAGE' "$EDITOR" && grep -q 'MAX_CRITERIA_PER_STAGE = 12' "$APILIB"
check "the 12-criteria stage cap is enforced in the editor" $?

grep -q 'Weights total' "$EDITOR" && grep -q 'must be 100% to activate (saving is fine)' "$EDITOR"
check "invalid weights are saveable, with the activation blocker explained" $?

grep -q 'computeReadiness' "$EDITOR" &&
  if code_of "$EDITOR" | grep -qE 'total !== 100 \|\| criteriaCount === 0'; then false; else true; fi
check "activation readiness comes from the shared helper, not re-implemented" $?

# --- Archive discipline --------------------------------------------------------
grep -q 'card.status === "draft" && (' "$EDITOR" && grep -q 'function ArchiveModal' "$EDITOR"
check "archive renders only for never-active scorecards, behind a confirm" $?

grep -q 'deleted — every version and its history survive' "$EDITOR"
check "archive copy states nothing is deleted" $?

# --- No fakery -----------------------------------------------------------------
ok=0
for f in "$EDITOR" "$APILIB"; do
  if code_of "$f" | grep -qiE 'autofill|auto-fill|ai builder|build with ai|generate with ai|ai generated|scrape|crawl website|template gallery'; then ok=1; fi
done
check "no AI Builder / Autofill / scraping / template fakery" $ok

ok=0
for f in "$EDITOR" "$APILIB"; do
  if code_of "$f" | grep -qiE 'coming soon|placeholder button|not yet available</'; then ok=1; fi
done
check "no 'coming soon' stub controls" $ok

# --- Raw identifier safety -------------------------------------------------------
grep -q 'UUID_RE' "$EDITOR" && grep -q 'function safeName' "$EDITOR"
check "editor labels reject UUID-shaped names" $?

if code_of "$EDITOR" | grep -qE '>\{(card|draft|c|conflict)\.(id|version_id|scorecard_id)\}<'; then false; else true; fi
check "no raw id rendered as a visible label" $?

grep -q 'nameFor(c.scorecard_id)' "$EDITOR"
check "conflict rows resolve scorecard names, never show ids" $?

# --- Colour discipline ------------------------------------------------------------
ok=0
for f in "$EDITOR" "$APILIB"; do
  if grep -qE 'fuchsia|purple-|pink-|cyan-[0-9]|emerald' "$f"; then ok=1; fi
done
check "no arcade colour in the new surfaces" $ok

# --- Documentation ------------------------------------------------------------------
grep -q 'Day 227' "$AUDIT"
check "PREMIUM_UX_AUDIT.md includes the Day 227 section" $?

grep -q 'Day 227' "$QA"
check "DEMO_VISUAL_QA_NOTES.md carries the Scorecard Studio editor checklist" $?

grep -q 'Day 227' "$SPEC"
check "SCORECARD_STUDIO_SPEC.md records the editor implementation status" $?

echo
if [[ "$fail" == "0" ]]; then
  echo "Day 227 validation PASSED"
else
  echo "Day 227 validation FAILED"
  exit 1
fi
