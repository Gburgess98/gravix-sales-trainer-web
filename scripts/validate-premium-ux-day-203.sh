#!/usr/bin/env bash
# Validates the Day 203 semantic colour-token + validator-pin refresh pass:
# globals.css gains brand/accent/success/warning/danger @theme tokens that
# alias the current Tailwind palette 1:1 (byte-identical rendered output), the
# shared UI components (Button, WorkspaceTabs, AiInsightCard, StatCard,
# StatusBadge, SectionCard) adopt those tokens for their accent/status roles
# while surface stays neutral, and the brittle exact-class pins in the Day
# 194/195/198 validators are loosened to intent-level checks that accept either
# the raw palette word or the token. Foundation/hardening only — no product
# behaviour, routes, API, migrations, features, theme switcher or white-label.
# Own checks only, Day 135 rhythm, no recursive historical chain.
# For current core invariants run: npm run validate-tier-2b-smoke
set -u

WEB_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIT="$WEB_ROOT/PREMIUM_UX_AUDIT.md"
PKG="$WEB_ROOT/package.json"
SRC="$WEB_ROOT/src"
CSS="$SRC/app/globals.css"
BTN="$SRC/components/ui/button.tsx"
TABS="$SRC/components/shell/workspace-tabs.tsx"
INSIGHT="$SRC/components/ui/ai-insight-card.tsx"
STAT="$SRC/components/ui/stat-card.tsx"
BADGE="$SRC/components/ui/status-badge.tsx"
CARD="$SRC/components/ui/section-card.tsx"

fail=0
check() {
  local label="$1" ok="$2"
  if [[ "$ok" == "0" ]]; then echo "OK    $label"; else echo "FAIL  $label"; fail=1; fi
}

echo "Premium UX / Day 203 — own checks only (use validate-tier-2b-smoke for current smoke)"

# --- Documentation + wiring ---
grep -q 'Semantic colour tokens + validator-pin refresh (Day 203)' "$AUDIT" 2>/dev/null
check "PREMIUM_UX_AUDIT.md includes Day 203 section" $?
grep -q '"validate-premium-ux-day-203"' "$PKG" 2>/dev/null
check "package.json has validate-premium-ux-day-203 script" $?

# --- Token layer: semantic roles alias the palette via var() ---
grep -q '@theme {' "$CSS" 2>/dev/null
check "globals.css declares a @theme token block" $?
grep -q -- '--color-brand-600: var(--color-indigo-600);' "$CSS" 2>/dev/null
check "brand token aliases indigo" $?
grep -q -- '--color-accent-500: var(--color-cyan-500);' "$CSS" 2>/dev/null
check "accent token aliases cyan" $?
grep -q -- '--color-success-500: var(--color-emerald-500);' "$CSS" 2>/dev/null
check "success token aliases emerald" $?
grep -q -- '--color-warning-500: var(--color-amber-500);' "$CSS" 2>/dev/null
check "warning token aliases amber" $?
grep -q -- '--color-danger-500: var(--color-red-500);' "$CSS" 2>/dev/null
check "danger token aliases red" $?
# Every semantic token must resolve to a real palette var (no typo'd alias that
# would render as a missing colour). Each --color-<role>-<n> RHS must be var().
BAD_ALIAS=$(grep -oE -- '--color-(brand|accent|success|warning|danger)-[0-9]+: [^;]+' "$CSS" 2>/dev/null | grep -vE ': var\(--color-(indigo|cyan|emerald|amber|red)-[0-9]+\)' || true)
[[ -z "$BAD_ALIAS" ]]
check "all semantic tokens alias a palette var (no dangling aliases)" $?

# --- Every token shade USED by shared components is DEFINED ---
USED=$(grep -rhoE '(brand|accent|success|warning|danger)-[0-9]+' \
  "$BTN" "$TABS" "$INSIGHT" "$STAT" "$BADGE" "$CARD" 2>/dev/null | sort -u)
missing=""
for tok in $USED; do
  grep -q -- "--color-$tok:" "$CSS" 2>/dev/null || missing="$missing $tok"
done
[[ -z "$missing" ]]
check "every token shade used by components is defined ($([[ -z "$missing" ]] && echo none missing || echo "MISSING:$missing"))" $?

