#!/usr/bin/env bash
# Validates the Day 196 coaching Command Centre visual pass: SectionCard
# gained an opt-in `padded` body inset (all 14 coaching cards use it),
# emerald action buttons went indigo, the emerald `coaching` card variant
# was retired to neutral, filter chips went indigo, and the watch band
# aligned to amber. Visual-only — handlers/tabs/filters/data untouched.
# WEB-only, patch mode — no API, no migrations, no new features, no behaviour change.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
SRC="$WEB_ROOT/src"
PAGE="$SRC/app/coaching/page.tsx"
CARD="$SRC/components/ui/section-card.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 196 — own checks only (use validate-tier-2b-smoke for current smoke)"

# --- Documentation ---
grep -q "Day 196" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 196" $?

# --- SectionCard: additive padded prop, default off ---
grep -q 'padded?: boolean' "$CARD" 2>/dev/null
check "SectionCard has padded prop" $?
grep -q 'padded = false' "$CARD" 2>/dev/null
check "padded defaults to false (no change elsewhere)" $?
grep -q "padded ? <div className=\"px-5 py-4\">" "$CARD" 2>/dev/null
check "padded body insets at px-5 py-4" $?

# --- SectionCard: coaching variant retired from emerald ---
grep -q "coaching: 'border-neutral-800/70 bg-neutral-950'" "$CARD" 2>/dev/null
check "coaching variant is neutral" $?
! grep -qE '(border|bg|text)-emerald' "$CARD" 2>/dev/null
check "SectionCard has no emerald classes" $?

# --- Coaching page: all SectionCards padded ---
TOTAL=$(grep -c '<SectionCard' "$PAGE" 2>/dev/null || echo 0)
PADDED=$(grep -c '<SectionCard[^>]*padded' "$PAGE" 2>/dev/null || echo 0)
[[ "$TOTAL" -ge 14 && "$TOTAL" == "$PADDED" ]]
check "all coaching SectionCards use padded ($PADDED/$TOTAL)" $?

# --- Coaching page: no emerald/cyan action buttons ---
! grep -qE 'text-emerald-[0-9]+ hover:bg-emerald' "$PAGE" 2>/dev/null
check "no emerald action buttons remain" $?
grep -q 'font-semibold text-indigo-200 hover:bg-indigo-500/20' "$PAGE" 2>/dev/null
check "assign/complete actions are indigo" $?
! grep -q "border-cyan-500/30 bg-cyan-500/10 text-cyan-200" "$PAGE" 2>/dev/null
check "rep filter chips no longer cyan" $?

# --- Watch band aligned to amber (status consistency) ---
grep -q "watch:     'border-l-\[3px\] border-l-amber-500/50'" "$PAGE" 2>/dev/null
check "watch band border is amber" $?
! grep -q "watch:     'text-cyan-400'" "$PAGE" 2>/dev/null
check "watch band label no longer cyan" $?

# --- Canonical primary CTA ---
grep -q 'rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white' "$PAGE" 2>/dev/null
check "Upload Call CTA uses canonical indigo-600" $?

# --- Rhythm ---
sed -n '/tab === .overview. && (/,+1p' "$PAGE" | grep -q 'space-y-6'
check "overview tab uses space-y-6 rhythm" $?

# --- Behaviour preserved (spot checks) ---
grep -q "onChange={setTab}" "$PAGE" 2>/dev/null
check "tab switching handler intact" $?
grep -q 'markSparringComplete' "$PAGE" 2>/dev/null
check "mark-complete handler intact" $?
grep -q 'assignSparring(' "$PAGE" 2>/dev/null
check "assign-sparring handler intact" $?
grep -q 'openAssignCoaching' "$PAGE" 2>/dev/null
check "assign-coaching handler intact" $?

if [[ "$fail" == "0" ]]; then
  echo "Day 196 validation PASSED"
else
  echo "Day 196 validation FAILED"
  exit 1
fi
