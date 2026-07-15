#!/usr/bin/env bash
# Validates the Day 226 Intelligence scorecard workspace pass:
#  - /intelligence and both tabs still exist and still use the real APIs;
#  - the readiness panel is a faithful mirror of the API's activation gate
#    (src/lib/scorecardReadiness.ts is the single source; fixtures pin each
#    check to the API error code it mirrors);
#  - readiness is DISPLAY ONLY — no POST /activate, and crucially no
#    replace_conflicts is ever sent, so nothing can be superseded silently;
#  - readiness is computed for the DRAFT version (what /activate targets),
#    never for the version on screen;
#  - the active version reads as read-only status, not a control;
#  - context publish copy states that scoring is future-only (the API never
#    re-scores on publish);
#  - no fake Autofill/AI Builder/editor, no arbitrary stages, no raw UUIDs;
#  - Day 225 behaviour and the surrounding nav/routes are preserved.
# WEB-only: no API changes, no scoring changes, no migrations.
# Behavioural fixtures for the helper:
#   node scripts/validate-scorecard-readiness-day-226.mts (run below)
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="$WEB_ROOT/src/app/intelligence/page.tsx"
CTX="$WEB_ROOT/src/app/intelligence/ContextTab.tsx"
SC="$WEB_ROOT/src/app/intelligence/ScorecardsTab.tsx"
HELPER="$WEB_ROOT/src/lib/scorecardReadiness.ts"
FIXTURES="$WEB_ROOT/scripts/validate-scorecard-readiness-day-226.mts"
NAV="$WEB_ROOT/src/config/navigation.ts"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
QA="$WEB_ROOT/DEMO_VISUAL_QA_NOTES.md"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fi
  [[ "$ok" == "0" ]] || fail=1
}

# Code only — strips `//` line comments AND `/* … */` block-comment lines, so the
# honest comments describing what was deliberately NOT built (which necessarily
# name /activate, replace_conflicts, AI Builder…) can't trip the greps below.
code_of() { grep -vE '^[[:space:]]*(//|/\*|\*)' "$1"; }

echo "Premium UX / Day 226 — intelligence scorecard workspace (own checks only)"

# --- Route + tabs still intact ---------------------------------------------
test -f "$PAGE"; check "/intelligence route still exists" $?
test -f "$CTX";  check "Context tab still exists" $?
test -f "$SC";   check "Scorecards tab still exists" $?

grep -q "id: \"context\", label: \"Context\"" "$PAGE" &&
  grep -q "id: \"scorecards\", label: \"Scorecards\"" "$PAGE"
check "Context and Scorecards tabs preserved" $?

# --- Real APIs still used ---------------------------------------------------
grep -q 'proxyFetch(`/v1/intelligence/context`' "$CTX"
check "Context tab still reads /v1/intelligence/context" $?

grep -q '/v1/intelligence/context/compiled?state=' "$CTX" &&
  grep -q '/v1/intelligence/context/publish' "$CTX"
check "Context compiled + publish endpoints preserved" $?

grep -q 'proxyFetch(`/v1/intelligence/scorecards`' "$SC" &&
  grep -q 'proxyFetch(`/v1/intelligence/scorecards/${id}`' "$SC"
check "Scorecards tab still reads the scorecard list + detail" $?

ok=0
for f in "$CTX" "$SC" "$PAGE"; do
  if code_of "$f" | grep -qE 'fetch\("http|fetch\(`http|NEXT_PUBLIC_API|localhost:'; then ok=1; fi
done
check "no direct-backend calls — everything still via proxyFetch" $ok

# --- Readiness helper is the single source ---------------------------------
test -f "$HELPER"
check "readiness helper module exists" $?

grep -q 'export function computeReadiness' "$HELPER" &&
  grep -q 'export function previewConflicts' "$HELPER"
check "helper exports computeReadiness + previewConflicts" $?

grep -q 'computeReadiness' "$SC" && grep -q 'previewConflicts' "$SC"
check "Scorecards tab consumes the helper" $?

