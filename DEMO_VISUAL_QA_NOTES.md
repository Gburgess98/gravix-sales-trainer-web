# Demo Visual QA Notes — Pre-Day-205 Checkpoint

Day 205A. A low-risk hygiene checkpoint taken **before** the full Day 205
demo reseed + lighthouse QA run. Pairs with `PRE_DEMO_RUNBOOK.md` (the
authoritative before-every-demo procedure) and `LIGHTHOUSE_DEMO_SCRIPT.md`
(talk track + click path). This file records the WEB baseline and known
non-blockers so the full QA run starts from a known-clean state.

## 1. Expected WEB state

- Branch: `claude/sprint-3-shell`
- Tip after this checkpoint: `chore: prepare demo hygiene checkpoint`
  (immediately follows `33572d7 style: upgrade admin assignments workspace`,
  the tip of the Days 194–204 visual/system sprint).
- Backup before this work: local branch `backup-pre-day205`.
- No tag (hygiene checkpoint only).

## 2. Seed commands needed before an external demo

Seeds are **API-side** and drift over time (the Review Queue and Whisperer
panels only look back 30 days). Re-seed before any external demo. Order
matters — run `seed:demo` first, then `seed:ufc-story`:

```bash
cd ~/Dev/gravix-sales-trainer-api
npm run seed:demo        # refreshes the whole UFC org (users, calls, dates)
npm run seed:ufc-story   # re-stamps the hero call + Whisperer/Discovery/sparring story
```

Both are idempotent. Validate the seed:

```bash
cd ~/Dev/gravix-sales-trainer-api
npx tsx scripts/validate-ufc-demo-seed.ts
```

See `PRE_DEMO_RUNBOOK.md` §2–4 for the full procedure and login details
(single-org UFC Elite, log in as Dana; the shared demo password is printed
by `seed:demo` — not written in any doc).

## 3. Demo path checklist (visual smoke, logged in as Dana)

Walk this after reseed to confirm the Days 194–204 visual work renders:

- [ ] `/coaching` — Command Centre loads; Suggested Trigger Candidates present.
- [ ] `/dashboard` — Command Centre pass (no arcade XP/rank/mission language, no cyan).
- [ ] `/calls/[id]` (hero call) — Whisperer Moments + score render; header clean.
- [ ] `/call-library` — WorkspaceTabs + SectionCard; no emerald sparring modal.
- [ ] `/assignments` — Command Centre pass renders.
- [ ] `/admin/assignments` — manager lane; StatCards, brand CTAs, no debug badge.
- [ ] Sidebar shell — Geist font, blurred panels, indigo nav/tabs, 1400px clamp.

## 4. Known non-blockers

These are pre-existing and do **not** block the demo. Left as-is on Day 205A
because a behaviour-neutral WEB-only fix is not possible for them.

- **Build warnings — missing `@/lib/api` exports (4).** `npm run build`
  compiles with warnings (exit 0):
  - `listCoachAssignments`, `getTopObjections` — imported by
    `src/app/crm/overview/page.tsx`
  - `getRewards`, `listActiveBounties` — imported by `src/app/rewards/page.tsx`

  These functions are imported but were never exported from `src/lib/api.ts`.
  Both pages are legacy/untouched and not on the demo path. A proper fix needs
  **API-side** helper exports (out of scope for a WEB-only hygiene pass), and
  removing the imports would change runtime behaviour on pages we are not
  redesigning. Deferred, documented here.

- **`/crm/Leaderboard` — orphaned but functional.** `src/app/crm/Leaderboard/page.tsx`
  has **zero inbound links/refs** (the only "leaderboard" string in the codebase
  is an unrelated sparring persona proxy path in `src/app/sparring/[id]/page.tsx`).
  It fetches via the proxy (`API.apiGet('/dashboard/leaderboard?...')`) and links
  to `/crm/reps/[id]` and `/crm/overview`, so it still works if reached directly.
  Left in place for Day 205 to decide: redirect to `/crm/manager` (matching the
  Day 184/188/193 stub pattern) or keep. Not redesigned.

## 5. Build / typecheck baseline

Captured Day 205A (post-hygiene):

- `npm run build` — **passes** (exit 0), with the 4 missing-export warnings in §4.
- `npm run typecheck` — **186 pre-existing errors** (unchanged baseline; not clean).
  Files touched on Day 205A (`src/lib/api.ts`, `tests/e2e/smoke.spec.ts`) are
  clean of typecheck errors.
- `npm run validate-premium-ux-day-204` — PASSED
- `npm run validate-premium-ux-day-203` — PASSED
- `npm run validate-tier-2b-smoke` — PASSED

Do not claim typecheck is "clean" — 186 baseline errors remain. Touched files
are clean.

## 6. Day 205A hygiene changes (this checkpoint)

WEB-only, patch mode, no behaviour change:

- Removed proven-dead `src/lib/api.ts` exports (zero references anywhere):
  `setScore`, `listAdminReps`, `patchAdminRepTier`, `AdminRepRow` (type),
  `getSparringSessionsByRep` (+ its `SparringSessionSummary` type).
  `/admin/reps` uses raw `fetch("/api/proxy/...")`, not these helpers.
- Dropped the stale `/reps` entry from `tests/e2e/smoke.spec.ts` — no `/reps`
  index route exists (only `/reps/[id]`, a Day 193 redirect stub), so it
  asserted a 404 and protected no live route.

Next: full Day 205 demo reseed + lighthouse QA.
