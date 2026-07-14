#!/usr/bin/env bash
# Validates the Day 215 Call Review Intelligence Workspace on /calls/[id]:
#  - hero carries score reasoning ("Why this scored") + honest scoring
#    transparency ("Scored with the Gravix default rubric") + manager
#    next-action strip;
#  - #review is a criteria-style rubric audit (stage rows, verdict chips,
#    evidence from existing rubric notes) — no fake scorecard claims;
#  - Voice Personality Score kept but demoted to a supporting signal;
#  - post-action reframed: no XP tile, UK "Practise" CTA;
#  - all key anchors, drawers, handlers, shortcuts and the audio path
#    preserved; validator-pinned empty-state copy intact;
#  - no arcade/raw copy (Review Bot label, console.debug) and no
#    fuchsia/purple/cyan noise.
# WEB-only, visual-only, no API changes.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CALL="$WEB_ROOT/src/app/calls/[id]/page.tsx"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 215 — call review intelligence workspace (own checks only)"

# --- Hero: score reasoning + transparency + next actions ---
grep -q 'Why this scored' "$CALL"
check "hero has a 'Why this scored' reasoning band" $?

grep -q 'Scored with the Gravix default rubric' "$CALL"
check "honest scoring transparency line (Gravix default rubric)" $?

grep -q 'Next actions' "$CALL"
check "manager next-action strip present" $?

grep -q 'Strongest · ' "$CALL" && grep -q 'Weakest · ' "$CALL"
check "reasoning chips derive strongest/weakest stage" $?

# --- Review audit: criteria rows from the real rubric only ---
grep -q 'Why this call scored' "$CALL"
check "#review leads with 'Why this call scored N/100'" $?

grep -q 'stageVerdict' "$CALL" && grep -q '"Needs work"' "$CALL"
check "criteria rows carry verdict labels (Strong/Developing/Needs work)" $?

grep -q 'rubricStages' "$CALL" && grep -q 'analysis_json?.stages' "$CALL"
check "audit reads existing rubric/analysis stages (current data model)" $?

grep -q 'Evidence: ' "$CALL"
check "stage notes surfaced as labelled evidence" $?

grep -q 'Gravix default rubric' "$CALL"
check "rubric transparency chip present" $?

# No fake scorecard claims — Scorecard Studio is future language only.
if grep -qiE 'custom scorecard|scorecard studio|criterion weight|weighted criteri' "$CALL"; then false; else true; fi
check "no fake custom-scorecard claims on the page" $?

grep -q 'No scored rubric for this call yet.' "$CALL"
check "honest empty state when no rubric exists" $?

# --- Voice Personality Score kept, demoted to supporting signal ---
grep -q 'Voice Personality Score' "$CALL" && grep -q 'Supporting signal' "$CALL"
check "Voice Personality Score kept as supporting signal" $?

if grep -q 'Review Bot' "$CALL"; then false; else true; fi
check "raw 'Review Bot' internal label retired" $?

# --- Post-action: calm, UK spelling, no XP tile ---
if grep -q 'XP gained' "$CALL"; then false; else true; fi
check "arcade XP tile removed" $?

grep -q 'Practise this next' "$CALL"
check "practise CTA uses UK spelling" $?

grep -q '/sparring/default' "$CALL"
check "practise CTA keeps the /sparring/default deep link" $?

# --- Anchors + section nav preserved ---
ok=0
for a in summary review transcript player pins whisperer-moments coach crm assign-form; do
  grep -q "id=\"$a\"" "$CALL" || ok=1
done
check "all section anchors preserved (summary/review/transcript/player/pins/whisperer-moments/coach/crm/assign-form)" $ok

grep -q "\['summary', 'review', 'transcript', 'player', 'crm', 'coach'\]" "$CALL"
check "IntersectionObserver section list unchanged" $?

# --- Drawers, shortcuts, handlers preserved ---
grep -q 'CRM DRAWER' "$CALL" && grep -q 'COACH DRAWER' "$CALL"
check "CRM and Coach drawers still present" $?

grep -q 'openCrm' "$CALL" && grep -q 'openCoach' "$CALL" && grep -q 'closeCrm' "$CALL" && grep -q 'closeCoach' "$CALL"
check "drawer open/close handlers preserved" $?

grep -q '"keydown", onKey' "$CALL"
check "c/a keyboard shortcuts preserved" $?

grep -q 'markCallReviewed' "$CALL" && grep -q 'assignCoachingFromCall' "$CALL" && grep -q 'onSaveAssign' "$CALL"
check "Mark Reviewed / Assign Coaching / Save Assignment handlers preserved" $?

grep -q 'markMomentOutcome' "$CALL" && grep -q 'whisperer-triggers' "$CALL"
check "Whisperer moments + outcome marking preserved" $?

grep -q 'onCreatePin' "$CALL" && grep -q 'refreshPins' "$CALL" && grep -q 'deletePin' "$CALL"
check "pin create/refresh/delete preserved" $?

grep -q 'unlink("contact")' "$CALL" && grep -q 'linkContactId' "$CALL" && grep -q 'linkAccountId' "$CALL"
check "CRM link/unlink actions preserved" $?

# --- Audio/player path preserved ---
grep -q 'signed-audio' "$CALL" && grep -q '<audio ref={audioRef}' "$CALL"
check "audio element + signed-audio re-sign path preserved" $?

# --- Pinned empty-state copy intact (Days 171/183, Tier 2B) ---
grep -q 'No pinned coaching notes yet.' "$CALL" && grep -q 'No Whisperer moments linked to this call yet.' "$CALL"
check "validator-pinned empty-state copy intact" $?

# --- Calm palette / no raw copy ---
if grep -qE 'fuchsia|purple|pink-|cyan' "$CALL"; then false; else true; fi
check "no fuchsia/purple/pink/cyan on the page" $?

if grep -q 'console.debug' "$CALL"; then false; else true; fi
check "console.debug removed" $?

# UUIDs never the primary display: human title guard still in place.
grep -q 'formatCallDisplayTitle' "$CALL" && grep -q 'isRawCallLabel' "$CALL"
check "human title guard preserved (no raw filename/UUID as primary display)" $?

# --- Documentation ---
grep -q 'Day 215' "$AUDIT"
check "PREMIUM_UX_AUDIT.md includes the Day 215 section" $?

echo
if [[ "$fail" == "0" ]]; then
  echo "Day 215 validation PASSED"
else
  echo "Day 215 validation FAILED"
  exit 1
fi
