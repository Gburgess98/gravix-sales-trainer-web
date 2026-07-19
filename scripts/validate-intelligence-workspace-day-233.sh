#!/usr/bin/env bash
# Validates the Day 233 Intelligence Command workspace pass:
#  - /intelligence carries a page-level command band above the tabs: the two
#    moat pillars ("Teach Gravix how your company sells" / "Define what good
#    calls look like"), status chips, the safety explanation, and a four-cell
#    status strip — every status derived from the two real read endpoints;
#  - a "Scoring impact" trust panel states the five draft/publish/activation
#    facts and bridges to call-review provenance via a real route (no
#    hard-coded seed call ids);
#  - both tabs are preserved: Context keeps the Day 232 workspace and the
#    merge-base PUT rule; Scorecards keeps the Day 227-230 editor, archived
#    history and activation safeguards; replace_conflicts stays armed-only;
#  - no fake AI Builder / Autofill / scraping, no custom stages, no raw UUID
#    labels, design-system primitives throughout.
# WEB-only: no API changes, no scoring changes, no migrations.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke

set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="$WEB_ROOT/src/app/intelligence/page.tsx"
CMD="$WEB_ROOT/src/app/intelligence/IntelligenceCommand.tsx"
CTX="$WEB_ROOT/src/app/intelligence/ContextTab.tsx"
SC="$WEB_ROOT/src/app/intelligence/ScorecardsTab.tsx"
EDITOR="$WEB_ROOT/src/app/intelligence/ScorecardStudioEditor.tsx"
APILIB="$WEB_ROOT/src/lib/scorecardStudioApi.ts"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
QA="$WEB_ROOT/DEMO_VISUAL_QA_NOTES.md"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fi
  [[ "$ok" == "0" ]] || fail=1
}

code_of() { grep -vE '^[[:space:]]*(//|/\*|\*)' "$1"; }

echo "Intelligence workspace / Day 233 — command composition (own checks only)"

# --- Page composition ---------------------------------------------------------
test -f "$PAGE"; check "/intelligence route exists" $?
test -f "$CMD";  check "IntelligenceCommand component exists" $?

grep -q 'IntelligenceCommand onSelectTab={onTabChange}' "$PAGE" ||
  grep -q '<IntelligenceCommand' "$PAGE"
check "page renders the command band above the tabs" $?

grep -q '<ScoringImpactPanel' "$PAGE"
check "page renders the scoring-impact panel" $?

grep -q 'Teach Gravix how your company sells' "$CMD" &&
  grep -q 'Define what good calls look like' "$CMD"
check "hero carries both moat pillars" $?

grep -q 'Published context v' "$CMD" && grep -q 'Future scoring protected' "$CMD"
check "status chips present" $?

grep -q 'Context shapes how Gravix understands your business. Scorecards define' "$CMD"
check "safety explanation copy present" $?

grep -q 'function StripCell' "$CMD" &&
  grep -q 'label="Runtime"' "$CMD" && grep -q 'label="Safety"' "$CMD"
check "four-cell status strip present" $?

grep -q 'Already-scored calls keep their scoring history' "$CMD"
check "old-call safety copy present in the strip" $?

# --- Real data only -----------------------------------------------------------
grep -q 'proxyFetch(`/v1/intelligence/context`' "$CMD" &&
  grep -q 'proxyFetch(`/v1/intelligence/scorecards`' "$CMD"
check "command band reads the two real endpoints" $?

if code_of "$CMD" | grep -oE '/v1/[a-z/{}$`?=&.-]*' |
   grep -vE '^/v1/intelligence/(context|scorecards)' | grep -q .; then false; else true; fi
check "command band invents no endpoint" $?

if code_of "$CMD" | grep -qE 'method: "(POST|PUT|PATCH|DELETE)"'; then false; else true; fi
check "command band is read-only" $?

grep -q 'UUID_RE' "$CMD" && grep -q 'function safeName' "$CMD"
check "no raw UUID can become a visible label" $?

# --- Scoring impact panel -----------------------------------------------------
grep -q 'Draft context does not affect scoring.' "$CMD" &&
  grep -q 'Draft scorecards do not affect scoring.' "$CMD" &&
  grep -q 'Published context affects future scoring.' "$CMD" &&
  grep -q 'Active scorecards affect future scoring.' "$CMD" &&
  grep -q 'Already-scored calls keep their original scoring provenance.' "$CMD"
check "all five scoring-impact statements present" $?

grep -q 'Newly scored calls show the active context and scorecard' "$CMD"
check "provenance bridge copy present" $?

grep -q 'href="/call-library"' "$CMD"
check "provenance bridge links a real route, not a seed call id" $?

if code_of "$CMD" | grep -qE '/calls/[0-9a-f-]{36}'; then false; else true; fi
check "no hard-coded call id" $?

# --- Tabs preserved -----------------------------------------------------------
grep -q "id: \"context\", label: \"Context\"" "$PAGE" &&
  grep -q 'searchParams.set("tab", next)' "$PAGE"
check "tab declarations and ?tab= deep links unchanged" $?

grep -q 'JSON.stringify({ context: draftContext })' "$CTX" &&
  grep -q 'const MODULES: ModuleDef\[\]' "$CTX"
check "Context tab keeps the Day 232 workspace and merge-base PUT" $?

grep -q 'title="Archived history"' "$SC"
check "Scorecards archived history intact" $?

grep -q 'if (!replaceArmed) return' "$EDITOR" &&
  [ "$(grep -c 'replace_conflicts: true' "$EDITOR")" = "1" ] &&
  grep -q 'opts.replace_conflicts === true' "$APILIB"
check "replace_conflicts stays behind the armed confirmation" $?

grep -q 'function ActivateModal' "$EDITOR" && grep -q 'function WeightStrip' "$EDITOR"
check "activation confirmation and Day 229 builder intact" $?

# --- No fakery ----------------------------------------------------------------
ok=0
for f in "$PAGE" "$CMD"; do
  if code_of "$f" | grep -qiE 'autofill|auto-fill|ai builder|build with ai|generate with ai|ai assistant|scrape|crawl website'; then ok=1; fi
done
check "no fake AI Builder / Autofill / scraping" $ok

ok=0
for f in "$PAGE" "$CMD"; do
  if code_of "$f" | grep -qiE 'addStage|newStage|createStage|removeStage|custom stage'; then ok=1; fi
done
check "no custom stage UI" $ok

ok=0
for f in "$PAGE" "$CMD"; do
  if grep -qE 'fuchsia|purple-|pink-|cyan-[0-9]|emerald' "$f"; then ok=1; fi
done
check "no arcade colour introduced" $ok

grep -q 'SectionCard' "$CMD" && grep -q 'buttonClasses' "$CMD"
check "design-system primitives used" $?

# --- Documentation ------------------------------------------------------------
grep -q 'Day 233' "$AUDIT"
check "PREMIUM_UX_AUDIT.md includes the Day 233 section" $?

grep -q 'Day 233' "$QA"
check "DEMO_VISUAL_QA_NOTES.md carries the Day 233 walkthrough" $?

echo
if [[ "$fail" == "0" ]]; then
  echo "Day 233 validation PASSED"
else
  echo "Day 233 validation FAILED"
  exit 1
fi
