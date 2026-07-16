#!/usr/bin/env bash
# Validates the Day 228 auth first-impression pass:
#  - the login page carries the product brand (indigo token), not the retired
#    emerald mark, and no arcade cyan focus rings;
#  - no pointless "Login" header on the login page itself (HeaderClient
#    renders nothing there);
#  - logged-out visits to shell routes are gated: ShellGate wraps AppShell in
#    AuthGate, which redirects to /login instead of rendering the shell with
#    every fetch 401ing into fake "getting started" states;
#  - no redirect loop is possible: /login and /auth are not shell paths;
#  - the middleware's open-route contract is honoured by the gate (even
#    though the request-header plumbing upstream is a known no-op);
#  - authenticated manager-gate states are untouched (reps still see
#    "Intelligence is available to managers", not a login redirect);
#  - the Day 227 Scorecard Studio safeguards are re-asserted: confirmation
#    before activation, replace_conflicts never automatic, no AI Builder /
#    Autofill / custom stages.
# WEB-only: no API changes, no auth-flow changes beyond the gate, no
# migrations. Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke

set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGIN="$WEB_ROOT/src/app/login/page.tsx"
HEADER="$WEB_ROOT/src/components/HeaderClient.tsx"
GATE="$WEB_ROOT/src/components/AuthGate.tsx"
SHELLGATE="$WEB_ROOT/src/components/shell/shell-gate.tsx"
NAV="$WEB_ROOT/src/config/navigation.ts"
SC="$WEB_ROOT/src/app/intelligence/ScorecardsTab.tsx"
CTX="$WEB_ROOT/src/app/intelligence/ContextTab.tsx"
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

echo "Premium UX / Day 228 — auth first impression (own checks only)"

# --- Login page branding -----------------------------------------------------
test -f "$LOGIN"; check "login page exists" $?

if grep -qE 'emerald|green-[0-9]' "$LOGIN"; then false; else true; fi
check "login page carries no emerald brand classes" $?

if grep -qE 'cyan-[0-9]|fuchsia|purple-|pink-' "$LOGIN"; then false; else true; fi
check "login page carries no arcade focus/accent colour" $?

grep -q 'text-brand-400' "$LOGIN" && grep -q 'focus:border-brand-500/50' "$LOGIN"
check "login brand mark and focus rings use the brand token" $?

grep -q 'router.replace("/call-library")' "$LOGIN"
check "post-login destination skips the deprecated /recent-calls stub" $?

# --- No pointless Login header on the login page ------------------------------
grep -q "if (pathname === '/login') return null" "$HEADER"
check "HeaderClient renders nothing on /login (no self-linking Login button)" $?

if code_of "$HEADER" | grep -q 'console.log'; then false; else true; fi
check "HeaderClient debug logging removed" $?

# --- Logged-out shell routes are gated ----------------------------------------
grep -q 'import AuthGate' "$SHELLGATE" &&
  grep -q '<AuthGate>' "$SHELLGATE" && grep -q '<AppShell>{children}</AppShell>' "$SHELLGATE"
check "ShellGate wraps the app shell in AuthGate" $?

grep -q "router.replace('/login')" "$GATE"
check "AuthGate sends logged-out visitors to /login" $?

grep -q 'if (loading) return null' "$GATE"
check "AuthGate renders nothing while the session resolves (no fake shell)" $?

grep -q 'isOpenRoute' "$GATE" && grep -q "dataset.openRoute === '1'" "$GATE"
check "AuthGate honours the middleware open-route contract" $?

# --- No redirect loop -----------------------------------------------------------
if grep -qE "^\s*'/login'," "$NAV" || grep -qE "^\s*'/auth'," "$NAV"; then false; else true; fi
check "/login and /auth are not shell paths (no loop possible)" $?

grep -q "'/dashboard'," "$NAV" && grep -q "'/intelligence'," "$NAV"
check "shell paths themselves are unchanged" $?

# --- Authenticated forbidden states preserved -----------------------------------
grep -q 'Intelligence is available to managers' "$SC" &&
  grep -q 'Intelligence is available to managers' "$CTX"
check "manager-only forbidden states still render for authenticated reps" $?

# --- Day 227 Scorecard Studio safeguards still intact ----------------------------
test -f "$EDITOR" && test -f "$APILIB"
check "Scorecard Studio editor + mutation client still exist" $?

grep -q 'function ActivateModal' "$EDITOR" && grep -q 'if (!replaceArmed) return' "$EDITOR"
check "activation still confirmed; replace path still armed explicitly" $?

[ "$(grep -c 'replace_conflicts: true' "$EDITOR")" = "1" ] &&
  grep -q 'opts.replace_conflicts === true' "$APILIB"
check "replace_conflicts still never automatic" $?

ok=0
for f in "$EDITOR" "$APILIB" "$LOGIN"; do
  if code_of "$f" | grep -qiE 'autofill|auto-fill|ai builder|build with ai|custom stage'; then ok=1; fi
done
check "no AI Builder / Autofill / custom stages" $ok

if code_of "$SC" | grep -qE 'method: "(POST|PUT|PATCH|DELETE)"'; then false; else true; fi
check "ScorecardsTab still read-only" $?

# --- Documentation -----------------------------------------------------------------
grep -q 'Day 228' "$AUDIT"
check "PREMIUM_UX_AUDIT.md includes the Day 228 section" $?

grep -q 'Day 228' "$QA"
check "DEMO_VISUAL_QA_NOTES.md records the Day 228 QA result" $?

echo
if [[ "$fail" == "0" ]]; then
  echo "Day 228 validation PASSED"
else
  echo "Day 228 validation FAILED"
  exit 1
fi