# Each check id must equal the API error code it mirrors — that equality is the
# whole basis for the panel being honest.
ok=0
for code in missing_stage_weights weights_must_total_100 at_least_one_criterion_required call_type_or_company_default_required; do
  grep -q "$code" "$HELPER" || ok=1
done
check "every readiness check mirrors an API activation error code" $ok

# The tab must not hand-roll the rules — the helper owns them.
if code_of "$SC" | grep -qE 'weight.*=== 100|total !== 100|reduce\(.*weight.*\) === 100'; then false; else true; fi
check "Scorecards tab never re-implements the activation rules" $?

test -f "$FIXTURES"
check "readiness fixture suite exists" $?

node "$FIXTURES" > /dev/null 2>&1
check "readiness fixtures pass (UFC shape / each rule / conflicts)" $?

# --- Display only: NO activation mutation ----------------------------------
if code_of "$SC" | grep -qE 'method: "(POST|PUT|PATCH|DELETE)"'; then false; else true; fi
check "Scorecards tab still issues no mutating request" $?

if code_of "$SC" | grep -qE '/activate|/archive|/fork|/versions/'; then false; else true; fi
check "no activate/archive/fork endpoint wired" $?

# The single most dangerous flag in the whole API — it supersedes live scoring
# rules. It must appear nowhere outside explanatory comments.
ok=0
for f in "$SC" "$CTX" "$PAGE" "$HELPER"; do
  if code_of "$f" | grep -q 'replace_conflicts'; then ok=1; fi
done
check "replace_conflicts is never sent (no silent replacement)" $ok

grep -q 'nothing is activated' "$SC"
check "readiness panel states nothing is activated from this page" $?

# --- Readiness targets the DRAFT version -----------------------------------
grep -q 'versions.find((v) => v.status === "draft")' "$SC"
check "readiness is computed for the draft version /activate targets" $?

grep -q '{draft && <ReadinessPanel' "$SC"
check "readiness panel only renders when a draft version exists" $?

grep -q 'isCompanyDefault: card.is_company_default' "$SC"
check "readiness uses the card's real company-default flag" $?

# --- Active version is status, not a control -------------------------------
grep -q 'Currently active — this version scores new calls.' "$SC"
check "active version reads as a read-only status" $?

grep -q "Already-scored calls keep the score they were given" "$SC"
check "active panel is honest that past scores are untouched" $?

if code_of "$SC" | grep -qE '<button[^>]*>[[:space:]]*(Activate|Make active|Set as default)'; then false; else true; fi
check "no activation button rendered" $?

# --- Detail UX --------------------------------------------------------------
grep -q 'Stage weights' "$SC" && grep -q 'Totals ' "$SC"
check "stage weight breakdown shows a total" $?

grep -q 'Criteria' "$SC" && grep -q 'across ' "$SC"
check "criteria list shows a count summary" $?

grep -q 'EMPHASIS_LABELS' "$SC" && grep -q 'Critical' "$SC" && grep -q 'Pass / fail' "$SC"
check "criteria surface emphasis / critical / pass-fail" $?

grep -q 'No company scorecards yet' "$SC" && grep -q 'Scorecard Studio editor' "$SC"
check "empty state explains what a company scorecard would give you" $?

grep -q "part of the product" "$SC" && grep -q 'takes precedence over it' "$SC"
check "Gravix Default read-only explanation is clearer" $?

# --- Context tab behaviour preserved (Day 225 contract) --------------------
grep -q 'JSON.stringify({ context: draftContext })' "$CTX"
check "context save still PUTs the merged draft object" $?

grep -q 'function writePath' "$CTX"
check "context field merge helper preserved" $?

grep -q 'json.published?.context ? { ...json.published.context } : {}' "$CTX"
check "missing draft still seeds from published" $?

grep -q 'affects future scoring only' "$CTX"
check "publish copy states scoring is future-only" $?

grep -q 'nothing is re-scored' "$CTX"
check "publish copy states nothing is re-scored" $?

