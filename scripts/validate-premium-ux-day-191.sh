#!/usr/bin/env bash
# Validates the Day 191 CRM dead-client cleanup: the two confirmed orphaned,
# never-imported client components removed, with the live self-contained
# /crm/actions + /crm/pipeline routes preserved and no stale references left.
# WEB-only, patch mode — no API, no migrations, no new features, no behaviour change.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
SRC="$WEB_ROOT/src"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 191 — own checks only (use validate-tier-2b-smoke for current smoke)"

grep -q "Day 191" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 191" $?

# --- Orphaned client components removed ---
[[ ! -e "$SRC/app/crm/actions/ActionsClient.tsx" ]]
check "crm/actions/ActionsClient.tsx removed" $?
[[ ! -e "$SRC/app/crm/pipeline/PipelineClient.tsx" ]]
check "crm/pipeline/PipelineClient.tsx removed" $?

# --- No stale references to the deleted basenames anywhere in src ---
! grep -rn 'ActionsClient' "$SRC" --include='*.ts' --include='*.tsx' | grep -q .
check "no stale ActionsClient references remain" $?
! grep -rn 'PipelineClient' "$SRC" --include='*.ts' --include='*.tsx' | grep -q .
check "no stale PipelineClient references remain" $?

# --- Live routes preserved ---
[[ -f "$SRC/app/crm/actions/page.tsx" ]]
check "live /crm/actions page.tsx preserved" $?
[[ -f "$SRC/app/crm/pipeline/page.tsx" ]]
check "live /crm/pipeline page.tsx preserved" $?
grep -q 'completeAction' "$SRC/app/crm/actions/page.tsx" 2>/dev/null
check "/crm/actions keeps completeAction handler" $?
grep -q 'export default function PipelinePage' "$SRC/app/crm/pipeline/page.tsx" 2>/dev/null
check "/crm/pipeline keeps its live page component" $?

# --- Scope guards ---
[[ -f "$WEB_ROOT/scripts/validate-tier-2b-smoke.sh" ]]
check "validate-tier-2b-smoke still exists" $?

! grep -rni "elevenlabs\|voice agent\|text-to-speech" "$SRC/app" "$SRC/components" "$SRC/lib" --include='*.ts*' >/dev/null 2>&1
check "no ElevenLabs/TTS/Voice Agent added" $?

! find "$WEB_ROOT/scripts" "$SRC" -iname "*migration*" -o -iname "*migrate*" 2>/dev/null | grep -q .
check "no migration added" $?

if [[ "$fail" == "0" ]]; then
  echo "✅ Day 191 premium UX validation PASSED"
  exit 0
else
  echo "❌ Day 191 premium UX validation FAILED"
  exit 1
fi
