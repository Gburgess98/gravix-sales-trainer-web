#!/usr/bin/env bash
# Validates the Day 230 scorecard list demo hygiene pass:
#  - the Scorecards tab groups its list: active cards first (company default
#    leading), then drafts, with archived cards moved out of the primary list
#    into an "Archived history" section that is collapsed by default;
#  - the collapsed section shows a count, expands on demand, and its cards
#    stay clickable/readable — no restore control, no delete control, no
#    destructive endpoint anywhere in the studio;
#  - honest group copy: what active, draft and archived cards each mean for
#    scoring, plus the main "define what Gravix marks calls against" framing;
#  - selection safety: an archived selection auto-expands the history section
#    so the collapse never hides the open card;
#  - empty states: no noisy archive section when nothing is archived, and a
#    calm primary empty state when only archived cards remain;
#  - every Day 227–229 safeguard is re-asserted unchanged: real endpoints
#    only, draft-only editing, confirmed activation, replace_conflicts never
#    automatic, archive only for never-active cards, Day 229 builder intact,
#    no AI Builder / Autofill / custom stages.
# WEB-only: no API changes, no scoring changes, no data-model changes.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke

set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SC="$WEB_ROOT/src/app/intelligence/ScorecardsTab.tsx"
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

echo "Premium UX / Day 230 — scorecard list demo hygiene (own checks only)"

# --- Grouping ----------------------------------------------------------------
test -f "$SC"; check "Scorecards tab exists" $?

grep -q 'const archivedItems = items.filter((i) => i.status === "archived")' "$SC" &&
  grep -q 'const primaryItems = items.filter((i) => i.status !== "archived")' "$SC"
check "list splits into primary and archived groups" $?

grep -q 'const activeItems = primaryItems' "$SC" &&
  grep -q 'const draftItems = primaryItems.filter((i) => !i.active_version)' "$SC"
check "primary group splits into active and draft sub-groups" $?

grep -q 'Number(b.is_company_default) - Number(a.is_company_default)' "$SC"
check "company default sorts first among active cards" $?

grep -q '{activeItems.map(renderCard)}' "$SC" && grep -q '{draftItems.map(renderCard)}' "$SC"
check "primary list renders active then drafts" $?

# The primary list must never render the unfiltered items array.
if code_of "$SC" | grep -q '{items.map(renderCard)}'; then false; else true; fi
check "archived cards are not in the primary list" $?

# --- Archived history: collapsed by default ----------------------------------
grep -q 'const \[archiveOpen, setArchiveOpen\] = useState(false)' "$SC"
check "Archived history is collapsed by default" $?

grep -q 'title="Archived history"' "$SC"
check "Archived history section exists" $?

grep -q '{archivedItems.length > 0 && (' "$SC"
check "archive section only renders when something is archived" $?

grep -q 'Show ${archivedItems.length} archived' "$SC"
check "collapsed state shows the archived count" $?

grep -q '{archivedItems.map(renderCard)}' "$SC"
check "expanded archive renders the same clickable card rows" $?

# --- No restore / no delete / no destruction ----------------------------------
# Controls and handlers only — the editor's honest "there's no un-archive in
# this release" warning copy is allowed (it states the absence, Day 227).
ok=0
for f in "$SC" "$EDITOR" "$APILIB"; do
  if code_of "$f" | grep -qiE 'restoreScorecard|unarchiveScorecard|reactivateScorecard|onRestore|handleRestore'; then ok=1; fi
  if code_of "$f" | grep -qE '<button[^>]*>[[:space:]]*(Restore|Un-?archive|Reactivate|Bring back)'; then ok=1; fi
done
check "no restore / un-archive fake control" $ok

ok=0
for f in "$SC" "$EDITOR" "$APILIB"; do
  if code_of "$f" | grep -qE 'method: "DELETE"'; then ok=1; fi
done
check "no DELETE request anywhere in the studio" $ok

ok=0
for f in "$SC" "$EDITOR"; do
  if code_of "$f" | grep -qE '<button[^>]*>[[:space:]]*(Delete|Remove card|Destroy)'; then ok=1; fi
done
check "no destructive delete control rendered" $ok

