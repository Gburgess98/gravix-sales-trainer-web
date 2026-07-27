#!/usr/bin/env bash
# Validates the Day 254 Objection → coaching assignment flow:
#  - an APPROVED objection gains a manager action ("Assign coaching") that opens
#    an assignment modal; draft/archived objections never show it;
#  - the assignment is created through the EXISTING assignment engine
#    (POST /v1/assignments) via proxyFetch — no new backend, no direct API origin;
#  - the assignment title includes the objection label and the instructions are
#    prefilled deterministically from the approved response + coaching note;
#  - creating an assignment never edits/approves/archives the objection, and the
#    Objection Library lifecycle (approved read-only, no hard delete) is unchanged;
#  - no fake AI Builder / Autofill / suggestion mining, no DELETE.
# WEB-first: uses the existing assignment API only. Own checks only (Day 135 rhythm).

set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAB="$WEB_ROOT/src/app/intelligence/ObjectionsTab.tsx"
APILIB="$WEB_ROOT/src/lib/objectionLibraryApi.ts"
API="$WEB_ROOT/src/lib/api.ts"
QA="$WEB_ROOT/DEMO_VISUAL_QA_NOTES.md"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fi
  [[ "$ok" == "0" ]] || fail=1
}

# Strip whole-line comments so negative checks match CODE, not documentation.
code_of() { grep -vE '^[[:space:]]*(//|/\*|\*)' "$@"; }

echo "Objection → Assignment / Day 254 (own checks only)"

# --- Files exist --------------------------------------------------------------
test -f "$TAB"; check "ObjectionsTab component exists" $?
test -f "$API"; check "lib/api.ts exists" $?

# --- Assign action shown for approved items only ------------------------------
grep -q 'Assign coaching' "$TAB"
check "approved objection exposes an Assign coaching action" $?

# The assign button lives inside the isApproved branch; drafts/archived do not.
grep -q 'AssignCoachingModal' "$TAB" && grep -q 'assignOpen && isApproved' "$TAB"
check "assign modal is gated to approved items (not draft/archived)" $?

grep -q 'function AssignCoachingModal' "$TAB"
check "assignment modal/drawer component exists" $?

# --- Uses the existing assignment engine via proxyFetch -----------------------
grep -q 'assignCoachingFromObjection' "$API" && grep -q '/v1/assignments' "$API"
check "uses the existing POST /v1/assignments engine (lib/api.ts)" $?

grep -q 'proxyFetch' "$API" && \
  code_of "$API" | grep -A12 'assignCoachingFromObjection' | grep -q 'proxyFetch'
check "assignment request goes through proxyFetch" $?

# No direct API-origin fetch in the touched files.
if code_of "$TAB" "$APILIB" 2>/dev/null | grep -qE 'fetch\(\s*[`"'\'']https?://'; then false; else true; fi
check "no direct API-origin fetch in tab or objection client" $?

# The tab imports the assign helper from the api lib, not an invented client.
grep -q 'assignCoachingFromObjection' "$TAB" && grep -q 'from "@/lib/api"' "$TAB"
check "tab calls the shared assignment helper (no invented endpoint in tab)" $?

# The objection client still invents no endpoint outside its own namespace
# (the assignment call must NOT have leaked into objectionLibraryApi.ts).
if code_of "$APILIB" | grep -oE '/v1/[a-zA-Z0-9/{}$?=&._-]*' |
   grep -vE '^/v1/intelligence/objections' | grep -q .; then false; else true; fi
check "objection client still only touches /v1/intelligence/objections" $?

# --- Deterministic prefill from approved fields -------------------------------
grep -q 'buildObjectionAssignmentPrefill' "$APILIB" && grep -q 'buildObjectionAssignmentPrefill' "$TAB"
check "deterministic prefill builder exists and is used" $?

grep -q 'Practise handling: ${label}' "$APILIB"
check "prefilled title includes the objection label" $?

code_of "$APILIB" | grep -A20 'buildObjectionAssignmentPrefill' | grep -q 'approved_response' && \
code_of "$APILIB" | grep -A20 'buildObjectionAssignmentPrefill' | grep -q 'coaching_note'
check "instructions are built from the approved response + coaching note" $?

# --- Safety: objection lifecycle unchanged ------------------------------------
# The assign helper must not call any objection lifecycle mutation.
if code_of "$API" | grep -A20 'assignCoachingFromObjection' |
   grep -qE '/approve|/archive|intelligence/objections'; then false; else true; fi
check "assigning does not edit/approve/archive the objection" $?

# Approved items remain read-only/locked (Day 250 invariant preserved).
grep -q 'Approved guidance is locked' "$TAB"
check "approved objections remain read-only/locked" $?

# --- No fake generation, no hard delete ---------------------------------------
if code_of "$TAB" "$APILIB" "$API" | grep -qiE 'AI Builder|Autofill|auto-generate|generate objection|suggestion mining|scrape'; then false; else true; fi
check "no AI Builder / Autofill / suggestion mining in the flow" $?

if code_of "$TAB" "$APILIB" | grep -qE 'method:\s*"DELETE"'; then false; else true; fi
check "no DELETE method in the objection surface" $?

# --- Docs ---------------------------------------------------------------------
grep -q 'Day 254' "$QA"
check "DEMO_VISUAL_QA_NOTES.md records Day 254" $?

echo
if [[ "$fail" == "0" ]]; then
  echo "Objection → Assignment Day 254 validation PASSED"
  exit 0
else
  echo "Objection → Assignment Day 254 validation FAILED"
  exit 1
fi
