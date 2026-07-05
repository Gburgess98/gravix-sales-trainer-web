#!/usr/bin/env bash
# Validates the Day 182 CRM + Upload consistency pass: shared
# PageContainer/PageHeader adopted on /crm/accounts, PageHeader adopted on
# /upload (without disrupting its max-w-5xl two-column layout), primary CRM
# CTAs standardised to calm indigo, the raw manager_queue token softened, and
# all upload behaviour preserved (create-new-client link, pickers, upload flow,
# post-upload actions) with no scope creep (no migrations, no TTS/voice-agent).
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
SRC="$WEB_ROOT/src"
ACCOUNTS="$SRC/app/crm/accounts/page.tsx"
UPLOAD="$SRC/app/upload/page.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 182 — own checks only (use validate-tier-2b-smoke for current smoke)"

grep -q "Day 182" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 182" $?

# --- /crm/accounts: shared layout adopted ---
grep -q "PageContainer" "$ACCOUNTS" 2>/dev/null
check "/crm/accounts uses PageContainer" $?

grep -q "PageHeader" "$ACCOUNTS" 2>/dev/null
check "/crm/accounts uses PageHeader" $?

# Redundant CRM eyebrow dropped (sidebar provides context).
! grep -q 'tracking-\[0.12em\] text-neutral-500">\s*$' "$ACCOUNTS" 2>/dev/null
# (loose) the standalone "CRM" eyebrow line should be gone.
! grep -qE '>\s*CRM\s*<' "$ACCOUNTS" 2>/dev/null
check "/crm/accounts CRM eyebrow dropped" $?

# Primary create CTAs moved to indigo standard.
grep -q "border-indigo-500/20 bg-indigo-600/20" "$ACCOUNTS" 2>/dev/null
check "/crm/accounts primary CTAs use calm indigo standard" $?

# New Account button is no longer cyan (primary CTA de-cyaned).
! grep -q "border-cyan-500/30 bg-cyan-500/10 px-4 text-xs font-semibold text-cyan-200" "$ACCOUNTS" 2>/dev/null
check "/crm/accounts New Account button no longer cyan" $?

# Raw internal escalation token softened.
! grep -q "'manager_queue'" "$ACCOUNTS" 2>/dev/null
check "/crm/accounts raw manager_queue token softened" $?
grep -q "'Manager queue'" "$ACCOUNTS" 2>/dev/null
check "/crm/accounts shows readable 'Manager queue' fallback" $?

# --- /upload: PageHeader adopted, two-column layout preserved ---
grep -q "PageHeader" "$UPLOAD" 2>/dev/null
check "/upload uses PageHeader" $?

grep -q "max-w-5xl" "$UPLOAD" 2>/dev/null
check "/upload keeps max-w-5xl wrapper (two-column layout preserved)" $?

grep -q "lg:grid-cols-3" "$UPLOAD" 2>/dev/null
check "/upload keeps two-column form/guidance grid" $?

# Upload primary CTA still calm indigo.
grep -q "bg-indigo-500" "$UPLOAD" 2>/dev/null
check "/upload primary CTA still calm indigo" $?

# --- Preserved behaviour on /upload ---
grep -q "Create new client" "$UPLOAD" 2>/dev/null
check "/upload preserves Create new client link" $?

grep -q "signedInitUpload\|finalizeSignedUpload" "$UPLOAD" 2>/dev/null
check "/upload preserves signed-upload flow" $?

grep -q "onSelectRep" "$UPLOAD" 2>/dev/null
check "/upload preserves rep picker" $?

grep -q "listUploadAccounts" "$UPLOAD" 2>/dev/null
check "/upload preserves account picker" $?

grep -q "CALL_TYPES" "$UPLOAD" 2>/dev/null
check "/upload preserves call type" $?

grep -q "Open Review Queue" "$UPLOAD" 2>/dev/null
check "/upload preserves post-upload actions" $?

# --- Scope guards ---
[[ -f "$WEB_ROOT/scripts/validate-tier-2b-smoke.sh" ]]
check "validate-tier-2b-smoke still exists" $?

! grep -rni "elevenlabs\|voice agent\|text-to-speech" "$SRC/app" "$SRC/components" "$SRC/lib" --include='*.ts*' >/dev/null 2>&1
check "no ElevenLabs/TTS/Voice Agent added" $?

! find "$WEB_ROOT/scripts" "$SRC" -iname "*migration*" -o -iname "*migrate*" 2>/dev/null | grep -q .
check "no migration added" $?

if [[ "$fail" == "0" ]]; then
  echo "✅ Day 182 premium UX validation PASSED"
  exit 0
else
  echo "❌ Day 182 premium UX validation FAILED"
  exit 1
fi
