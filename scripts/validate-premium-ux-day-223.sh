#!/usr/bin/env bash
# Validates the Day 223 scoring-provenance display pass on /calls/[id]:
#  - a normalising helper (src/lib/scoringProvenance.ts) is the single source
#    of the "scored with" labels — the page never reads _meta provenance raw;
#  - both branches exist: company scorecard (custom/company_default) shows the
#    scorecard name + version; everything else stays the Gravix default rubric;
#  - published context is claimed ONLY when context_version is present;
#  - UUID-shaped/missing scorecard names never reach a visible label;
#  - old calls with no provenance still read calmly as the default rubric;
#  - full identifiers appear only in hover titles, never as prominent labels;
#  - all key Day 215/216 handlers/anchors/drawers/audio preserved.
# WEB-only, display-only, no API/scoring changes.
# Behavioural fixtures for the helper itself:
#   node scripts/validate-scoring-provenance-day-223.mts (run below)
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CALL="$WEB_ROOT/src/app/calls/[id]/page.tsx"
HELPER="$WEB_ROOT/src/lib/scoringProvenance.ts"
FIXTURES="$WEB_ROOT/scripts/validate-scoring-provenance-day-223.mts"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
QA="$WEB_ROOT/DEMO_VISUAL_QA_NOTES.md"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 223 — call review scoring provenance (own checks only)"

# --- Helper exists and is the single normaliser -----------------------------
test -f "$HELPER"
check "provenance helper module exists" $?

grep -q 'export function getScoringProvenance' "$HELPER"
check "helper exports getScoringProvenance" $?

ok=0
for f in scorecardLabel scorecardSourceLabel contextLabel modelLabel hasCustomScorecard hasCompanyContext detailTitle; do
  grep -q "$f" "$HELPER" || ok=1
done
check "helper returns the normalised provenance shape" $ok

grep -q 'getScoringProvenance' "$CALL" && grep -q 'const provenance' "$CALL"
check "call review page consumes the helper" $?

# The page must not hand-roll provenance reads — the helper owns _meta.
if grep -E '_meta\??\.(scorecard_|context_|scoring_model_)' "$CALL" | grep -q .; then false; else true; fi
check "page never reads _meta provenance fields directly" $?

# --- Source branches --------------------------------------------------------
grep -q '"custom"' "$HELPER" && grep -q '"company_default"' "$HELPER"
check "helper branches on the company scorecard sources" $?

grep -q 'GRAVIX_DEFAULT_RUBRIC_LABEL' "$HELPER"
check "helper has a named Gravix default label" $?

grep -q 'provenance.hasCustomScorecard' "$CALL"
check "page branches on whether a company scorecard was used" $?

grep -q 'Scored with the Gravix default rubric' "$CALL"
check "default-path hero line preserved verbatim (Day 215 contract)" $?

grep -q 'Scored with ${provenance.scorecardLabel}' "$CALL"
check "company-scorecard hero line uses the normalised label" $?

# --- Context claims ---------------------------------------------------------
grep -q 'context_version' "$HELPER" && grep -q 'Company context v' "$HELPER"
check "context label derived from context_version" $?

grep -q 'provenance.contextLabel' "$CALL"
check "page renders the context label from provenance" $?

# The context claim must be conditional — never unconditional copy.
if grep -qE '^\s*(<p|<span|<dd)[^>]*>\s*Company context v[0-9N]+ applied' "$CALL"; then false; else true; fi
check "no hard-coded context-applied claim in the page" $?

grep -q 'Not applied' "$CALL"
check "absent context reads as 'Not applied', never as applied" $?

# --- Raw identifier safety --------------------------------------------------
grep -q 'UUID_RE' "$HELPER" && grep -q 'displayableName' "$HELPER"
check "helper rejects UUID-shaped scorecard names" $?

grep -q 'UNNAMED_COMPANY_SCORECARD_LABEL' "$HELPER"
check "helper has a safe fallback label for unnameable scorecards" $?

grep -q 'detailTitle' "$CALL" && grep -q 'title={provenance.detailTitle' "$CALL"
check "full identifiers confined to hover titles" $?

# --- Honesty: no fake activated-scorecard copy ------------------------------
grep -q 'Custom scorecards will appear here once activated.' "$CALL"
check "neutral future-tense line retained for the no-scorecard state" $?

grep -q '!provenance.hasCustomScorecard && (' "$CALL"
check "future-tense line shown ONLY when no scorecard was used" $?

if grep -iE 'custom scorecard' "$CALL" | grep -viE 'will appear here once activated' | grep -q .; then false; else true; fi
check "no unconditional custom-scorecard claim (Day 216 contract)" $?

if grep -qiE 'scorecard studio|criterion weight|weighted criteri|pass/miss' "$CALL"; then false; else true; fi
check "no fake criteria-level features claimed" $?

# --- Transparency panel rows ------------------------------------------------
grep -q 'Scoring transparency' "$CALL"
check "scoring transparency panel present" $?

grep -q '>Rubric used<' "$CALL" && grep -q '>Scorecard source<' "$CALL" && grep -q '>Company context<' "$CALL"
check "panel shows rubric used / scorecard source / context status" $?

grep -q 'Scoring model:' "$CALL"
check "scoring model shown when available" $?

grep -q 'Gravix default rubric' "$CALL" && grep -q 'fixed set of call' "$CALL"
check "default fixed-stage rubric still named honestly (Day 216 contract)" $?

# --- Behavioural fixtures ---------------------------------------------------
test -f "$FIXTURES"
check "helper fixture suite exists" $?

node "$FIXTURES" > /dev/null 2>&1
check "helper fixtures pass (old meta / default / company / context / UUID)" $?

# --- Behaviour preserved (key handlers/anchors/drawers/audio) ---------------
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

grep -q 'rubricStages' "$CALL" && grep -q 'analysis_json?.stages' "$CALL"
check "audit still renders from the real rubric/analysis stages" $?

if grep -qE 'fuchsia|purple|pink-|cyan' "$CALL"; then false; else true; fi
check "no arcade colour reintroduced" $?

# --- Documentation ----------------------------------------------------------
grep -q 'Day 223' "$AUDIT"
check "PREMIUM_UX_AUDIT.md includes the Day 223 section" $?

grep -q 'Day 223' "$QA"
check "DEMO_VISUAL_QA_NOTES.md notes the new runtime metadata surface" $?

echo
if [[ "$fail" == "0" ]]; then
  echo "Day 223 validation PASSED"
else
  echo "Day 223 validation FAILED"
  exit 1
fi
