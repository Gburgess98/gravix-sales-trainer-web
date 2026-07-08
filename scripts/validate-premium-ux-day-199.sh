#!/usr/bin/env bash
# Validates the Day 199 call library / sparring visual pass: /call-library
# adopts the shared Command Centre system (WorkspaceTabs with indigo active,
# SectionCard bodies on all three tabs, indigo tonal active filter chips,
# EmptyState empty states, Day 198 Button/buttonClasses for simple actions)
# and the SparringStartButton modal loses its emerald arcade accents
# (indigo selection/focus, primary Begin). Behaviour untouched: ?tab= deep
# link, filters, sort, cursor pagination, polling, session POST + redirect.
# WEB-only, patch mode — no API, no migrations, no new features.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
SRC="$WEB_ROOT/src"
LIB="$SRC/app/call-library/page.tsx"
SPAR="$SRC/components/SparringStartButton.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 199 — own checks only (use validate-tier-2b-smoke for current smoke)"

# --- Documentation ---
grep -q "Day 199" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 199" $?

# --- Shared system adoption on /call-library ---
grep -q 'import { WorkspaceTabs } from "@/components/shell/workspace-tabs"' "$LIB" 2>/dev/null
check "call-library imports WorkspaceTabs" $?
grep -q 'WorkspaceTabs<Tab>' "$LIB" 2>/dev/null
check "tab bar rendered via WorkspaceTabs" $?
grep -q 'SectionCard, EmptyState, Button, buttonClasses } from "@/components/ui"' "$LIB" 2>/dev/null
check "call-library imports SectionCard/EmptyState/Button/buttonClasses" $?
LIB_CARDS=$(grep -c '<SectionCard' "$LIB" 2>/dev/null || echo 0)
[[ "$LIB_CARDS" -ge 3 ]]
check "all three tab bodies use SectionCard (>=3, got $LIB_CARDS)" $?
grep -q 'title="Latest analysed calls"' "$LIB" 2>/dev/null
check "live tab card titled Latest analysed calls" $?
grep -q 'title="Recent sparring sessions"' "$LIB" 2>/dev/null
check "sparring tab card titled Recent sparring sessions" $?
grep -q 'title="Uploaded calls"' "$LIB" 2>/dev/null
check "uploads tab card titled Uploaded calls" $?
LIB_EMPTY=$(grep -c '<EmptyState' "$LIB" 2>/dev/null || echo 0)
[[ "$LIB_EMPTY" -ge 3 ]]
check "EmptyState adopted for empty states (>=3, got $LIB_EMPTY)" $?

# --- Chip system: white-active inversion gone, indigo tonal in ---
! grep -q 'border-neutral-100 bg-neutral-100 text-neutral-900' "$LIB" 2>/dev/null
check "white-active chip inversion removed" $?
LIB_CHIPS=$(grep -c 'border-indigo-500/40 bg-indigo-500/15 font-medium text-indigo-200' "$LIB" 2>/dev/null || echo 0)
[[ "$LIB_CHIPS" -ge 3 ]]
check "active chips use indigo tonal recipe (>=3, got $LIB_CHIPS)" $?

# --- Day 198 Button adoption ---
grep -q 'buttonClasses("secondary", "sm", "whitespace-nowrap")' "$LIB" 2>/dev/null
check "row Open links use buttonClasses secondary" $?
grep -q '<Button' "$LIB" 2>/dev/null
check "call-library adopted Button" $?
! grep -q 'text-xs text-neutral-200 underline' "$LIB" 2>/dev/null
check "underlined Open link recipe gone" $?

# --- Sparring modal calmed (indigo, no emerald arcade accents) ---
grep -q 'import { Button } from "@/components/ui/button"' "$SPAR" 2>/dev/null
check "SparringStartButton imports Button" $?
! grep -Eq 'emerald' "$SPAR" 2>/dev/null
check "zero emerald classes in SparringStartButton" $?
grep -q '<Button variant="primary" onClick={beginSession} disabled={busy}>' "$SPAR" 2>/dev/null
check "modal Begin is primary Button with handler + disabled" $?
grep -q 'focus:border-indigo-500' "$SPAR" 2>/dev/null
check "modal inputs focus indigo" $?

# --- Status colours stay status-only ---
grep -q 'return "bg-emerald-400";' "$LIB" 2>/dev/null
check "emerald retained for scored status dot only" $?
LIB_EMERALD=$(grep -c 'emerald' "$LIB" 2>/dev/null || echo 0)
[[ "$LIB_EMERALD" -le 1 ]]
check "no other emerald usage on call-library (<=1, got $LIB_EMERALD)" $?
! grep -Eq 'fuchsia|pink-' "$LIB" 2>/dev/null
check "no fuchsia/pink on call-library" $?

# --- Behaviour preserved (spot checks) ---
grep -q 'if (t === "live" || t === "sparring" || t === "upload") setTab(t);' "$LIB" 2>/dev/null
check "?tab= deep-link read intact" $?
grep -q 'onChange={setTab}' "$LIB" 2>/dev/null
check "tab switching wired to setTab" $?
grep -q 'disabled={!cursor || loadingMore}' "$LIB" 2>/dev/null
check "load-more disabled expression intact" $?
grep -q 'onClick={loadMore}' "$LIB" 2>/dev/null
check "load-more handler intact" $?
grep -q 'onClick={() => setScoreFilter(opt.id as ScoreFilter)}' "$LIB" 2>/dev/null
check "score band filter handler intact" $?
grep -q 'onClick={() => setStatusFilter(opt.id as StatusFilter)}' "$LIB" 2>/dev/null
check "status filter handler intact" $?
grep -q 'window.location.href = `/calls/${c.id}?crm=1`;' "$LIB" 2>/dev/null
check "Open + link CRM handler intact" $?
grep -q 'personaId={sparPersona}' "$LIB" 2>/dev/null
check "SparringStartButton persona wiring intact" $?
grep -q 'href={`/sparring/${s.id}`}' "$LIB" 2>/dev/null
check "sparring session links intact" $?
grep -q 'action={{ label: "Upload a call", href: "/upload" }}' "$LIB" 2>/dev/null
check "empty-state Upload CTA points at /upload" $?

if [[ "$fail" == "0" ]]; then
  echo "Day 199 validation PASSED"
else
  echo "Day 199 validation FAILED"
  exit 1
fi
