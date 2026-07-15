#!/usr/bin/env bash
# Validates the Day 225 Intelligence workspace MVP (/intelligence):
#  - the route exists as a shell page with Context + Scorecards tabs only;
#  - every read goes through proxyFetch to the real Day 218–224 endpoints
#    (/v1/intelligence/context, /v1/intelligence/scorecards) — no invented routes;
#  - no fake controls: no AI Builder, no Autofill, no website scraping, no
#    Objection/Playbook library, no disabled "coming soon" stubs;
#  - the Scorecards tab is read-only — it never calls a mutating endpoint;
#  - the Context editor merges into the loaded draft, so a save can never drop
#    the structured lists the editor doesn't expose (the one real data risk);
#  - stages stay the fixed API set — no arbitrary custom stage editor;
#  - manager-only: a 403 reads as a calm no-access state, not an error;
#  - no raw UUIDs as visible labels (PREMIUM_UX_AUDIT §38);
#  - nav wiring added without disturbing existing routes/labels.
# WEB-only, additive: no API changes, no scoring changes, no migrations.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="$WEB_ROOT/src/app/intelligence/page.tsx"
CTX="$WEB_ROOT/src/app/intelligence/ContextTab.tsx"
SC="$WEB_ROOT/src/app/intelligence/ScorecardsTab.tsx"
NAV="$WEB_ROOT/src/config/navigation.ts"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
QA="$WEB_ROOT/DEMO_VISUAL_QA_NOTES.md"
BLUEPRINT="$WEB_ROOT/INTELLIGENCE_LAYER_BLUEPRINT.md"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fi
  [[ "$ok" == "0" ]] || fail=1
}

# Code only — strips `//` comment lines so the honest comments describing what
# was deliberately NOT built can't trip the "no fake controls" greps below.
code_of() { grep -vE '^[[:space:]]*//' "$1"; }

echo "Premium UX / Day 225 — Intelligence workspace MVP (own checks only)"

# --- Route exists -----------------------------------------------------------
test -f "$PAGE"; check "/intelligence route exists" $?
test -f "$CTX";  check "Context tab component exists" $?
test -f "$SC";   check "Scorecards tab component exists" $?

grep -q 'PageContainer' "$PAGE" && grep -q 'PageHeader' "$PAGE"
check "page uses the shared PageContainer/PageHeader layout" $?

grep -q 'WorkspaceTabs' "$PAGE"
check "page uses the shared WorkspaceTabs primitive" $?

# --- Tabs: exactly Context + Scorecards ------------------------------------
grep -q "id: \"context\", label: \"Context\"" "$PAGE" &&
  grep -q "id: \"scorecards\", label: \"Scorecards\"" "$PAGE"
check "exactly the Context and Scorecards tabs are declared" $?

grep -q "VALID_TABS" "$PAGE" && grep -q 'params.get("tab")' "$PAGE"
check "tab state deep-links via the ?tab= query param" $?

grep -q 'searchParams.set("tab", next)' "$PAGE"
check "changing tab writes ?tab= back to the URL" $?

# --- Real APIs only ---------------------------------------------------------
grep -q 'proxyFetch(`/v1/intelligence/context`' "$CTX"
check "Context tab reads GET /v1/intelligence/context via proxyFetch" $?

grep -q '/v1/intelligence/context/compiled?state=' "$CTX"
check "Context tab reads the compiled block from the real endpoint" $?

grep -q '/v1/intelligence/context/publish' "$CTX"
check "Context tab publishes via the real publish endpoint" $?

grep -q 'proxyFetch(`/v1/intelligence/scorecards`' "$SC"
check "Scorecards tab reads GET /v1/intelligence/scorecards via proxyFetch" $?

grep -q 'proxyFetch(`/v1/intelligence/scorecards/${id}`' "$SC"
check "Scorecard detail reads GET /v1/intelligence/scorecards/:id" $?

# Nothing may bypass the proxy or invent an endpoint.
for f in "$CTX" "$SC" "$PAGE"; do
  if code_of "$f" | grep -qE 'fetch\("http|fetch\(`http|NEXT_PUBLIC_API|localhost:'; then false; break; fi
done
check "no direct-backend calls — everything goes through proxyFetch" $?

