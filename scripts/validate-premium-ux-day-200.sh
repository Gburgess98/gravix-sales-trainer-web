#!/usr/bin/env bash
# Validates the Day 200 visual milestone: full visual QA sweep closing the
# Days 194-199 Command Centre sprint. The last white-active chip
# (/crm/accounts/[id] rescue filter) goes indigo tonal, cyan action
# colours on /crm/accounts (+detail) and /dashboard move to indigo/neutral
# (cyan retained only as the semantic "medium" urgency accent), cyan form
# focus rings go indigo, and both orphaned light-theme ContactHealthClient
# components are deleted with zero stale refs. Colour-class-only edits;
# all handlers/hrefs/disabled states preserved.
# WEB-only, patch mode — no API, no migrations, no new features.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
SRC="$WEB_ROOT/src"
ACCOUNTS="$SRC/app/crm/accounts/page.tsx"
ACC_DETAIL="$SRC/app/crm/accounts/[id]/page.tsx"
DASH="$SRC/app/dashboard/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 200 — own checks only (use validate-tier-2b-smoke for current smoke)"

# --- Documentation ---
grep -q "Day 200 visual milestone" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 200 milestone" $?

# --- Last white-active chip retired (app-wide on active surfaces) ---
! grep -q 'border-neutral-100 bg-neutral-100 text-neutral-900' "$ACC_DETAIL" 2>/dev/null
check "accounts/[id] white-active rescue chip gone" $?
grep -q "'border-indigo-500/40 bg-indigo-500/15 font-medium text-indigo-200'" "$ACC_DETAIL" 2>/dev/null
check "accounts/[id] All chip is indigo tonal" $?
! grep -rq 'border-neutral-100 bg-neutral-100 text-neutral-900' "$SRC/app/crm" "$SRC/app/coaching" "$SRC/app/call-library" "$SRC/app/calls" "$SRC/app/dashboard" "$SRC/app/upload" 2>/dev/null
check "no white-active chips left on swept routes" $?

# --- Urgency semantics kept on the rescue filter ---
grep -q "'border-red-400 bg-red-500/20 text-red-200'" "$ACC_DETAIL" 2>/dev/null
check "critical filter active stays red" $?
grep -q "'border-amber-400 bg-amber-500/20 text-amber-200'" "$ACC_DETAIL" 2>/dev/null
check "high filter active stays amber" $?

# --- Cyan action colours moved to indigo/neutral on /crm/accounts ---
grep -q "'border-indigo-500/40 bg-indigo-500/15 text-indigo-200'" "$ACCOUNTS" 2>/dev/null
check "Default View toggle active is indigo tonal" $?
grep -q "'border-red-500/30 bg-red-500/10 text-red-200'" "$ACCOUNTS" 2>/dev/null
check "Needs Intervention toggle active stays red" $?
grep -q 'hover:border-indigo-500/40 hover:bg-neutral-900/70' "$ACCOUNTS" 2>/dev/null
check "account card hover accent is indigo" $?
grep -q 'group-hover:text-indigo-200' "$ACCOUNTS" 2>/dev/null
check "account card title hover is indigo" $?
grep -q 'border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-200' "$ACCOUNTS" 2>/dev/null
check "card Open pill is indigo tonal" $?
! grep -q 'focus:border-cyan-500/40' "$ACCOUNTS" 2>/dev/null
check "accounts cyan focus rings gone" $?
! grep -q 'focus:border-cyan-500/40' "$ACC_DETAIL" 2>/dev/null
check "accounts/[id] cyan focus rings gone" $?
grep -q 'focus:border-indigo-500/50' "$ACCOUNTS" 2>/dev/null
check "accounts focus rings are indigo" $?

# --- Cyan links off action duty ---
grep -q 'className="hover:underline text-neutral-200 text-xs"' "$ACC_DETAIL" 2>/dev/null
check "rep-performance link is neutral" $?
grep -q '<span className="text-xs text-neutral-400">Open →</span>' "$ACC_DETAIL" 2>/dev/null
check "contact Open arrow is neutral" $?
grep -q 'href="/upload" className="text-xs text-indigo-300 hover:text-indigo-200 transition-colors"' "$DASH" 2>/dev/null
check "dashboard Upload link is indigo" $?
! grep -q 'text-cyan-500/70' "$DASH" 2>/dev/null
check "dashboard cyan action link gone" $?

# --- Cyan retained only as the semantic medium-urgency accent ---
grep -q "'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'" "$ACC_DETAIL" 2>/dev/null
check "UrgencyPill medium stays cyan (semantic pair)" $?
grep -q "'border-cyan-400 bg-cyan-500/20 text-cyan-200'" "$ACC_DETAIL" 2>/dev/null
check "medium filter active stays cyan (semantic pair)" $?

# --- Orphaned light-theme components deleted with zero stale refs ---
[[ ! -f "$SRC/app/crm/accounts/[id]/ContactHealthClient.tsx" ]]
check "accounts/[id]/ContactHealthClient.tsx deleted" $?
[[ ! -f "$SRC/app/crm/contacts/[id]/ContactHealthClient.tsx" ]]
check "contacts/[id]/ContactHealthClient.tsx deleted" $?
! grep -rq 'ContactHealthClient' "$SRC" "$WEB_ROOT/tests" 2>/dev/null
check "zero stale references to ContactHealthClient" $?

# --- Behaviour preserved (spot checks) ---
grep -q 'onClick={() => setRescueFilter(f)}' "$ACC_DETAIL" 2>/dev/null
check "rescue filter handler intact" $?
grep -q "onClick={() => setSortMode('default')}" "$ACCOUNTS" 2>/dev/null
check "sort mode handler intact" $?
grep -q "onClick={() => setSortMode('needs_intervention')}" "$ACCOUNTS" 2>/dev/null
check "intervention sort handler intact" $?
grep -q 'unlinkContact(contact.id)' "$ACC_DETAIL" 2>/dev/null
check "unlink contact handler intact" $?
grep -q 'disabled={createSaving || !createForm.name.trim()}' "$ACCOUNTS" 2>/dev/null
check "create-account disabled expression intact" $?

# --- Day-182 pinned recipe still literal on /crm/accounts ---
grep -q 'border-indigo-500/20 bg-indigo-600/20' "$ACCOUNTS" 2>/dev/null
check "day-182 pinned indigo CTA recipe still present" $?

if [[ "$fail" == "0" ]]; then
  echo "Day 200 validation PASSED"
else
  echo "Day 200 validation FAILED"
  exit 1
fi