# --- Honest copy ---------------------------------------------------------------
grep -q 'Scorecards define what Gravix marks calls against' "$SC"
check "main section copy frames what scorecards do" $?

grep -q 'Active scorecards affect future scoring.' "$SC"
check "active group copy present" $?

grep -q 'Drafts do not affect scoring until activated.' "$SC"
check "draft group copy present" $?

grep -q 'Archived scorecards stay available for history, but do not affect future scoring.' "$SC"
check "archived history copy present" $?

grep -q 'function GroupHeading' "$SC"
check "group copy renders as list headings, not buried prose" $?

# --- Selection safety ----------------------------------------------------------
grep -q 'i.id === openId && i.status === "archived"' "$SC" &&
  grep -q 'setArchiveOpen(true)' "$SC"
check "an archived selection auto-expands Archived history" $?

# --- Empty states ----------------------------------------------------------------
grep -q 'No company scorecards yet' "$SC"
check "first-run empty state preserved" $?

grep -q 'No active or draft scorecards' "$SC"
check "only-archived-left empty state exists" $?

# --- Read views stay read-only, real endpoints only ----------------------------
grep -q 'proxyFetch(`/v1/intelligence/scorecards`' "$SC" &&
  grep -q 'proxyFetch(`/v1/intelligence/scorecards/${id}`' "$SC"
check "Scorecards tab still reads the real endpoints via proxyFetch" $?

if code_of "$SC" | grep -qE 'method: "(POST|PUT|PATCH|DELETE)"'; then false; else true; fi
check "Scorecards tab still issues no mutating request" $?

if code_of "$SC" | grep -qE '/activate|/archive|/fork|/versions/'; then false; else true; fi
check "no activate/archive/fork endpoints wired from the read views" $?

if code_of "$SC" | grep -qE '<textarea|<input'; then false; else true; fi
check "read views still render no editor fields" $?

# --- Day 229 builder intact ------------------------------------------------------
grep -q 'function WeightStrip' "$EDITOR" &&
  grep -q 'function toggleChipClass' "$EDITOR" &&
  grep -q 'function CriterionRow' "$EDITOR"
check "Day 229 builder surfaces unchanged (strip/chips/rows)" $?

grep -q 'if (!replaceArmed) return' "$EDITOR" &&
  [ "$(grep -c 'replace_conflicts: true' "$EDITOR")" = "1" ]
check "replace_conflicts still gated behind the armed second confirmation" $?

grep -q 'opts.replace_conflicts === true' "$APILIB"
check "mutation client still never defaults replace_conflicts" $?

grep -q 'function ActivateModal' "$EDITOR" && grep -q 'function ArchiveModal' "$EDITOR"
check "activation and archive confirmations preserved" $?

grep -q 'card.status === "draft" && (' "$EDITOR"
check "archive still only offered for never-active cards" $?

if grep -q 'if (card.status === "archived") return null' "$EDITOR"; then true; else false; fi
check "archived cards still get no workbench — read-only history" $?

# --- No fakery -------------------------------------------------------------------
ok=0
for f in "$SC" "$EDITOR" "$APILIB"; do
  if code_of "$f" | grep -qiE 'autofill|auto-fill|ai builder|build with ai|generate with ai'; then ok=1; fi
done
check "no AI Builder / Autofill controls" $ok

ok=0
for f in "$SC" "$EDITOR"; do
  if code_of "$f" | grep -qiE 'addStage|newStage|createStage|removeStage|custom stage'; then ok=1; fi
done
check "no custom stage editor" $ok

ok=0
for f in "$SC" "$EDITOR"; do
  if grep -qE 'fuchsia|purple-|pink-|cyan-[0-9]|emerald' "$f"; then ok=1; fi
done
check "no arcade colour introduced" $ok

# --- Documentation ----------------------------------------------------------------
grep -q 'Day 230' "$AUDIT"
check "PREMIUM_UX_AUDIT.md includes the Day 230 section" $?

grep -q 'Day 230' "$QA"
check "DEMO_VISUAL_QA_NOTES.md carries the Day 230 checklist" $?

echo
if [[ "$fail" == "0" ]]; then
  echo "Day 230 validation PASSED"
else
  echo "Day 230 validation FAILED"
  exit 1
fi