if code_of "$CTX" | grep -oE '/v1/intelligence[a-z/{}$`?=&.-]*' |
   grep -vE '^/v1/intelligence/context(/compiled\?state=|/publish)?' | grep -q .; then false; else true; fi
check "Context tab calls no endpoint outside /v1/intelligence/context*" $?

if code_of "$SC" | grep -oE '/v1/intelligence[a-z/{}$`?=&.-]*' |
   grep -vE '^/v1/intelligence/scorecards' | grep -q .; then false; else true; fi
check "Scorecards tab calls no endpoint outside /v1/intelligence/scorecards*" $?

# --- Scorecards tab is read-only -------------------------------------------
if code_of "$SC" | grep -qE 'method: "(POST|PUT|PATCH|DELETE)"'; then false; else true; fi
check "Scorecards tab never issues a mutating request" $?

if code_of "$SC" | grep -qE '/activate|/archive|/fork|/versions/'; then false; else true; fi
check "no activate/archive/fork/version-write endpoints wired" $?

grep -q 'read-only here for now' "$SC"
check "read-only status stated honestly to the manager" $?

# --- No fake controls anywhere ---------------------------------------------
for f in "$PAGE" "$CTX" "$SC"; do
  if code_of "$f" | grep -qiE 'autofill|auto-fill|ai builder|build with ai|generate with ai|scrape|crawl website|import from website'; then false; break; fi
done
check "no AI Autofill / AI Builder / website scraping controls" $?

for f in "$PAGE" "$CTX" "$SC"; do
  if code_of "$f" | grep -qiE 'coming soon|not yet available</|placeholder button'; then false; break; fi
done
check "no 'coming soon' stub controls" $?

for f in "$PAGE" "$CTX" "$SC"; do
  if code_of "$f" | grep -qiE 'objection library|playbook library|sparring scenario engine'; then false; break; fi
done
check "no Objection/Playbook library surfaces smuggled in" $?

# Only the tabs that exist may be advertised.
if code_of "$PAGE" | grep -qiE 'id: "(objections|playbook|team|builder|settings)"'; then false; else true; fi
check "no tabs declared beyond Context and Scorecards" $?

# --- No arbitrary custom stages --------------------------------------------
grep -q 'STAGE_LABELS' "$SC" &&
  grep -q 'intro:' "$SC" && grep -q 'discovery:' "$SC" &&
  grep -q 'objection:' "$SC" && grep -q 'close:' "$SC"
check "stages are the fixed API set (intro/discovery/objection/close)" $?

if code_of "$SC" | grep -qiE 'addStage|newStage|createStage|removeStage|custom stage'; then false; else true; fi
check "no custom stage editor" $?

# --- Context editor data safety --------------------------------------------
# The PUT replaces the whole draft object, so the payload must be the loaded
# context with edits merged in — never rebuilt from the form fields alone.
grep -q 'JSON.stringify({ context: draftContext })' "$CTX"
check "save PUTs the merged draft context object" $?

grep -q 'function writePath' "$CTX" && grep -q 'const next = { ...obj }' "$CTX"
check "field edits merge immutably into the loaded context" $?

grep -q 'CONTEXT_SECTION_KEYS' "$CTX" || grep -q 'SECTION_KEYS' "$CTX"
check "editor is bounded to the API's known context sections" $?

# Unknown top-level keys are a hard 400 — the field map must not invent one.
if grep -oE 'path: \["[a-z_]+"' "$CTX" | sed -E 's/path: \["//;s/"//' | sort -u |
   grep -vE '^(profile|offering|objections|competitors|compliance|tone)$' | grep -q .; then false; else true; fi
check "no context section invented outside the API allowlist" $?

grep -q 'json.published?.context ? { ...json.published.context } : {}' "$CTX"
check "a missing draft seeds from published, never from empty" $?

grep -q 'Read-only for now' "$SC" || grep -q 'Read-only for now' "$CTX"
check "structured lists the editor can't edit are labelled read-only" $?

# --- Honesty: never claim scoring that isn't active -------------------------
grep -q 'const activeCard = items.find' "$SC"
check "active-scorecard claim derives from the API, not copy" $?

grep -q 'No company scorecard is active, so calls are scored with the Gravix default.' "$SC"
check "no-active-scorecard state reads honestly" $?

if grep -qE '^\s*(<p|<span)[^>]*>\s*Your company scorecard is active' "$SC"; then false; else true; fi
check "no unconditional 'scorecard is active' claim" $?

