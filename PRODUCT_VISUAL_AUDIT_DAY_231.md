# Product Visual Audit — Day 231 (UI plugin pass)

Method: Anthropic design plugin (`design:design-critique` framework — first
impression, usability, hierarchy, consistency, accessibility) applied to the
live dev preview for every reachable screen, plus a structured source scan
(shell-primitive adoption, off-palette colour, page size) for routes behind
the auth gate. Unauthenticated screens were verified in the browser; gated
screens were graded from source + the sprint's QA record, and need one
signed-in pass as Dana to confirm (see "Follow-up"). The plugin's external
connectors (Figma/Linear/Notion…) are unauthorised in this environment and
were not needed — the app itself is the design source.

Grading: A = demo-ready premium · B = acceptable, needs polish ·
C = weak/basic, hurts trust · D = hide from demo until fixed.

## Core demo routes

| Route | Grade | Demo decision |
| --- | --- | --- |
| /login | A | Show — it's the first impression and it holds |
| /dashboard | B+ | Show |
| /coaching | B | Show (primary demo surface) |
| /call-library | A− | Show |
| /calls/[id] (seeded call) | A− | Show (hero surface) |
| /assignments | B+ | Show |
| /upload | B | Show |
| /crm/analytics | A− | Show |
| /crm/overview | B+ | Show, after Day 232 helper fix |
| /crm/manager | B+ | Show |
| /team | A− | Show |
| /intelligence | B (Scorecards A− / Context C+) → A− after Days 232–233 (Context workspace rebuilt; page-level Intelligence Command band + scoring-impact panel added; signed-in visual confirmation pending) | Show — flagship surface |
| /settings/profile | B | Neutral — fine if a buyer clicks it |

### Notes on the weak spots

- **/login — verified in browser.** Branded, calm, purpose immediately
  clear; error state is a quiet danger tint; gate bounces are clean with no
  broken-UI flash. One documented deviation: the Sign In primary is
  `bg-white text-black` rather than the brand-600 recipe — a deliberate
  Day 228 high-contrast choice for the auth surface, acceptable; the grey
  look pre-entry is just the disabled state.
- **/intelligence Context tab is the weakest core surface.** Functionally
  complete (draft/publish/compiled preview, merge-safe saves) but it reads
  as a settings form: long labelled fields, little narrative, none of the
  "teach Gravix how your company sells" feel the Day 208 blueprint
  describes. Scorecard Studio beside it (Days 227–230) now makes the gap
  obvious. This is the highest-leverage rebuild target.
- **/crm/overview has silently failing sections.** It calls
  `listCoachAssignments` (lines ~377/543), which no longer exists in
  lib/api — the import is `undefined`, the call throws, the try/catch eats
  it, and the section quietly shows its fallback. A buyer sees an empty
  panel that should have data. `getTopObjections` is typeof-guarded (safe).
  Restore both helpers before demoing this route hard.
- **/coaching + /dashboard colour debt.** ~48 and ~10 raw emerald/cyan
  classes respectively predate the Day 203 token migration. Visually they
  read as status in most spots, but they're outside the token system —
  consistency debt, not a demo blocker.
- **`/` (home) logs a Next 15 sync-dynamic-APIs error** on every hit
  (`searchParams.redirect` used without await, src/app/page.tsx:34). Works
  today, spams the server log, will break on a future Next major. Small
  Day 232 side-fix.

## Secondary / admin routes

| Route | Grade | Demo decision |
| --- | --- | --- |
| /admin/users | C | Hide — pre-shell layout; use /team instead |
| /admin/assignments | B− | Neutral; fine via the manager flow |
| /crm/actions | C+ | Hide — no shell primitives, local layout |
| /crm/tasks | C+ | Hide — same |
| /crm/accounts | B | Show if the CRM story needs it |
| /crm/reps/[id] | B− | Show via CRM links only |
| /rewards | D → fixed | Was: orphaned arcade page whose data calls could only throw (imports removed from lib/api on Day 205A). Now a server redirect → /dashboard |
| /crm/Leaderboard | D → fixed | Was: orphaned case-sensitive arcade leaderboard. Now a server redirect → /crm/overview |
| /dev/audio-test | D → fixed | Was: dev scratch page rendering UNAUTHENTICATED outside the shell gate, minting signed-URL requests. Now a server redirect → /dashboard (gated). Verified in browser |

## Patches applied during audit (Phase 3, trust-only)

1. `/rewards`, `/crm/Leaderboard`, `/dev/audio-test` → server redirect stubs
   (Day 184/193 pattern), each with an explanatory header comment. No
   behaviour change to any living route; kills the getRewards /
   listActiveBounties build warnings (2 of the 4 known Day 205A leftovers).
2. `'/rewards'` removed from SHELL_PATHS (Day 185 `/review` precedent) —
   redirect stubs don't take the shell.
3. Verified in browser: all three paths now land on /login when signed out.

## What consistently works (keep)

The shell system is real: PageContainer/PageHeader/WorkspaceTabs/SectionCard
/Button/StatCard/EmptyState adoption across every A/B core route, semantic
tokens, status-only colour, calm CTAs, honest empty/error states, no fake
controls on any core route, no raw UUIDs surfaced. GRAVIX_DESIGN_SYSTEM.md
matches what's actually shipped.

## Recommendation (Phase 2 choice)

**Option A — Context Engine Premium Pass** is the next code day. Reasons:
Option D (orphan cleanup) was completed within this audit's Phase 3 window;
Option C (auth/shell) verified strong in the browser; Option B (whole
Intelligence workspace) is mostly done — Scorecard Studio carried it —
leaving the Context tab as the one core surface a buyer sees that
undercuts the moat story. Kendo-class principle (not layout): one section
at a time, structured precision, guidance that's easy to write.

## Follow-up

- One signed-in browser pass as Dana over the A/B core routes to confirm
  the source-based grades (ask the user to sign in inside the preview
  browser at the current origin).
- Day 232: Context Engine premium pass + restore the two lib/api helpers
  + await the `/` searchParams.
