#!/usr/bin/env bash
# Validates the Gravix Design System foundation (Day 187 brief, executed Day
# 231): GRAVIX_DESIGN_SYSTEM.md exists with every required section, and the
# live foundation it documents still holds — semantic tokens, the Button
# recipes, PageContainer width, status-only badge colour, and no arcade
# colour in the shared UI. Docs + comments only: this pass changes no
# behaviour, so the checks are pins, not migrations.
# WEB-only. Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke

set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOC="$WEB_ROOT/GRAVIX_DESIGN_SYSTEM.md"
CSS="$WEB_ROOT/src/app/globals.css"
BTN="$WEB_ROOT/src/components/ui/button.tsx"
CARD="$WEB_ROOT/src/components/ui/section-card.tsx"
BADGE="$WEB_ROOT/src/components/ui/status-badge.tsx"
CONTAINER="$WEB_ROOT/src/components/layout/page-container.tsx"
HEADER="$WEB_ROOT/src/components/layout/page-header.tsx"
EMPTY="$WEB_ROOT/src/components/ui/empty-state.tsx"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
PKG="$WEB_ROOT/package.json"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fi
  [[ "$ok" == "0" ]] || fail=1
}

echo "Design System / Day 187 foundation (own checks only)"

# --- The doc exists with every required section ------------------------------
test -f "$DOC"; check "GRAVIX_DESIGN_SYSTEM.md exists" $?

ok=0
for section in \
  "Visual direction" "Typography" "Spacing and page width" "Colour tokens" \
  "CTA hierarchy" "Card hierarchy" "Badges and status" "Tables and lists" \
  "Empty states" "Form fields" "theme direction" "What not to do"; do
  grep -qi "## .*$section" "$DOC" || ok=1
done
check "doc carries all twelve required sections" $ok

grep -q 'Command Centre' "$DOC"
check "doc names the Command Centre visual direction" $?

grep -q 'status only' "$DOC" || grep -q 'status-only' "$DOC"
check "doc states the success/emerald status-only rule" $?

grep -q 'ONE primary per view' "$BTN" && grep -qi 'one per\|one primary' "$DOC"
check "one-primary-CTA rule stated in doc and Button primitive" $?

grep -q 'GRAVIX_DESIGN_SYSTEM.md' "$CSS"
check "globals.css points at the design system doc" $?

# --- The foundation the doc documents still holds ----------------------------
ok=0
for role in brand success warning danger; do
  grep -q -- "--color-$role-500" "$CSS" || ok=1
done
check "semantic colour roles still defined in @theme" $ok

grep -q "export const Button" "$BTN" && grep -q "export function buttonClasses" "$BTN"
check "Button + buttonClasses primitive intact" $?

ok=0
for v in primary secondary ghost danger; do
  grep -q "$v:" "$BTN" || ok=1
done
check "the four Button recipes intact" $?

grep -q 'max-w-\[1400px\]' "$CONTAINER"
check "PageContainer page width unchanged" $?

grep -q 'text-xl font-semibold tracking-tight text-white' "$HEADER"
check "PageHeader title scale unchanged" $?

grep -q "border-success-500/30 bg-success-500/10 text-success-300" "$BADGE"
check "status badges still colour via semantic tokens" $?

grep -q "padded" "$CARD" && grep -q "'default' | 'ai'" "$CARD"
check "SectionCard variants + padded prop intact" $?

test -f "$EMPTY"
check "EmptyState primitive intact" $?

# --- No arcade colour in the shared UI ---------------------------------------
if grep -rqiE 'fuchsia|purple|pink|violet' "$WEB_ROOT/src/components/ui" \
     "$WEB_ROOT/src/components/layout" 2>/dev/null; then false; else true; fi
check "no arcade colour in shared UI or layout primitives" $?

# --- Wiring -------------------------------------------------------------------
grep -q '"validate-design-system-day-187"' "$PKG"
check "package script registered" $?

grep -q 'GRAVIX_DESIGN_SYSTEM' "$AUDIT"
check "PREMIUM_UX_AUDIT.md records the design system foundation" $?

echo
if [[ "$fail" == "0" ]]; then
  echo "Design system Day 187 validation PASSED"
else
  echo "Design system Day 187 validation FAILED"
  exit 1
fi
