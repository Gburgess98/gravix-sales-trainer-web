#!/usr/bin/env bash
# Validates the Day 186 CRM detail + secondary CTA cleanup: /crm/accounts/[id]
# primary CTAs standardised to calm indigo, its emerald/cyan-outline *action*
# buttons moved to the neutral secondary style (emerald kept only for status),
# and /crm/contacts/[id] adopting the shared PageHeader. Behaviour preserved,
# no scope creep (no migrations, no TTS/voice-agent).
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
SRC="$WEB_ROOT/src"
ACC="$SRC/app/crm/accounts/[id]/page.tsx"
CON="$SRC/app/crm/contacts/[id]/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 186 — own checks only (use validate-tier-2b-smoke for current smoke)"

grep -q "Day 186" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 186" $?

# --- /crm/accounts/[id]: primary CTAs on calm indigo ---
grep -q '"rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20 transition-colors"' "$ACC" 2>/dev/null
check "/crm/accounts/[id] + Add Contact primary is calm indigo" $?

grep -q "'Adding…' : 'Add Contact'" "$ACC" 2>/dev/null
grep -q 'border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-50' "$ACC" 2>/dev/null
check "/crm/accounts/[id] Add Contact modal submit is calm indigo" $?

# No cyan-outline action buttons remain (the two cyan CTAs were converted).
! grep -q 'bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200' "$ACC" 2>/dev/null
check "/crm/accounts/[id] no cyan primary CTA remains" $?
! grep -q 'bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/20' "$ACC" 2>/dev/null
check "/crm/accounts/[id] Assign Replay off cyan-outline" $?

# Emerald-outline *action* buttons converted to neutral (Complete / Assign Sparring).
! grep -q 'bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20' "$ACC" 2>/dev/null
check "/crm/accounts/[id] emerald-outline action buttons converted to neutral" $?

# Emerald status pill kept (Done span still emerald).
grep -q 'border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 shrink-0' "$ACC" 2>/dev/null
check "/crm/accounts/[id] keeps emerald 'Done' status pill" $?

# Neutral secondary action style present.
grep -q 'border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800' "$ACC" 2>/dev/null
check "/crm/accounts/[id] neutral secondary action style applied" $?

# Behaviour handlers preserved.
for h in completeTask createReplayAssignment createSparringAssignment completeCoachingAction linkContact assignOwner; do
  grep -q "$h" "$ACC" 2>/dev/null
  check "/crm/accounts/[id] preserves $h handler" $?
done

# --- /crm/contacts/[id]: shared PageHeader adopted ---
grep -q 'import { PageHeader }' "$CON" 2>/dev/null
check "/crm/contacts/[id] imports PageHeader" $?
grep -q '<PageHeader' "$CON" 2>/dev/null
check "/crm/contacts/[id] uses PageHeader" $?
! grep -q 'CRM · Contact' "$CON" 2>/dev/null
check "/crm/contacts/[id] redundant 'CRM ·' eyebrow dropped" $?
grep -q 'max-w-6xl' "$CON" 2>/dev/null
check "/crm/contacts/[id] keeps max-w-6xl wrapper" $?
grep -q 'ContactHeaderClient' "$CON" 2>/dev/null
check "/crm/contacts/[id] preserves contact header + sub-components" $?

# --- Scope guards ---
[[ -f "$WEB_ROOT/scripts/validate-tier-2b-smoke.sh" ]]
check "validate-tier-2b-smoke still exists" $?

! grep -rni "elevenlabs\|voice agent\|text-to-speech" "$SRC/app" "$SRC/components" "$SRC/lib" --include='*.ts*' >/dev/null 2>&1
check "no ElevenLabs/TTS/Voice Agent added" $?

! find "$WEB_ROOT/scripts" "$SRC" -iname "*migration*" -o -iname "*migrate*" 2>/dev/null | grep -q .
check "no migration added" $?

if [[ "$fail" == "0" ]]; then
  echo "✅ Day 186 premium UX validation PASSED"
  exit 0
else
  echo "❌ Day 186 premium UX validation FAILED"
  exit 1
fi
