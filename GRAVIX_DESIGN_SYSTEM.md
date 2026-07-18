# Gravix Design System — Foundation

Consolidated from the Day 187 brief, executed Day 231. This codifies the
system the Premium UX sprint actually built (Days 177–230) so future pages
follow one calm, premium standard instead of page-by-page improvisation.
Nothing here is aspirational: every rule below is already live in the shared
components, and the file paths are the source of truth.

## Visual direction — "Command Centre"

Named on Day 194. Gravix is a dark, calm, information-dense enterprise
cockpit: a manager should feel they are looking at an instrument panel, not a
marketing site or an arcade. Depth comes from layered neutral surfaces and a
single brand accent, never from colour variety. Motion is limited to
`transition-colors` and skeleton pulses.

## Typography

Geist Sans/Mono, loaded in `src/app/layout.tsx`, applied globally in
`src/app/globals.css` (Day 195 fixed the silent Arial fallback). The working
scale, smallest to largest:

| Role | Classes |
| --- | --- |
| Micro metadata / counts | `text-[10px]`, often `tabular-nums` |
| Eyebrows / group labels | `text-[10px] uppercase tracking-[0.12em]`–`[0.14em]` |
| Tertiary detail | `text-[11px] text-neutral-600` |
| Secondary text / rows | `text-xs text-neutral-400`–`500` |
| Body / list titles | `text-sm` |
| Card titles | `text-base font-semibold text-white` |
| Page title (one per page) | `text-xl font-semibold tracking-tight text-white` (`PageHeader`) |

Numbers that get compared vertically always take `tabular-nums`.

## Spacing and page width

- Every shell route wraps content in `PageContainer`
  (`src/components/layout/page-container.tsx`): `max-w-[1400px] p-6 lg:px-8`,
  vertical rhythm `space-y-6`.
- One `PageHeader` (`src/components/layout/page-header.tsx`) at the top:
  title, optional subtitle, actions on the right.
- Card internals: header `px-5 py-4`; padded bodies via SectionCard's
  `padded` prop; list bodies manage their own `px-5 py-4` rows.
- Tab navigation inside a page uses `WorkspaceTabs`
  (`src/components/shell/workspace-tabs.tsx`) with `?tab=` deep links.

## Colour tokens

Tailwind v4 `@theme` semantic roles in `src/app/globals.css` (Day 203). Each
aliases one palette 1:1, so retinting for white-label is a token edit, not a
component edit:

| Role | Palette | Meaning |
| --- | --- | --- |
| `brand` | indigo | Primary action, AI, brand accent |
| `accent` | cyan | Sparring highlight, "medium" urgency |
| `success` | emerald | Positive **status only** — never decoration, never CTAs |
| `warning` | amber | Caution status only |
| `danger` | red | Error / destructive / at-risk only |
| neutral scale | neutral | All surfaces, borders, text |

New code uses the role names, not the raw palette. Fuchsia and friends were
purged on Day 194 and validators keep them out.

## CTA hierarchy

`Button` / `buttonClasses` in `src/components/ui/button.tsx` (Day 198) are
the only button recipes:

1. **primary** (`bg-brand-600`) — the single main action of a view. One per
   view, at most.
2. **secondary** (`bg-brand-600/20 text-brand-200`) — supporting brand
   action.
3. **ghost** (neutral border) — the default for everything else: filters,
   toggles, row actions.
4. **danger** — destructive confirmation only, always behind a modal.

Links share the recipes via `buttonClasses()` without changing element
semantics. Pre-Day-198 call sites keep hand-copied literals where validators
pin them (Days 182/190) — match the recipe strings exactly if editing those.

## Card hierarchy

`SectionCard` (`src/components/ui/section-card.tsx`) is the one card
primitive: neutral `default` surface, `ai` (brand tint) reserved for
AI-derived content, `warning`/`danger` for genuine states, `coaching` pinned
neutral. Eyebrow + title + subtitle + optional actions in the header; flush
bodies for lists, `padded` for prose. Stat rows use `StatCard`; AI callouts
use `AiInsightCard`. Do not invent bespoke card shells.

## Badges and status

`status-badge.tsx` owns status colour: RiskBadge (healthy/watch/at_risk) and
UrgencyBadge (critical/high/medium/low) map to success/warning/danger/accent.
Pills are `rounded-full border` with `/30` border + `/10` background tints.
Status colour states a fact; it never decorates. Green appearing anywhere
means "a real status is good", nothing else (Days 186/192).

## Tables and lists

Lists are flush SectionCard bodies: `divide-y divide-neutral-900` rows,
`px-5 py-4`, `hover:bg-neutral-900/40`, full-row `<button>` when the row
expands (with `aria-expanded`). Group headings inside lists are the Day 230
pattern: eyebrow-style label + one-line copy on `bg-neutral-950/40`. Numeric
columns right-align with `tabular-nums`. No zebra striping, no heavy grid
borders.

## Empty states

`EmptyState` (`src/components/ui/empty-state.tsx`) everywhere: calm message,
smaller `sub` explaining what the space is for or how to fill it, optional
single ghost action. Empty states never invent data, never blame the user,
and error states offer "Try again" (see ScorecardsTab's load-error state).
Loading uses `animate-pulse` neutral skeletons, not spinners.

## Form fields

Dark inputs on neutral surfaces: `rounded-md`/`rounded-lg` with
`border-neutral-700`–`800`, `bg-neutral-900`-family fill, `text-sm`, labels
as small neutral text above. Choice-among-few renders as `aria-pressed` chip
toggles (Day 229), not checkbox walls. Editing capability appears only where
editing is real — read views render no `<input>` (validator-pinned).

## Dark / light theme direction

Dark-first and dark-only today: the shell hard-codes the neutral-950 world.
`globals.css` keeps the light `:root` + `prefers-color-scheme` flip for the
`--background`/`--foreground` pair as the seed of a future light theme; any
real light mode arrives via the semantic token layer, not per-component
edits. Do not ship partial light-mode styling on individual pages.

## What not to do

- No new accent colours; no fuchsia-family, no emerald outside status.
- No more than one primary CTA per view; no green CTAs.
- No bespoke card/button/badge markup where a shared primitive exists.
- No gamified/arcade language or UI (XP, ranks, streaks — reframed Day 201).
- No fake controls: nothing disabled-"coming soon", no AI buttons that
  don't call AI, no invented endpoints (validators enforce this).
- No raw UUIDs as visible labels (PREMIUM_UX_AUDIT §38).
- No spinners, modals-on-load, or layout shift; skeletons match final shape.
- No direct backend calls from pages — `/api/proxy` via `proxyFetch` only.
- No page-local reinvention of tokens: use role names, never hex.

Validate: `npm run validate-design-system-day-187`.
