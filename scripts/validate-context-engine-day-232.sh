#!/usr/bin/env bash
# Validates the Day 232 Context Engine premium workspace pass:
#  - the Context tab is a workspace, not a settings form: hero band ("Teach
#    Gravix how your company sells"), an eight-module rail with deterministic
#    strength labels, a one-module-at-a-time focus editor, static guidance,
#    and the compiled preview ("View as Gravix sees it") with its
#    published/draft toggle;
#  - every Day 225/226 safety stays: real context endpoints only, the PUT
#    merge-base rule (edits merge into the loaded object), publish copy that
#    promises future-scoring-only, no fake Autofill / AI assistant /
#    scraping, structured lists visible read-only, fixed section keys;
#  - strength labels derive from content, never scores, and never gate
#    saving or publishing;
#  - side-fixes: lib/api gains a real listCoachAssignments backed by
#    GET /v1/assignments/manager (and deliberately NO getTopObjections —
#    that endpoint doesn't exist); /crm/overview no longer imports phantom
#    helpers; the home route awaits searchParams (Next 15).
# WEB-only: no API changes, no scoring changes, no migrations.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke

set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CTX="$WEB_ROOT/src/app/intelligence/ContextTab.tsx"
SC="$WEB_ROOT/src/app/intelligence/ScorecardsTab.tsx"
PAGE="$WEB_ROOT/src/app/intelligence/page.tsx"
API="$WEB_ROOT/src/lib/api.ts"
OVERVIEW="$WEB_ROOT/src/app/crm/overview/page.tsx"
HOME="$WEB_ROOT/src/app/page.tsx"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
QA="$WEB_ROOT/DEMO_VISUAL_QA_NOTES.md"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fi
  [[ "$ok" == "0" ]] || fail=1
}

code_of() { grep -vE '^[[:space:]]*(//|/\*|\*)' "$1"; }

echo "Context Engine / Day 232 — premium workspace (own checks only)"

# --- Workspace structure ------------------------------------------------------
test -f "$CTX"; check "Context tab exists" $?

grep -q 'Teach Gravix how your company sells' "$CTX"
check "hero band carries the teach-Gravix framing" $?

grep -q 'const MODULES: ModuleDef\[\]' "$CTX"
check "module rail is a typed module map" $?

ok=0
for m in "Company profile" "Sales motion" "ICP & buyer" "Products & positioning" "Objections" "Competitors" "Compliance & no-go" "Tone & coaching style"; do
  grep -q "label: \"$m\"" "$CTX" || ok=1
done
check "all eight modules present" $ok

grep -q 'setActiveModule' "$CTX" && grep -q 'aria-pressed={isActive}' "$CTX"
check "focus editor shows one module at a time" $?

grep -q 'function moduleStrength' "$CTX" && grep -q '"empty" | "basic" | "strong"' "$CTX"
check "strength labels are deterministic content checks" $?

grep -q 'Not taught' "$CTX"
check "empty modules are labelled honestly" $?

grep -q 'What strong context looks like' "$CTX" &&
  grep -q 'Static guidance. Gravix never writes your context for you' "$CTX"
check "guidance panel is static and says so" $?

grep -q 'View as Gravix sees it' "$CTX" && grep -q 'compiledState' "$CTX"
check "compiled preview with published/draft toggle present" $?

# --- Real endpoints only ------------------------------------------------------
grep -q 'proxyFetch(`/v1/intelligence/context`' "$CTX" &&
  grep -q '/v1/intelligence/context/compiled?state=' "$CTX" &&
  grep -q '/v1/intelligence/context/publish' "$CTX"
check "Context tab still uses the three real context endpoints" $?

if code_of "$CTX" | grep -oE '/v1/intelligence[a-z/{}$`?=&.-]*' |
   grep -vE '^/v1/intelligence/context(/compiled\?state=|/publish)?' | grep -q .; then false; else true; fi
check "no endpoint invented outside /v1/intelligence/context*" $?

# --- PUT merge safety ---------------------------------------------------------
grep -q 'JSON.stringify({ context: draftContext })' "$CTX"
check "save PUTs the merged draft context object" $?

grep -q 'function writePath' "$CTX" && grep -q 'const next = { ...obj }' "$CTX"
check "field edits merge immutably into the loaded context" $?

grep -q 'json.published?.context ? { ...json.published.context } : {}' "$CTX"
check "a missing draft seeds from published, never from empty" $?

if grep -oE 'path: \["[a-z_]+"' "$CTX" | sed -E 's/path: \["//;s/"//' | sort -u |
   grep -vE '^(profile|offering|objections|competitors|compliance|tone)$' | grep -q .; then false; else true; fi
check "no section invented outside the API allowlist" $?

# --- Publish safety copy ------------------------------------------------------
grep -q 'affects future scoring only' "$CTX" &&
  grep -q 'nothing is re-scored' "$CTX" &&
  grep -q 'archived, never deleted' "$CTX"
check "publish copy promises future-scoring-only" $?

# --- No fakery ----------------------------------------------------------------
ok=0
if code_of "$CTX" | grep -qiE 'autofill|auto-fill|ai builder|build with ai|generate with ai|ai assistant|scrape|crawl website'; then ok=1; fi
check "no fake Autofill / AI assistant / scraping" $ok

grep -q 'Read-only for now' "$CTX"
check "structured lists visible and labelled read-only" $?

if code_of "$CTX" | grep -qE '>\{(draftRow|published)\.id\}<'; then false; else true; fi
check "no raw context id rendered as a visible label" $?

if grep -qE 'fuchsia|purple-|pink-|cyan-[0-9]' "$CTX"; then false; else true; fi
check "no arcade colour introduced" $?

grep -q 'SectionCard' "$CTX" && grep -q 'EmptyState' "$CTX" && grep -q 'animate-pulse' "$CTX"
check "design-system primitives and calm states in place" $?

# --- Scorecards tab untouched -------------------------------------------------
grep -q 'title="Archived history"' "$SC" && grep -q 'proxyFetch(`/v1/intelligence/scorecards`' "$SC"
check "Scorecards tab intact beside the new Context tab" $?

grep -q "id: \"context\", label: \"Context\"" "$PAGE"
check "tab routing unchanged" $?

# --- Side-fix A: real helper, no phantom twin ---------------------------------
grep -q 'export async function listCoachAssignments' "$API" &&
  grep -q '/v1/assignments/manager?' "$API"
check "listCoachAssignments exists and hits the real manager endpoint" $?

# Code only — the docstring explaining WHY there is no such helper may name it.
if code_of "$API" | grep -q 'getTopObjections'; then false; else true; fi
check "no phantom getTopObjections helper faked into lib/api" $?

if code_of "$OVERVIEW" | grep -q 'getTopObjections'; then false; else true; fi
check "/crm/overview no longer references the phantom helper" $?

grep -q 'listCoachAssignments' "$OVERVIEW"
check "/crm/overview still uses listCoachAssignments (now real)" $?

# --- Side-fix B: Next 15 searchParams -----------------------------------------
grep -q 'await props?.searchParams' "$HOME" && grep -q 'searchParams?: Promise' "$HOME"
check "home route awaits searchParams (Next 15)" $?

# --- Documentation ------------------------------------------------------------
grep -q 'Day 232' "$AUDIT"
check "PREMIUM_UX_AUDIT.md includes the Day 232 section" $?

grep -q 'Day 232' "$QA"
check "DEMO_VISUAL_QA_NOTES.md carries the Day 232 checklist" $?

echo
if [[ "$fail" == "0" ]]; then
  echo "Day 232 validation PASSED"
else
  echo "Day 232 validation FAILED"
  exit 1
fi
