#!/usr/bin/env bash
# Validates the Day 187 CRM manager-surfaces consistency pass: primary/secondary
# action buttons on the active manager surfaces standardised to calm indigo
# (emerald/cyan kept for status only), headers normalised to the PageHeader
# scale, and the Team page adopting the shared PageContainer/PageHeader.
# WEB-only, patch mode — no API, no migrations, no new features.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
SRC="$WEB_ROOT/src"
MGR="$SRC/app/crm/manager/page.tsx"
MGRCLIENT="$SRC/app/crm/manager/ManagerClient.tsx"
CONTACTS="$SRC/app/crm/manager/contacts/ManagerContactsClient.tsx"
NUDGES="$SRC/app/crm/manager/nudges/page.tsx"
OVERVIEW="$SRC/app/crm/overview/page.tsx"
PIPELINE="$SRC/app/crm/pipeline/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 187 — own checks only (use validate-tier-2b-smoke for current smoke)"

grep -q "Day 187" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 187" $?

# --- /crm/manager: shared PageContainer + PageHeader adopted ---
grep -q 'import { PageContainer }' "$MGR" 2>/dev/null
check "/crm/manager imports PageContainer" $?
grep -q 'import { PageHeader }' "$MGR" 2>/dev/null
check "/crm/manager imports PageHeader" $?
grep -q '<PageContainer>' "$MGR" 2>/dev/null
check "/crm/manager uses PageContainer" $?
grep -q '<PageHeader' "$MGR" 2>/dev/null
check "/crm/manager uses PageHeader" $?
grep -q 'ManagerClient' "$MGR" 2>/dev/null
check "/crm/manager preserves ManagerClient render" $?

# --- ManagerClient: batch-assign action off emerald, onto indigo ---
grep -q 'bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500' "$MGRCLIENT" 2>/dev/null
check "ManagerClient 'Run batch assign' is indigo" $?
! grep -q 'bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500' "$MGRCLIENT" 2>/dev/null
check "ManagerClient no emerald action button remains" $?
grep -q 'runBatchAssign' "$MGRCLIENT" 2>/dev/null
check "ManagerClient preserves runBatchAssign handler" $?

# --- /crm/manager/contacts: cyan primary action -> calm indigo ---
grep -q 'border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20 transition-colors' "$CONTACTS" 2>/dev/null
check "/crm/manager/contacts + New Contact is calm indigo" $?
! grep -q 'border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200' "$CONTACTS" 2>/dev/null
check "/crm/manager/contacts no cyan primary CTA remains" $?
! grep -q 'Contact creation requires backend endpoint' "$CONTACTS" 2>/dev/null
check "/crm/manager/contacts raw modal copy softened" $?
grep -q 'setCreateOpen' "$CONTACTS" 2>/dev/null
check "/crm/manager/contacts preserves create modal" $?

# --- Header scale / eyebrow normalisation ---
grep -q '<h1 className="text-xl font-semibold">Manager Nudges</h1>' "$NUDGES" 2>/dev/null
check "/crm/manager/nudges header dropped 'CRM ·' prefix" $?
grep -q '<h1 className="text-xl font-semibold">Overview</h1>' "$OVERVIEW" 2>/dev/null
check "/crm/overview header text-xl, 'CRM ·' prefix dropped" $?
! grep -q 'CRM · Overview' "$OVERVIEW" 2>/dev/null
check "/crm/overview no 'CRM · Overview' remains" $?
grep -q 'max-w-5xl' "$OVERVIEW" 2>/dev/null
check "/crm/overview keeps centred max-w-5xl wrapper" $?
grep -q '<h1 className="text-xl font-semibold tracking-tight">Pipeline</h1>' "$PIPELINE" 2>/dev/null
check "/crm/pipeline header normalised to text-xl" $?

# --- Scope guards ---
[[ -f "$WEB_ROOT/scripts/validate-tier-2b-smoke.sh" ]]
check "validate-tier-2b-smoke still exists" $?

! grep -rni "elevenlabs\|voice agent\|text-to-speech" "$SRC/app" "$SRC/components" "$SRC/lib" --include='*.ts*' >/dev/null 2>&1
check "no ElevenLabs/TTS/Voice Agent added" $?

! find "$WEB_ROOT/scripts" "$SRC" -iname "*migration*" -o -iname "*migrate*" 2>/dev/null | grep -q .
check "no migration added" $?

if [[ "$fail" == "0" ]]; then
  echo "✅ Day 187 premium UX validation PASSED"
  exit 0
else
  echo "❌ Day 187 premium UX validation FAILED"
  exit 1
fi
