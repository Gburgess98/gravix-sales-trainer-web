#!/usr/bin/env bash
# Validates the Day 235 C-grade surface cleanup (Day 231 audit follow-up):
#  - /crm/actions (orphaned, duplicated the overview cockpit) is a server
#    redirect stub to /crm/overview — real redirect, not fake UI;
#  - /crm/tasks (linked from /crm/pipeline, real completion behaviour) is
#    kept and shell-adopted: PageContainer/PageHeader/buttonClasses, with
#    the Day 190 behaviours (loadTasks refresh, completeTask) preserved;
#  - /admin/users is kept as the partner/superadmin control plane with
#    explicit internal framing, impersonation flows intact, and its nav
#    entry still partneradmin-only — never a buyer/manager demo surface;
#  - /team stays the manager people surface; /crm/overview stays a valid
#    destination; no fake controls or "coming soon" stubs anywhere.
# WEB-only: no API changes, no scoring changes, no migrations.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke

set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ACTIONS="$WEB_ROOT/src/app/crm/actions/page.tsx"
TASKS="$WEB_ROOT/src/app/crm/tasks/page.tsx"
USERS="$WEB_ROOT/src/app/admin/users/page.tsx"
NAV="$WEB_ROOT/src/config/navigation.ts"
OVERVIEW="$WEB_ROOT/src/app/crm/overview/page.tsx"
TEAM="$WEB_ROOT/src/app/team/page.tsx"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
QA="$WEB_ROOT/DEMO_VISUAL_QA_NOTES.md"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fi
  [[ "$ok" == "0" ]] || fail=1
}

code_of() { grep -vE '^[[:space:]]*(//|/\*|\*)' "$1"; }

echo "Premium UX / Day 235 — C-grade surface cleanup (own checks only)"

# --- /crm/actions: demoted to a real server redirect --------------------------
grep -q 'redirect("/crm/overview")' "$ACTIONS" &&
  grep -q 'import { redirect } from "next/navigation"' "$ACTIONS"
check "/crm/actions is a server redirect stub to /crm/overview" $?

if code_of "$ACTIONS" | grep -qE '<div|<button|useState|useEffect'; then false; else true; fi
check "/crm/actions renders no UI of its own (no fake page)" $?

test -f "$OVERVIEW"
check "redirect destination /crm/overview exists" $?

# --- /crm/tasks: kept + shell-adopted -----------------------------------------
grep -q 'PageContainer' "$TASKS" && grep -q 'PageHeader' "$TASKS" &&
  grep -q 'buttonClasses' "$TASKS"
check "/crm/tasks adopted the shell primitives" $?

grep -q 'onClick={() => void loadTasks()}' "$TASKS" && grep -q 'completeTask' "$TASKS"
check "/crm/tasks behaviours preserved (refresh + complete)" $?

grep -q 'href="/crm/pipeline"' "$TASKS"
check "/crm/tasks keeps its pipeline back-link (inbound route pair)" $?

if code_of "$TASKS" | grep -q 'min-h-screen'; then false; else true; fi
check "/crm/tasks local full-screen wrapper retired" $?

# --- /admin/users: internal control plane, clearly framed ---------------------
grep -q 'Control Plane · Internal admin' "$USERS"
check "/admin/users framed as internal admin, not a demo surface" $?

grep -q 'PageContainer' "$USERS" && grep -q 'PageHeader' "$USERS"
check "/admin/users adopted the shell primitives" $?

grep -q 'handleBecomeUser' "$USERS" && grep -q 'Exit impersonation' "$USERS"
check "/admin/users impersonation flows intact" $?

grep -q "href: '/admin/users',     icon: ShieldCheck,  roles: \['partneradmin'\]" "$NAV"
check "/admin/users nav entry stays partneradmin-only" $?

! grep -qi 'fuchsia' "$USERS"
check "/admin/users stays off the retired palette" $?

# --- Stronger surfaces remain the destinations --------------------------------
grep -q "{ label: 'Team', href: '/team', icon: Users2, roles: \['manager'\] }" "$NAV"
check "/team remains the manager people surface" $?

test -f "$TEAM"
check "/team route exists" $?

# --- No fakery in touched files -----------------------------------------------
ok=0
for f in "$ACTIONS" "$TASKS" "$USERS"; do
  if code_of "$f" | grep -qiE 'coming soon|placeholder button|autofill|ai builder'; then ok=1; fi
done
check "no fake controls or coming-soon stubs" $ok

ok=0
for f in "$TASKS" "$USERS"; do
  if code_of "$f" | grep -qE '>\{(task|u|user|row)\.id\}<'; then ok=1; fi
done
check "no raw UUID rendered as a primary label" $ok

# --- Documentation ------------------------------------------------------------
grep -q 'Day 235' "$AUDIT"
check "PREMIUM_UX_AUDIT.md includes the Day 235 section" $?

grep -q 'Day 235' "$QA"
check "DEMO_VISUAL_QA_NOTES.md records the route guidance" $?

echo
if [[ "$fail" == "0" ]]; then
  echo "Day 235 validation PASSED"
else
  echo "Day 235 validation FAILED"
  exit 1
fi