grep -q 'archived, never deleted' "$CTX"
check "publish copy still states the previous version is archived" $?

grep -q 'Context teaches Gravix your business' "$CTX"
check "Context product copy preserved" $?

# --- No fake controls -------------------------------------------------------
ok=0
for f in "$PAGE" "$CTX" "$SC"; do
  if code_of "$f" | grep -qiE 'autofill|auto-fill|ai builder|build with ai|generate with ai|scrape|crawl website'; then ok=1; fi
done
check "no AI Autofill / AI Builder / website scraping controls" $ok

ok=0
for f in "$PAGE" "$CTX" "$SC"; do
  if code_of "$f" | grep -qiE 'coming soon|placeholder button'; then ok=1; fi
done
check "no 'coming soon' stub controls" $ok

ok=0
for f in "$PAGE" "$CTX" "$SC"; do
  if code_of "$f" | grep -qiE 'objection library|playbook library'; then ok=1; fi
done
check "no Objection/Playbook library surfaces" $ok

# --- No arbitrary stages ----------------------------------------------------
grep -q 'SCORECARD_STAGES' "$HELPER" &&
  grep -q '"intro", "discovery", "objection", "close"' "$HELPER"
check "helper pins the fixed API stage set" $?

if code_of "$SC" | grep -qiE 'addStage|newStage|createStage|removeStage|custom stage'; then false; else true; fi
check "no custom stage editor" $?

if code_of "$SC" | grep -qiE 'addCriterion|newCriterion|editCriterion|<textarea|<input'; then false; else true; fi
check "no scorecard editor fields (still read-only)" $?

# --- Raw identifier safety --------------------------------------------------
grep -q 'UUID_RE' "$SC" && grep -q 'function scorecardLabel' "$SC"
check "scorecard labels still reject UUID-shaped names" $?

if code_of "$SC" | grep -qE '>\{(card|version|draft)\.id\}<'; then false; else true; fi
check "no raw id rendered as a visible label" $?

# Conflicts must name scorecards, never ids.
grep -q 'scorecardName: string' "$HELPER"
check "conflict preview carries a name, not just an id" $?

if code_of "$SC" | grep -qE '\{c\.scorecard_id\}|\{conflict.version_id\}'; then false; else true; fi
check "conflict rows never surface raw ids" $?

# --- Colour discipline ------------------------------------------------------
ok=0
for f in "$PAGE" "$CTX" "$SC" "$HELPER"; do
  if grep -qE 'fuchsia|purple-|pink-|cyan-[0-9]' "$f"; then ok=1; fi
done
check "no arcade colour reintroduced" $ok

# --- Nav / surrounding routes preserved ------------------------------------
grep -q "{ label: 'Intelligence', href: '/intelligence', icon: Sparkles, roles: \['manager'\] }" "$NAV"
check "Intelligence nav entry preserved" $?

grep -q "'/intelligence'," "$NAV"
check "/intelligence still in SHELL_PATHS" $?

grep -q "{ label: 'Analytics', href: '/crm/analytics', icon: BarChart2, roles: \['manager'\] }" "$NAV"
check "Analytics entry unchanged" $?

grep -q "{ label: 'Team', href: '/team', icon: Users2, roles: \['manager'\] }" "$NAV"
check "Team entry unchanged" $?

ok=0
for p in '/dashboard' '/call-library' '/calls' '/crm' '/assignments' '/admin' '/upload' '/coaching' '/settings' '/team'; do
  grep -q "'$p'," "$NAV" || ok=1
done
check "every pre-existing SHELL_PATHS entry preserved" $ok

# --- Documentation ----------------------------------------------------------
grep -q 'Day 226' "$AUDIT"
check "PREMIUM_UX_AUDIT.md includes the Day 226 section" $?

grep -q 'Day 226' "$QA"
check "DEMO_VISUAL_QA_NOTES.md records the authenticated QA result" $?

echo
if [[ "$fail" == "0" ]]; then
  echo "Day 226 validation PASSED"
else
  echo "Day 226 validation FAILED"
  exit 1
fi
