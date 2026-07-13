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

## 7. Day 212 — Assign Coaching blocker RESOLVED (API-side)

The known demo blocker where `/coaching` Review Queue → Assign Coaching
failed with `rep_missing_office` is fixed in the API repo
(`feat: add team management scope foundation`):

- Root cause: `POST /v1/assignments` hard-required a rep `office_id`, but
  the UFC demo company (like any office-less company) has none — every rep
  is company-scoped, which reads have honoured since Day 166/168. Not a
  seed defect; no reseed needed for this fix.
- Fix: office is now optional at assignment creation (null `office_id` =
  company scope, matching seeded assignment rows). Company remains the
  hard boundary, and a new cross-company guard rejects out-of-company
  targets with 403 `rep_out_of_scope`.
- New read-only `GET /v1/team/members` (manager-gated) exposes per-member
  office/scope status + seat summary for the future `/team` surface.
- Proof: `npm run validate:team-management` (API repo) — 15/15, including
  live Dana→Nate assignment creation and cross-company rejection.
- Demo note: the seat summary reports the UFC org **over allocation**
  (15 members vs 5 licensed seats in `company_licences`) with an
  `over_seat_allocation` warning. Expected with the demo seed; harmless
  today because nothing enforces seat limits yet, but worth knowing if a
  seat panel is shown in a demo.

## 8. Day 213A — analytics UUID leak fixed (WEB-only)

During a demo, `/crm/analytics` showed raw user UUIDs on the Activity by
rep chart axis and tooltip. Fixed in `fix: hide raw ids in analytics
labels`:

- Root cause: the API's activity-by-rep endpoint echoes `rep_id` back as
  `rep_name` (its `auth.users` name lookup silently fail-softs), and the
  page's `repLabel` helper trusted any non-empty name.
- Fix: `repLabel` now rejects UUID-shaped / id-equal names and resolves
  human names from the existing tenant-scoped `/v1/team/users` endpoint.
  Preference: team name > API name > email local part > neutral
  `Rep xxxxxx` fallback. Full ids stay internal for filters/queries.
- The activity-by-rep CSV export ships human labels instead of raw ids.
- **House rule: user-facing analytics must never expose raw internal
  IDs** — axis, tooltip, select options, signal cards, or exports.
- Validator: `npm run validate-premium-ux-day-213a`.
- **Day 213B — API source fixed too** (`fix: return human names for
  analytics reps`, API repo): activity-by-rep now resolves names from
  the public `reps`/`users` tables (the old `auth.users` lookup could
  never succeed via PostgREST) and returns a display name, email local
  part, or null as `rep_name` — never the UUID. The WEB Day 213A guard
  stays as defence in depth. API validator:
  `npm run validate:analytics-labels` (API repo).
