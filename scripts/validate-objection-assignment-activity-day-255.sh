#!/usr/bin/env bash
# Validates the Day 255 Objection assignment-activity section:
#  - the objection detail shows an "Assignment activity" section listing the
#    coaching assignments created FROM that objection (Day 254 loop closed);
#  - activity is read from the EXISTING manager list endpoint via proxyFetch
#    (listCoachAssignments → /v1/assignments/manager), filtered client-side by
#    meta.objection_item_id — no new backend, no direct API origin;
#  - summary shows Assigned / Open / Completed / Latest assignment, with an
#    honest empty state and a soft-fail retry;
#  - the section refreshes after a successful "Assign coaching" (no reload);
#  - approved items keep the assign CTA; archived items are read-only (no assign);
#  - no fake AI, no DELETE in the objection surface.
# WEB-first. Own checks only (Day 135 rhythm).

set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAB="$WEB_ROOT/src/app/intelligence/ObjectionsTab.tsx"
API="$WEB_ROOT/src/lib/api.ts"
APILIB="$WEB_ROOT/src/lib/objectionLibraryApi.ts"
QA="$WEB_ROOT/DEMO_VISUAL_QA_NOTES.md"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fi
  [[ "$ok" == "0" ]] || fail=1
}

# Strip whole-line comments so negative checks match CODE, not documentation.
code_of() { grep -vE '^[[:space:]]*(//|/\*|\*)' "$@"; }

echo "Objection assignment activity / Day 255 (own checks only)"

# --- Files exist --------------------------------------------------------------
test -f "$TAB"; check "ObjectionsTab component exists" $?
test -f "$API"; check "lib/api.ts exists" $?

# --- Activity section present + rendered ---------------------------------------
grep -q 'function AssignmentActivitySection' "$TAB"
check "assignment activity section component exists" $?
grep -q '<AssignmentActivitySection' "$TAB"
check "activity section is rendered in the objection detail" $?
grep -q 'Assignment activity' "$TAB"
check "section is labelled \"Assignment activity\"" $?

# --- Helper reads the EXISTING manager endpoint via proxy ----------------------
grep -q 'listAssignmentsForObjection' "$API" && grep -q 'listAssignmentsForObjection' "$TAB"
check "listAssignmentsForObjection helper exists and is used by the tab" $?

code_of "$API" | grep -A30 'function listAssignmentsForObjection' | grep -q 'listCoachAssignments'
check "activity reads the existing /v1/assignments/manager helper (no new backend)" $?

grep -q 'proxyFetch' "$API"
check "assignment reads go through proxyFetch (via proxyGet/listCoachAssignments)" $?

# No direct API-origin fetch in the objection surface.
if code_of "$TAB" "$APILIB" 2>/dev/null | grep -qE 'fetch\(\s*[`"'\'']https?://'; then false; else true; fi
check "no direct API-origin fetch in tab or objection client" $?

# The objection client still invents no endpoint outside its namespace.
if code_of "$APILIB" | grep -oE '/v1/[a-zA-Z0-9/{}$?=&._-]*' |
   grep -vE '^/v1/intelligence/objections' | grep -q .; then false; else true; fi
check "objection client still only touches /v1/intelligence/objections" $?

# --- Filters by objection_item_id ---------------------------------------------
code_of "$API" | grep -A30 'function listAssignmentsForObjection' | grep -q 'objection_item_id'
check "activity filters by meta.objection_item_id" $?

# --- Summary labels + empty state ---------------------------------------------
grep -q 'label="Assigned"' "$TAB" && grep -q 'label="Open"' "$TAB" && \
  grep -q 'label="Completed"' "$TAB" && grep -q 'label="Latest assignment"' "$TAB"
check "summary shows Assigned / Open / Completed / Latest assignment" $?

grep -q 'No coaching has been assigned from this objection yet.' "$TAB"
check "honest empty state exists" $?

grep -q 'Assignment activity could not be loaded' "$TAB"
check "soft-fail state exists (does not block the rest of the detail)" $?

# --- Refresh after a successful assignment ------------------------------------
grep -q 'onAssigned={loadActivity}' "$TAB"
check "activity refreshes after a successful assignment (onAssigned → loadActivity)" $?
code_of "$TAB" | grep -A2 'Coaching assigned' | grep -q 'onAssigned' || \
  code_of "$TAB" | grep -q 'onAssigned();'
check "assign modal signals success to refresh activity" $?

# --- Approved keeps assign CTA; archived read-only ----------------------------
grep -q 'const showActivity = isApproved || isArchived' "$TAB"
check "activity shows for approved AND archived items" $?
grep -q 'assignOpen && isApproved' "$TAB"
check "assign action is gated to approved items (archived cannot assign)" $?

# --- No fake generation, no hard delete in the objection surface --------------
if code_of "$TAB" "$APILIB" | grep -qiE 'AI Builder|Autofill|auto-generate|generate objection|suggestion mining|scrape'; then false; else true; fi
check "no AI Builder / Autofill / suggestion mining in the flow" $?

if code_of "$TAB" "$APILIB" | grep -qE 'method:\s*"DELETE"'; then false; else true; fi
check "no DELETE method in the objection surface" $?

# --- Docs ---------------------------------------------------------------------
grep -q 'Day 255' "$QA"
check "DEMO_VISUAL_QA_NOTES.md records Day 255" $?

echo
if [[ "$fail" == "0" ]]; then
  echo "Objection assignment activity Day 255 validation PASSED"
  exit 0
else
  echo "Objection assignment activity Day 255 validation FAILED"
  exit 1
fi