# --- Button primitive migrated to brand/danger, API preserved ---
grep -qE "primary: 'bg-brand-600 font-semibold text-white hover:bg-brand-500'" "$BTN" 2>/dev/null
check "Button primary uses brand token" $?
grep -qE "secondary: 'bg-brand-600/20 font-semibold text-brand-200 hover:bg-brand-600/30'" "$BTN" 2>/dev/null
check "Button secondary uses brand tonal token" $?
grep -q "danger: 'border border-danger-500/30 text-danger-300 hover:bg-danger-500/10'" "$BTN" 2>/dev/null
check "Button danger uses danger token" $?
grep -q "ghost: 'border border-neutral-700 text-neutral-300 hover:bg-neutral-800'" "$BTN" 2>/dev/null
check "Button ghost stays neutral (surface role)" $?
grep -q "'primary' | 'secondary' | 'ghost' | 'danger'" "$BTN" 2>/dev/null
check "Button variant API unchanged" $?
grep -q "export function buttonClasses" "$BTN" 2>/dev/null
check "buttonClasses still exported" $?

# --- Other components migrated to semantic tokens ---
grep -q "border-brand-400 text-white" "$TABS" 2>/dev/null
check "WorkspaceTabs active underline uses brand token" $?
grep -q "border: 'border-brand-500/20 bg-brand-500/5'" "$INSIGHT" 2>/dev/null
check "AiInsightCard summary uses brand token" $?
grep -q "'next-action'" "$INSIGHT" 2>/dev/null && grep -q "border-success-500/20 bg-success-500/5" "$INSIGHT" 2>/dev/null
check "AiInsightCard next-action uses success token" $?
grep -q "ai: 'border-brand-500/20 bg-brand-500/5'" "$STAT" 2>/dev/null
check "StatCard ai variant uses brand token" $?
grep -q "info: 'border-accent-500/20 bg-accent-500/5'" "$STAT" 2>/dev/null
check "StatCard info variant uses accent token" $?
grep -q "healthy: 'border-success-500/30 bg-success-500/10 text-success-300'" "$BADGE" 2>/dev/null
check "StatusBadge healthy uses success token" $?
grep -q "at_risk: 'border-danger-500/30 bg-danger-500/10 text-danger-300'" "$BADGE" 2>/dev/null
check "StatusBadge at_risk uses danger token" $?
grep -q "ai: 'border-brand-500/20 bg-brand-500/5'" "$CARD" 2>/dev/null
check "SectionCard ai variant uses brand token" $?

# --- Surface role stays neutral (no over-migration) ---
grep -q "default: 'border-neutral-800/70 bg-neutral-950'" "$CARD" 2>/dev/null
check "SectionCard default stays neutral surface" $?
grep -q "coaching: 'border-neutral-800/70 bg-neutral-950'" "$CARD" 2>/dev/null
check "SectionCard coaching stays neutral (Day-196 pin honoured)" $?

# --- No arcade/off-palette colour reintroduced in migrated components ---
! grep -rqiE 'fuchsia|purple|pink|violet' \
  "$BTN" "$TABS" "$INSIGHT" "$STAT" "$BADGE" "$CARD" 2>/dev/null
check "no fuchsia/purple/pink/violet in migrated components" $?

# --- Refreshed validators still pass (intent pins honoured) ---
bash "$WEB_ROOT/scripts/validate-premium-ux-day-194.sh" >/dev/null 2>&1
check "Day 194 validator still passes after pin refresh" $?
bash "$WEB_ROOT/scripts/validate-premium-ux-day-195.sh" >/dev/null 2>&1
check "Day 195 validator still passes after pin refresh" $?
bash "$WEB_ROOT/scripts/validate-premium-ux-day-198.sh" >/dev/null 2>&1
check "Day 198 validator still passes after pin refresh" $?

# --- Loosened pins carry a Day 203 rationale comment ---
grep -q 'Day 203' "$WEB_ROOT/scripts/validate-premium-ux-day-198.sh" 2>/dev/null
check "Day 198 records why its Button pins were loosened" $?

if [[ "$fail" == "0" ]]; then
  echo "Day 203 validation PASSED"
else
  echo "Day 203 validation FAILED"
  exit 1
fi