grep -q 'default_rubric' "$SC" && grep -q 'Read-only' "$SC"
check "Gravix Default rubric shown as a read-only card" $?

# --- Product copy -----------------------------------------------------------
grep -q 'Context teaches Gravix your business' "$CTX"
check "Context copy explains what context does" $?

grep -q 'Scorecards teach Gravix what a good call looks like' "$SC"
check "Scorecard copy explains what scorecards do" $?

grep -q 'Teach Gravix your business and what a good call sounds like' "$PAGE"
check "workspace subtitle frames /intelligence as 'teach'" $?

# --- Manager gating / calm states -------------------------------------------
grep -q 'res.status === 401 || res.status === 403' "$CTX" &&
  grep -q 'res.status === 401 || res.status === 403' "$SC"
check "both tabs detect the manager-only 403" $?

grep -q 'Intelligence is available to managers' "$CTX" &&
  grep -q 'Intelligence is available to managers' "$SC"
check "reps get a calm no-access state, not an error" $?

for f in "$CTX" "$SC"; do
  grep -q 'EmptyState' "$f" && grep -q 'animate-pulse' "$f" || { false; break; }
done
check "loading + empty/error states present on both tabs" $?

# --- Raw identifier safety --------------------------------------------------
grep -q 'UUID_RE' "$SC" && grep -q 'function scorecardLabel' "$SC"
check "scorecard labels reject UUID-shaped names" $?

if code_of "$SC" | grep -qE '>\{(card|version)\.id\}<'; then false; else true; fi
check "no raw id rendered as a visible label" $?

if code_of "$CTX" | grep -qE '>\{(draftRow|published)\.id\}<'; then false; else true; fi
check "no raw context id rendered as a visible label" $?

# --- Colour discipline ------------------------------------------------------
for f in "$PAGE" "$CTX" "$SC"; do
  if grep -qE 'fuchsia|purple-|pink-|cyan-[0-9]' "$f"; then false; break; fi
done
check "no arcade colour reintroduced" $?

# --- Nav wiring -------------------------------------------------------------
grep -q "{ label: 'Intelligence', href: '/intelligence', icon: Sparkles, roles: \['manager'\] }" "$NAV"
check "sidebar gains a manager-only Intelligence entry" $?

grep -q "'/intelligence'," "$NAV"
check "/intelligence added to SHELL_PATHS" $?

# --- Existing nav/routes untouched -----------------------------------------
grep -q "{ label: 'Analytics', href: '/crm/analytics', icon: BarChart2, roles: \['manager'\] }" "$NAV"
check "Analytics entry unchanged (observe vs teach split preserved)" $?

grep -q "{ label: 'Settings', href: '/admin/settings', icon: Settings, roles: \['manager'\] }" "$NAV"
check "Settings entry unchanged" $?

grep -q "{ label: 'Team', href: '/team', icon: Users2, roles: \['manager'\] }" "$NAV"
check "Team entry unchanged" $?

grep -q "{ label: 'Command Centre', href: '/coaching', icon: Brain }" "$NAV"
check "Command Centre entry unchanged" $?

ok=0
for p in '/dashboard' '/call-library' '/calls' '/crm' '/assignments' '/admin' '/sparring' '/upload' '/whisperer' '/coaching' '/settings' '/team'; do
  grep -q "'$p'," "$NAV" || ok=1
done
check "every pre-existing SHELL_PATHS entry preserved" $ok

# No duplicate label: "Intelligence" must be the nav label only once.
[[ "$(grep -c "label: 'Intelligence'" "$NAV")" == "1" ]]
check "no duplicate Intelligence nav label" $?

# --- Documentation ----------------------------------------------------------
grep -q 'Day 225' "$AUDIT"
check "PREMIUM_UX_AUDIT.md includes the Day 225 section" $?

grep -q 'Day 225' "$QA"
check "DEMO_VISUAL_QA_NOTES.md carries the /intelligence checklist" $?

grep -q 'Day 225' "$BLUEPRINT"
check "INTELLIGENCE_LAYER_BLUEPRINT.md records implementation status" $?

echo
if [[ "$fail" == "0" ]]; then
  echo "Day 225 validation PASSED"
else
  echo "Day 225 validation FAILED"
  exit 1
fi
