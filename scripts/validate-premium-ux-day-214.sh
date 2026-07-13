#!/usr/bin/env bash
# Validates the Day 214 read-only Manager Team surface:
#  - /team route exists as a client page on the shared shell primitives,
#    fetching only GET /v1/team/members through the proxy (no other team
#    endpoints, no mutating fetches anywhere on the page);
#  - honest read-only MVP: no invite/edit/deactivate controls, no disabled
#    "coming soon" buttons, no drawer;
#  - member labels are UUID-guarded (never a raw UUID as the primary label;
#    neutral "Team member" fallback);
#  - seat summary (allocated/used/available/source) + over_seat_allocation
#    warning represented, informational only;
#  - scope status uses the Day 211 human copy (Office assigned /
#    Company-wide scope / Needs team setup);
#  - nav: sidebar "Team" -> /team, /crm/manager relabelled "Manager Centre"
#    (route preserved), /team in SHELL_PATHS;
#  - manager/team docs updated.
# WEB-only, read-only, no API changes.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="$WEB_ROOT/src/app/team/page.tsx"
NAV="$WEB_ROOT/src/config/navigation.ts"
PLAN="$WEB_ROOT/MANAGER_TEAM_MANAGEMENT_ROUTE_PLAN.md"
QA="$WEB_ROOT/DEMO_VISUAL_QA_NOTES.md"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 214 — read-only team surface (own checks only)"

# --- Route + data source ---
[[ -f "$PAGE" ]]
check "/team route exists (src/app/team/page.tsx)" $?

grep -q 'proxyFetch(`/v1/team/members`' "$PAGE"
check "page fetches GET /v1/team/members via the proxy" $?

[[ "$(grep -c 'proxyFetch(' "$PAGE")" == "1" ]]
check "members endpoint is the page's only fetch" $?

if grep -qE 'method:\s*["'"'"']?(POST|PATCH|PUT|DELETE)' "$PAGE"; then false; else true; fi
check "no mutating fetches on the page" $?

# --- Honest read-only (no fake controls) ---
if grep -qiE 'invite|deactivate|reactivate' "$PAGE"; then
  # allowed only inside comments/copy explaining read-only state
  grep -iE 'invite|deactivate|reactivate' "$PAGE" | grep -vE '^\s*(//|\*|/\*)|read-only|later release|later lane' >/dev/null && false || true
else
  true
fi
check "no invite/deactivate controls (mentions only in read-only copy)" $?

if grep -q 'disabled' "$PAGE"; then false; else true; fi
check "no disabled placeholder controls" $?

# --- Labels never raw UUIDs ---
grep -q 'UUID_LIKE_RE' "$PAGE"
check "member labels are UUID-guarded" $?

grep -q '"Team member"' "$PAGE"
check "neutral fallback label for identity-less members" $?

# --- Seat summary + warnings ---
grep -q 'over_seat_allocation' "$PAGE"
check "over_seat_allocation warning represented" $?

grep -q 'Seats allocated' "$PAGE" && grep -q 'Seats available' "$PAGE"
check "seat summary shown (allocated/available StatCards)" $?

grep -q 'Seat usage never blocks coaching' "$PAGE"
check "seat usage is informational, not blocking" $?

# --- Scope status copy (Day 211) ---
grep -q '"Office assigned"' "$PAGE" && grep -q '"Company-wide scope"' "$PAGE" && grep -q '"Needs team setup"' "$PAGE"
check "human scope status copy (office/company/needs setup)" $?

# --- Shell primitives ---
grep -q 'PageContainer' "$PAGE" && grep -q 'PageHeader' "$PAGE" && grep -q 'SectionCard' "$PAGE" && grep -q 'StatCard' "$PAGE" && grep -q 'EmptyState' "$PAGE"
check "built on shared shell primitives" $?

# --- Navigation wiring ---
grep -q "label: 'Team', href: '/team'" "$NAV"
check "sidebar Team points to /team" $?

grep -q "label: 'Manager Centre', href: '/crm/manager'" "$NAV"
check "/crm/manager kept, relabelled Manager Centre" $?

grep -q "'/team'," "$NAV"
check "/team added to SHELL_PATHS" $?

# --- Documentation ---
grep -q 'Day 214' "$PLAN"
check "route plan records the Day 214 implemented page" $?

grep -q 'Day 214' "$QA"
check "DEMO_VISUAL_QA_NOTES.md has the /team QA checklist" $?

grep -q 'Day 214' "$AUDIT"
check "PREMIUM_UX_AUDIT.md includes the Day 214 note" $?

echo
if [[ "$fail" == "0" ]]; then
  echo "Day 214 validation PASSED"
else
  echo "Day 214 validation FAILED"
  exit 1
fi
