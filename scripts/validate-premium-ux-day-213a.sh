#!/usr/bin/env bash
# Validates the Day 213A analytics human-labels patch:
#  - /crm/analytics never renders a raw UUID as a rep label — the analytics
#    API echoes rep_id back as rep_name (auth.users lookup fail-softs), so
#    repLabel() must treat UUID-shaped / id-equal names as absent;
#  - label preference: team directory name > API name > email local part >
#    short neutral "Rep xxxxxx" fallback (never the full UUID);
#  - names resolved from the existing tenant-scoped /v1/team/users endpoint
#    (fail-soft to the neutral fallback);
#  - Activity by rep chart keys the x-axis (and therefore the tooltip label)
#    off rep_label, not rep_id/rep_name;
#  - every repLabel call site passes the directory;
#  - activity-by-rep CSV export ships human labels, not raw ids;
#  - full rep_id stays internal for filters/queries/state.
# WEB-only, no API changes, no migrations, no redesign.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANALYTICS="$WEB_ROOT/src/app/crm/analytics/page.tsx"
QA="$WEB_ROOT/DEMO_VISUAL_QA_NOTES.md"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 213A — analytics human labels (own checks only)"

# --- Label helper guards ---
grep -q 'UUID_LIKE_RE' "$ANALYTICS"
check "repLabel guards against UUID-shaped names (UUID_LIKE_RE)" $?

grep -q 'if (repId && v === repId) return null' "$ANALYTICS"
check "names equal to the rep_id are treated as absent" $?

grep -q 'Rep \${rep.rep_id.slice(0, 6)}' "$ANALYTICS"
check "last-resort fallback is the short neutral Rep label (6 chars)" $?

grep -q 'function emailLocalPart' "$ANALYTICS"
check "email fallback uses the local part only" $?

# --- Directory resolution ---
grep -q '/v1/team/users?limit=200' "$ANALYTICS"
check "names resolved via existing /v1/team/users endpoint" $?

grep -q 'setRepDirectory({})' "$ANALYTICS"
check "directory fetch is fail-soft (falls back to empty directory)" $?

# --- Chart + call sites ---
grep -q 'XAxis dataKey="rep_label"' "$ANALYTICS"
check "Activity by rep x-axis (and tooltip label) keyed off rep_label" $?

if grep -q 'XAxis dataKey="rep_id"\|XAxis dataKey="rep_name"' "$ANALYTICS"; then false; else true; fi
check "no chart axis keyed off raw rep_id/rep_name" $?

[[ "$(grep -c 'repLabel(' "$ANALYTICS")" == "5" ]]
check "repLabel defined once + all four call sites present" $?

if grep -n 'repLabel([a-zA-Z]*)\s*[,}]' "$ANALYTICS" | grep -v repDirectory >/dev/null; then false; else true; fi
check "every repLabel call site passes the directory" $?

# --- Export ---
if grep -q 'exportCSV("activity-by-rep.csv", repActivity)' "$ANALYTICS"; then false; else true; fi
check "activity-by-rep CSV no longer exports raw repActivity rows" $?

grep -q 'rep: r.rep_label' "$ANALYTICS"
check "activity-by-rep CSV exports the human rep label" $?

# --- Internal id preserved for state/queries ---
grep -q 'value={rep.rep_id}' "$ANALYTICS"
check "rep filter select still keyed on full rep_id internally" $?

grep -q 'repId=\${encodeURIComponent(selectedRep)}' "$ANALYTICS"
check "analytics queries still filter by full rep_id" $?

# --- Documentation ---
grep -q 'Day 213A' "$QA"
check "DEMO_VISUAL_QA_NOTES.md records the Day 213A fix" $?

grep -q 'Day 213A' "$AUDIT"
check "PREMIUM_UX_AUDIT.md includes Day 213A note" $?

echo
if [[ "$fail" == "0" ]]; then
  echo "Day 213A validation PASSED"
else
  echo "Day 213A validation FAILED"
  exit 1
fi
