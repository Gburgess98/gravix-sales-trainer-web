#!/usr/bin/env bash
# Validates the Day 197 call review workspace visual pass: /calls/[id]
# aligned to the Command Centre shell (1400px clamp, indigo section nav),
# five bare sections adopted SectionCard (Player/Pins/Whisperer/Coach/CRM),
# noisy white/emerald/solid-red actions moved to the indigo/neutral system,
# and green/amber/red stayed status-only. Visual-only — handlers, drawers,
# pins, assignments, moment outcomes, and CRM link flows untouched.
# WEB-only, patch mode — no API, no migrations, no new features, no behaviour change.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
PAGE="$WEB_ROOT/src/app/calls/[id]/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 197 — own checks only (use validate-tier-2b-smoke for current smoke)"

# --- Documentation ---
grep -q "Day 197" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 197" $?

# --- Shell alignment ---
grep -q 'max-w-\[1400px\] px-6 py-6 lg:px-8' "$PAGE" 2>/dev/null
check "main clamps to 1400px shell width" $?
grep -q 'ds-glass rounded-\[var(--ds-radius-card)\] p-2' "$PAGE" 2>/dev/null
check "section nav is a glass aside matching the shell (glass system v2; was sticky pill bar)" $?
grep -q 'bg-white/\[0.08\] text-\[var(--ds-text)\]' "$PAGE" 2>/dev/null
check "active section link is a quiet tonal fill (glass system v2; was indigo pill)" $?
! grep -q '"bg-neutral-100 text-neutral-900"' "$PAGE" 2>/dev/null
check "white active pill removed" $?

# --- SectionCard adoption ---
# Day 198 loosened this from the exact named-import list to the intent
# (SectionCard imported from the ui barrel) — Day 198 added Button imports.
grep -qE 'import \{[^}]*Panel[^}]*PanelHeader[^}]*\} from "@/components/ds"' "$PAGE" 2>/dev/null
check "ds Panel/PanelHeader imported (glass redesign; was SectionCard)" $?
CARDS=$(grep -c '<PanelHeader' "$PAGE" 2>/dev/null || echo 0)
[[ "$CARDS" -ge 5 ]]
check "at least 5 ds Panels adopted ($CARDS; glass redesign, was SectionCards)" $?
grep -q 'title="Call recording"' "$PAGE" 2>/dev/null
check "Player section is a SectionCard" $?
grep -q 'title="Whisperer moments"' "$PAGE" 2>/dev/null
check "Whisperer moments is a ds Panel (glass redesign; was ai variant)" $?
grep -q 'title="Linked records"' "$PAGE" 2>/dev/null
check "CRM section is a SectionCard" $?

# --- Section anchors preserved for nav/observer ---
for id in summary review transcript player pins whisperer-moments coach crm; do
  grep -q "id=\"$id\"" "$PAGE" 2>/dev/null
  check "section anchor #$id preserved" $?
done

# --- Noisy colour cleanup ---
! grep -q 'bg-white px-4 py-2 text-sm font-semibold text-black' "$PAGE" 2>/dev/null
check "Practice-now CTA no longer white" $?
! grep -q 'bg-white text-black' "$PAGE" 2>/dev/null
check "CRM drawer Link button no longer white" $?
! grep -q 'bg-red-600 hover:bg-red-500' "$PAGE" 2>/dev/null
check "coach drawer Remove no longer solid red" $?
# emerald stays for status (trend line, Reviewed chip/note) but not actions
! grep -q 'border-neutral-800 text-emerald-400' "$PAGE" 2>/dev/null
check "Create-contact action no longer emerald" $?
grep -B2 'Create contact: {q}' "$PAGE" 2>/dev/null | grep -q 'text-indigo-300'
check "Create-contact action is indigo" $?
! grep -q 'selected ? "border-emerald' "$PAGE" 2>/dev/null
check "moment outcome selection no longer emerald" $?
! grep -q 'bg-zinc-700/30' "$PAGE" 2>/dev/null
check "zinc chips normalised to neutral" $?
# Day 46 refresh: the solid-indigo Practise button was a second primary on the call page. The header now holds the
# single primary (call-review-model); "Practise this next" is the canonical secondary recipe.
grep -q 'className={buttonClasses("secondary", "md")}' "$PAGE" 2>/dev/null && ! grep -q 'bg-indigo-600 px-4 py-2' "$PAGE" 2>/dev/null
check "Practice-now CTA is canonical secondary (Day 46)" $?

# --- Status colours stay status-only ---
grep -q 'border-emerald-400/60 text-emerald-200' "$PAGE" 2>/dev/null
check "score circle keeps emerald for 80+ band" $?
grep -q 'bg-emerald-600/10 text-emerald-300 border-emerald-500/20' "$PAGE" 2>/dev/null
check "transcript Available chip stays emerald (status)" $?

# --- Behaviour preserved (spot checks) ---
grep -q 'onClick={onCreatePin}' "$PAGE" 2>/dev/null
check "pin create handler intact" $?
grep -q 'markMomentOutcome(m.triggerId, b.value)' "$PAGE" 2>/dev/null
check "moment outcome handler intact" $?
grep -q 'onClick={markCallReviewed}' "$PAGE" 2>/dev/null
check "mark-reviewed handler intact" $?
grep -q 'onClick={onSaveAssign}' "$PAGE" 2>/dev/null
check "save-assignment handler intact" $?
grep -q 'unlink("contact")' "$PAGE" 2>/dev/null
check "CRM unlink handler intact" $?
grep -q 'onClick={openCrm}' "$PAGE" 2>/dev/null
check "CRM drawer open handler intact" $?
grep -q 'scrollIntoView({ behavior: "smooth" })' "$PAGE" 2>/dev/null
check "section nav scroll behaviour intact" $?
grep -q '<audio ref={audioRef} src={audioUrl} controls' "$PAGE" 2>/dev/null
check "audio element untouched" $?

if [[ "$fail" == "0" ]]; then
  echo "Day 197 validation PASSED"
else
  echo "Day 197 validation FAILED"
  exit 1
fi
