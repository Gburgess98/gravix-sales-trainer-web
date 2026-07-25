#!/usr/bin/env bash
# Validates the Day 250 Objection Library WEB MVP:
#  - /intelligence gains a third tab (Objections) with ?tab=objections deep
#    linking, and Context + Scorecards are preserved;
#  - ObjectionsTab renders the library (approved / drafts / archived-collapsed),
#    a create-draft form, draft editing, a completeness-gated Approve behind a
#    confirmation, and Archive behind a confirmation — no hard delete;
#  - every request goes through proxyFetch via src/lib/objectionLibraryApi.ts,
#    only /v1/intelligence/objections endpoints, no direct API-origin fetch;
#  - approved items are read-only/locked, archived items are read-only history;
#  - readiness mirrors the API's five approval requirements;
#  - no fake AI Builder / Autofill / suggestion mining, no fabricated evidence,
#    no raw UUID primary labels.
# WEB-only: no API changes, no scoring changes, no migrations.
# Own checks only (Day 135 rhythm). For core invariants: validate-tier-2b-smoke.

set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="$WEB_ROOT/src/app/intelligence/page.tsx"
TAB="$WEB_ROOT/src/app/intelligence/ObjectionsTab.tsx"
APILIB="$WEB_ROOT/src/lib/objectionLibraryApi.ts"
CTX="$WEB_ROOT/src/app/intelligence/ContextTab.tsx"
SC="$WEB_ROOT/src/app/intelligence/ScorecardsTab.tsx"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
QA="$WEB_ROOT/DEMO_VISUAL_QA_NOTES.md"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fi
  [[ "$ok" == "0" ]] || fail=1
}

# Strip whole-line comments so negative checks match CODE, not documentation.
# Accepts multiple files (grep prefixes filenames when given more than one,
# which is fine for the piped `grep -q` content checks below).
code_of() { grep -vE '^[[:space:]]*(//|/\*|\*)' "$@"; }

echo "Objection Library / Day 250 — WEB MVP (own checks only)"

# --- Files exist --------------------------------------------------------------
test -f "$PAGE"; check "/intelligence page exists" $?
test -f "$TAB";  check "ObjectionsTab component exists" $?
test -f "$APILIB"; check "objectionLibraryApi client exists" $?

# --- Tab wiring + deep link ---------------------------------------------------
grep -q "id: \"objections\", label: \"Objections\"" "$PAGE"
check "page registers the Objections tab" $?

grep -q 'VALID_TABS.*objections\|"objections"' "$PAGE" &&
  code_of "$PAGE" | grep -q 'objections'
check "objections is a valid deep-link tab" $?

grep -q '<ObjectionsTab' "$PAGE"
check "page renders ObjectionsTab" $?

# --- Context + Scorecards preserved -------------------------------------------
grep -q '<ContextTab' "$PAGE" && grep -q '<ScorecardsTab' "$PAGE"
check "Context and Scorecards tabs preserved" $?
test -f "$CTX" && test -f "$SC"
check "Context and Scorecards components still present" $?

# --- Client: proxyFetch only, real endpoints only -----------------------------
grep -q 'from "@/lib/api"' "$APILIB" && grep -q 'proxyFetch' "$APILIB"
check "client uses proxyFetch" $?

# No direct API-origin fetch in the touched files (only proxyFetch).
if code_of "$APILIB" "$TAB" 2>/dev/null | grep -qE 'fetch\(\s*[`"'\'']https?://'; then false; else true; fi
check "no direct API-origin fetch in client or tab" $?

# Every /v1 path the client touches is an objections path.
if code_of "$APILIB" | grep -oE '/v1/[a-zA-Z0-9/{}$?=&._-]*' |
   grep -vE '^/v1/intelligence/objections' | grep -q .; then false; else true; fi
check "client invents no endpoint outside /v1/intelligence/objections" $?

# --- Lifecycle endpoints wired ------------------------------------------------
grep -q 'method: "POST"' "$APILIB" && grep -q '`/v1/intelligence/objections`' "$APILIB"
check "create endpoint wired (POST objections)" $?
grep -q 'method: "PUT"' "$APILIB"
check "edit endpoint wired (PUT :id)" $?
grep -q '/approve`' "$APILIB" && grep -q '/archive`' "$APILIB"
check "approve + archive endpoints wired" $?

# --- No hard delete anywhere --------------------------------------------------
if code_of "$APILIB" "$TAB" | grep -qE 'method:\s*"DELETE"'; then false; else true; fi
check "no DELETE method (no hard delete)" $?

# --- Readiness mirrors the API's five approval requirements -------------------
grep -q 'computeObjectionReadiness' "$APILIB" &&
  grep -q 'A label' "$APILIB" &&
  grep -q 'A category' "$APILIB" &&
  grep -q 'At least one buyer phrase' "$APILIB" &&
  grep -q 'An approved response' "$APILIB" &&
  grep -q 'A coaching note or why-it-matters' "$APILIB"
check "readiness covers label/category/buyer phrase/approved response/coaching-or-why" $?

grep -q 'computeObjectionReadiness\|formReadiness' "$TAB"
check "tab computes readiness before approval" $?

# --- Lifecycle UX -------------------------------------------------------------
grep -q 'Approved guidance is locked' "$TAB"
check "approved items are read-only (locked note)" $?

grep -q 'Archived history' "$TAB" && grep -q 'archiveOpen' "$TAB"
check "archived items are collapsed history" $?

grep -q 'Future coaching can use this approved guidance. Existing call scores do not change.' "$TAB"
check "approve confirmation carries the exact scoring-safety copy" $?

grep -qi 'Archive this objection' "$TAB"
check "archive is confirmed" $?

# --- Evidence honest ----------------------------------------------------------
grep -q 'Evidence will appear here when this objection is linked to calls or moments.' "$TAB"
check "empty evidence state is honest (no fabricated evidence)" $?

# --- No fake generation -------------------------------------------------------
if code_of "$TAB" "$APILIB" | grep -qiE 'AI Builder|Autofill|auto-generate|generate objection|suggestion mining|scrape'; then false; else true; fi
check "no AI Builder / Autofill / suggestion mining in code" $?

# --- No raw UUID primary labels ----------------------------------------------
grep -q 'objectionLabel' "$APILIB" && grep -q 'Untitled objection' "$APILIB"
check "UUID-safe label helper present" $?
grep -q 'objectionLabel(item.label)' "$TAB"
check "list rows render through the UUID-safe label helper" $?

# --- Docs ---------------------------------------------------------------------
grep -q 'Day 250' "$AUDIT"
check "PREMIUM_UX_AUDIT.md records Day 250" $?
grep -q 'Day 250' "$QA"
check "DEMO_VISUAL_QA_NOTES.md carries the Day 250 checklist" $?

echo
if [[ "$fail" == "0" ]]; then
  echo "Objection Library Day 250 validation PASSED"
  exit 0
else
  echo "Objection Library Day 250 validation FAILED"
  exit 1
fi
