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
matters — run `seed:demo` first, then `seed:ufc-story`, then
`seed:ufc-intelligence`:

```bash
cd ~/Dev/gravix-sales-trainer-api
npm run seed:demo             # refreshes the whole UFC org (users, calls, dates)
npm run seed:ufc-story        # re-stamps the hero call + Whisperer/Discovery/sparring story
npm run seed:ufc-intelligence # Day 224: published context + UFC Sales Scorecard + provenance proof call
```

All three are idempotent. Validate the seed:

```bash
cd ~/Dev/gravix-sales-trainer-api
npx tsx scripts/validate-ufc-demo-seed.ts
npm run validate:ufc-intelligence-seed   # Day 224 Intelligence assets
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

## 9. Day 214 — /team read-only QA checklist (as Dana)

`/team` is the new manager people surface (sidebar "Team"; the coaching
workload page is now labelled "Manager Centre", same `/crm/manager`
route). Read-only MVP — walk this after reseed:

- [ ] Sidebar shows **Team** (→ /team) and **Manager Centre**
      (→ /crm/manager); both load.
- [ ] `/team` lists all UFC members with real names (Nate Diaz, Anderson
      Silva…), never UUIDs.
- [ ] Seat summary shows the demo org **over allocation** (15 members vs
      5 licensed seats) as a calm warning StatCard — nothing is blocked.
- [ ] Coaching scope column shows "Company-wide scope" for the
      office-less demo org (no spurious "Needs team setup" chips).
- [ ] No invite / edit / deactivate controls anywhere on the page.
- [ ] As a rep (e.g. Nate), `/team` shows the calm managers-only notice.

## 10. Day 217B — enriched hero-call audit evidence (API seed)

Day 217A fixed the WEB rubric readers; Day 217B enriched the seed data
itself (`fix: enrich ufc story rubric evidence`, API repo). The Nate Diaz
hero call (`Nate Diaz — Price Objection Call`, /calls/3d26a918-…) now
carries buyer-ready stage audit evidence instead of `"Demo."` notes:

- `seed:ufc-story` pins the canonical story rubric on **both** the call
  row and its `call_scores` row — scores unchanged (overall 45; intro 57,
  discovery 53, objection 56, close 40 weakest; voice 53).
- Each stage note is multi-line (the audit renders `whitespace-pre-wrap`):
  evidence quoting the seeded Whisperer moments ("too expensive",
  "speak with my partner", "send over some information"), then
  `What worked / What was missed / Coach on / Practise next` lines.
- `review_tags` now feeds the Voice Personality panel: `weak_close: true`
  ("Weak close detected" chip), `filler_count: 14`, filler word chips.
- Summary rewritten to match the story (no more "Strong opening" clash
  with a 57 intro).

QA after any reseed (as Dana, /calls/3d26a918-d9a4-48c6-9ce3-cda316b101f6):

- [ ] Stage audit shows 4 stages with specific multi-line evidence notes
      (no "Demo." anywhere).
- [ ] Close (40) is the weakest stage and drives the lost-points list.
- [ ] "Weak close detected" chip + filler count/words render in the
      Voice Personality Score panel; voice score still 53.
- [ ] Header still reads "Nate Diaz — Price Objection Call · 45/100".

API validator: `npm run validate-ufc-demo-seed` (API repo, now asserts
non-trivial stage notes, pinned scores, weak_close, call_scores mirror).

---

## 11. Day 222 — live intelligence runtime proof (API, no demo-data change)

`npm run validate:intelligence-runtime-live` (API repo) proves the Intelligence
Layer end-to-end on the real UFC demo company: Dana publishes a context,
activates a company-default scorecard, and a controlled proof call scored
through `scoreWithLLM` records both in `calls.rubric._meta`. 58/58.

**No demo data changes as a result of running it.** The validator is
self-cleaning and was verified to leave the UFC company exactly as found:

- The Day 222 proof call, its `score_cache` entry, and every row the scoring
  runtime wrote for it (`call_scores`, `crm_activities`, assignments) are
  removed.
- The published context and activated scorecard are removed — the Day 218 and
  Day 219B validators both assert UFC starts with zero context/scorecard rows,
  so leaving them would break `validate:intelligence-context` (26/26) and
  `validate:intelligence-scorecards` (59/59). Both re-run green afterwards.
- The Nate Diaz hero call is untouched: still 45/100, original `_meta`.

Safe to run before a demo. It needs the API server up (`API_BASE`, default
`http://localhost:4000`) and never calls a paid model.

### Known non-blockers surfaced by the proof run

- **`/calls/[id]` shows no scorecard provenance.** The page reads
  `rubric._meta` only for `voice` and `transcript` — it does not surface
  `scorecard_name` / `scorecard_source`. Managers cannot yet see which
  scorecard produced a score. WEB display is Day 223 work; deliberately not
  touched on Day 222.
