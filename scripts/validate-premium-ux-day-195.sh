#!/usr/bin/env bash
# Validates the Day 195 global Command Centre shell upgrade: Geist body font
# (Arial override removed), depth-model page background with ambient indigo
# glow, translucent blurred shell panels, indigo active nav/tab states,
# card shadows, and the PageContainer max-width clamp.
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

echo "Premium UX / Day 195 — own checks only (use validate-tier-2b-smoke for current smoke)"

# --- Documentation ---
grep -q "Day 195" "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 195" $?
grep -q "Global Command Centre shell upgrade" "$AUDIT" 2>/dev/null
check "audit documents the shell upgrade" $?

# --- Typography: Geist body font, Arial override gone ---
! grep -q 'font-family: Arial' "$SRC/app/globals.css" 2>/dev/null
check "Arial body override removed" $?
grep -q 'var(--font-geist-sans)' "$SRC/app/globals.css" 2>/dev/null
check "body uses Geist font variable" $?
grep -q 'scrollbar-width: thin' "$SRC/app/globals.css" 2>/dev/null
check "thin scrollbars styled" $?

# --- Depth model: shell background + ambient glow ---
grep -q 'bg-\[#060609\]' "$SRC/components/shell/app-shell.tsx" 2>/dev/null
check "shell base is near-black #060609" $?
grep -q 'radial-gradient' "$SRC/components/shell/app-shell.tsx" 2>/dev/null
check "shell has ambient radial glow" $?
! grep -q 'rgba(99,102,241,0.[2-9]' "$SRC/components/shell/app-shell.tsx" 2>/dev/null
check "glow stays subtle (<0.2 alpha)" $?

# --- Shell panels: translucent + blurred ---
grep -q 'bg-neutral-950/70 backdrop-blur-xl' "$SRC/components/shell/sidebar.tsx" 2>/dev/null
check "sidebar is translucent + blurred" $?
grep -q 'bg-neutral-950/70 backdrop-blur-xl' "$SRC/components/shell/topbar.tsx" 2>/dev/null
check "topbar is translucent + blurred" $?

# --- Navigation states: indigo, no emerald ---
grep -q 'bg-indigo-500/10' "$SRC/components/shell/nav-item.tsx" 2>/dev/null
check "active nav item has indigo surface" $?
# Day 203 — loosened to intent: active underline is the brand accent, rendered
# via raw indigo OR the semantic `brand` token (aliases indigo 1:1).
grep -qE 'border-(indigo|brand)-400' "$SRC/components/shell/workspace-tabs.tsx" 2>/dev/null
check "workspace tab active underline is brand (indigo/brand token)" $?
! grep -q 'emerald' "$SRC/components/shell/workspace-tabs.tsx" 2>/dev/null
check "workspace tabs have no emerald" $?

# --- Cards: depth + soft borders, tinted variants untouched ---
grep -q 'shadow-md shadow-black/20' "$SRC/components/ui/section-card.tsx" 2>/dev/null
check "SectionCard has soft shadow" $?
grep -q "border-neutral-800/70 bg-neutral-950" "$SRC/components/ui/section-card.tsx" 2>/dev/null
check "SectionCard default border softened" $?
grep -q 'shadow-md shadow-black/20' "$SRC/components/ui/stat-card.tsx" 2>/dev/null
check "StatCard has soft shadow" $?
# Day 203 — loosened to intent (indigo OR brand token, aliases indigo 1:1).
grep -qE "ai: 'border-(indigo|brand)-500/20 bg-(indigo|brand)-500/5'" "$SRC/components/ui/stat-card.tsx" 2>/dev/null
check "StatCard ai variant is brand (indigo/brand token)" $?

# --- Layout: PageContainer clamp ---
grep -q 'max-w-\[1400px\]' "$SRC/components/layout/page-container.tsx" 2>/dev/null
check "PageContainer clamps at 1400px" $?
grep -q 'mx-auto' "$SRC/components/layout/page-container.tsx" 2>/dev/null
check "PageContainer centres content" $?

if [[ "$fail" == "0" ]]; then
  echo "Day 195 validation PASSED"
else
  echo "Day 195 validation FAILED"
  exit 1
fi