- **Pre-existing: auto critical assignment is broken.** Scoring logs
  `Could not find the 'meta' column of 'coach_assignments' in the schema
  cache`, so `ensureCriticalCallAssignment` fails for every scored call. It is
  best-effort and swallowed, so scoring still succeeds. Unrelated to the
  Intelligence Layer and predates Day 222.
- **Hero call `_meta` predates Day 221** and carries no scorecard fields at
  all, so any Day 223 display must handle their absence rather than assume them.

---

## 12. Day 223 — scoring provenance now visible on /calls/[id]

The call review page now shows what a call was scored with, read from the
`rubric._meta` the Day 221 runtime stamps (hero transparency line, review-audit
chip, and the Scoring transparency panel's Rubric used / Scorecard source /
Company context / Scoring model rows).

**Nothing in the current demo data changes.** Every existing call — including
the Nate Diaz hero call — was scored before the runtime stamped provenance, so
all of them carry no scorecard fields and read exactly as before: "Scored with
the Gravix default rubric", context "Not applied", and the neutral "Custom
scorecards will appear here once activated." line. This is the intended calm
default, not a missing-data state.

The new labels only appear on **newly scored calls** in a company that has a
published context and/or an activated scorecard. Day 222 removes its UFC
context and scorecard when it finishes (Day 218/219B validators require UFC to
start clean), so there is no seeded demo call showing the company-scorecard
state today — it is covered by the 24 helper fixtures instead
(`node scripts/validate-scoring-provenance-day-223.mts`).

QA after any reseed (as Dana, /calls/3d26a918-d9a4-48c6-9ce3-cda316b101f6 or
the hero call):

- [ ] Hero line reads "Scored with the Gravix default rubric · <model>".
- [ ] Scoring transparency panel shows Rubric used = Gravix default rubric,
      Scorecard source = Gravix default, Company context = Not applied.
- [ ] No raw UUID appears as a visible label anywhere on the page.
- [ ] No claim that a company scorecard or context was applied.
- [ ] Assign Coaching / Assign Drill / CRM drawer still open; audio, pins and
      Mark Reviewed unaffected.

---

## 13. Day 224 — UFC Intelligence assets are now seeded (demo-visible)

`npm run seed:ufc-intelligence` (API) seeds the **persistent** Intelligence
assets, so the Day 221–223 work is finally visible in the product:

- published UFC company context **v1** (plus the draft working copy);
- **"UFC Sales Scorecard"** v1 — active, company default, fixed four stages
  (intro 20 / discovery 30 / objection 30 / close 20), one criterion each;
- one proof call scored through the real runtime, carrying real provenance.

The demo now shows **both** provenance states side by side:

| Call | URL | Reads |
|---|---|---|
| Nate Diaz — Pricing Follow-up Call (62) | `/calls/05da878f-1bf4-4d52-af9b-87abd412b0d2` | "Scored with UFC Sales Scorecard v1 · Company context v1 applied" |
| Nate Diaz — Price Objection Call (45, hero) | `/calls/3d26a918-d9a4-48c6-9ce3-cda316b101f6` | "Scored with the Gravix default rubric" · context "Not applied" |

The hero call is deliberately untouched — it predates the runtime stamping
provenance, and it is the calm default state Day 223 renders. Both were proven
by running the real Day 223 helper (`src/lib/scoringProvenance.ts`) against the
real `rubric._meta` rows: labels render as above with no raw UUID in any visible
label (full ids appear only in the hover title).

**Honesty note.** The proof call's *stage scores* are seeded demo values, pinned
the same way the hero call's are — no LLM is called. Its *provenance* is not
seeded: `scoreWithLLM` resolves the seeded assets, keys the cache and stamps
`_meta` itself, so a cache hit is only possible if that live resolution matched.

Validate: `npm run validate:ufc-intelligence-seed` (57/57 — asserts the seeded
shape, the proof call's provenance, that the hero call is untouched, and
cross-company isolation).

### Validators no longer depend on UFC being empty (Day 224)

`validate:intelligence-context` and `validate:intelligence-scorecards` used to
save drafts, publish and create scorecards **as Dana, inside the UFC company**.
That required UFC to start with zero Intelligence rows and silently mutated demo
data — with the seed in place, a single validator run archived the seeded
context and replaced it with validator content. Both now create and write to
their own throwaway fixture companies, so they never touch UFC and their version
assertions are absolute again. `validate:intelligence-runtime-live` (Day 222)
now proves the **seeded** assets instead of publishing its own, and no longer
deletes them.

Practical effect: the seed survives a full validator sweep, and the validators
can be run in any order before a demo.
