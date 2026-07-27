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

## Day 225 — /intelligence workspace checklist

New manager surface at `/intelligence` (sidebar: Admin → Intelligence). Reseed
before a demo (`seed:demo` → `seed:ufc-story` → `seed:ufc-intelligence`) so the
tabs have the UFC assets to show.

Walk it as Dana:

- [ ] Sidebar shows **Intelligence** under Admin, between Analytics and
      Settings. Analytics still goes to `/crm/analytics` — the two are distinct
      destinations ("observe" vs "teach"), not duplicates.
- [ ] `/intelligence` lands on the **Context** tab; the URL gains `?tab=context`
      when you switch tabs, and `/intelligence?tab=scorecards` deep-links.
- [ ] Context tab: "Published context" reads **v1** with a publish date, not
      "None". Section coverage shows the seeded sections as **Taught**.
- [ ] Context tab: the free-text fields are populated from the UFC context.
      Editing one enables **Save draft**; **Publish context** stays disabled
      until the draft is saved.
- [ ] Context tab: "What Gravix reads" preview shows the compiled block for
      **Published**; the Draft toggle shows the draft's block.
- [ ] Context tab: products, objections and competitors appear under
      "Reference" and are labelled read-only.
- [ ] Scorecards tab: "Scoring today" reads **UFC Sales Scorecard v1**, not the
      Gravix default.
- [ ] Scorecards tab: the UFC card shows Active + Company default; selecting it
      reveals stage weights and criteria grouped by stage.
- [ ] Scorecards tab: **Gravix Default** still appears as a read-only card with
      its even 25% stage weights.
- [ ] No Autofill, no AI Builder, no "coming soon" buttons anywhere.
- [ ] No raw UUIDs on screen — scorecards read by name, never by id.
- [ ] Layout holds at desktop and narrow widths; no arcade colour.

Careful with the seed: the Context tab can **publish**. Publishing from the UI
creates context v2 and archives v1, so `validate:ufc-intelligence-seed` (which
asserts v1) will then fail. If you publish while rehearsing, re-run
`npm run seed:ufc-intelligence` before the demo.

## Day 226 — /intelligence scorecard workspace QA

Extends the Day 225 checklist. Reseed first (`seed:demo` → `seed:ufc-story` →
`seed:ufc-intelligence`) so the UFC assets are present.

### Authenticated QA status

**Pending.** The Day 226 build was verified by validator, fixtures, typecheck
and build, and the data path was proven end-to-end through the WEB proxy as
Dana (context v1 published; UFC Sales Scorecard v1 active/company-default;
relational stage weights 20/30/30/20 and 4 criteria present). The logged-in
**render** is still unproven: it needs a Dana Supabase session, which must be
created by hand. Sessions are per-origin, so log in on the same origin the
preview is served from — a session on `:3000` will not apply to a preview port.

Note: a long-running dev server on `:3000` predates the Day 225 route and 404s
on `/intelligence`. Don't QA against it.

### Scorecards tab (Day 226)

- [ ] Selecting the UFC card shows a status row: version, Active pill,
      activated date, and "Every call type" for the company default.
- [ ] A read-only **Currently active** panel appears — status only, with no
      Activate button anywhere on the page.
- [ ] Stage weights render with a stated total (UFC: 20/30/30/20, totals 100%)
      and per-stage guidance beneath.
- [ ] Criteria render grouped per stage, each stage card showing its weight and
      criterion count, with emphasis/Critical/Pass-fail chips where set.
- [ ] **Gravix Default** still renders read-only with even 25% weights and the
      explanation of why it can't be edited.
- [ ] No raw UUIDs: scorecards read by name throughout.

### Activation readiness (Day 226)

The UFC seed has only an **active** v1 and no draft version, so the readiness
panel is **expected not to render** on the seeded demo — that is correct, not a
bug. It appears only for a card carrying a draft version. If you want to see it,
create a draft scorecard via the API; the panel then shows the four checks
mirrored from the API's activation gate, plus any conflict preview.

- [ ] No Activate button, and nothing on the page sends `replace_conflicts`.

### Context tab (unchanged from Day 225, re-check)

- [ ] Published context v1 + compiled block still render.
- [ ] Publish copy now states scoring is future-only and nothing is re-scored.

Careful with the seed: the Context tab can still publish, which creates context
v2 and archives v1, breaking `validate:ufc-intelligence-seed` (asserts v1).
Re-run `npm run seed:ufc-intelligence` if anyone publishes while rehearsing.

## Day 227 — Scorecard Studio editor QA

Open `/intelligence?tab=scorecards` as Dana (manager).

### Create

- [ ] "New scorecard" opens a modal (name, optional description, company
      default) — no templates, no AI anything.
- [ ] Creating selects the new card, already expanded, with the draft editor
      open on version 1 at 25/25/25/25.
- [ ] A duplicate name answers "That name is already used by another
      scorecard", not a raw error code.

### Draft editing

- [ ] Stage rail shows all four fixed stages with weight + criteria count;
      no way to add or remove a stage exists anywhere.
- [ ] Setting weights to a non-100 total still saves; the total line warns
      "must be 100% to activate (saving is fine)" and Activate is blocked
      with the reason listed.
- [ ] A criterion expands to label, emphasis, description, scoring guidance,
      good example, weak example, coaching prompt, pass/fail, critical.
- [ ] Critical is disabled until pass/fail is ticked; unticking pass/fail
      clears critical.
- [ ] Add criterion stops at 12 per stage with the limit shown.
- [ ] Reordering with ↑/↓ survives a save and reload (sort order persisted).
- [ ] "Unsaved changes" chip appears on any edit; Save clears it and the
      notice says scoring is unchanged until activation.

### Fork / locked versions

- [ ] The UFC Sales Scorecard's active version shows the locked panel with
      "Create editable draft" — no editable fields on the active version.
- [ ] Gravix Default card stays read-only with no workbench at all.

### Activation

- [ ] Activate opens a confirmation modal summarising name/version, call
      types or company default, criteria count — with "future scoring only"
      copy and an optional activation note.
- [ ] On a call-type clash the modal switches to the conflict list naming
      the other scorecard (name, never an id) and requires the checkbox
      before "Replace and activate" enables. Cancel leaves everything as-is.
- [ ] Nothing anywhere activates or replaces without those confirmations.

### Archive

- [ ] Archive appears only on never-activated scorecards, asks for
      confirmation, and the copy states nothing is deleted.

Careful with the seed: activating a draft over the UFC Sales Scorecard's call
types supersedes the seeded active version. Re-run `npm run
seed:ufc-intelligence` after rehearsing any replace flow.

## Day 228 — auth first impression + Scorecard Studio authenticated QA

### Login / logged-out behaviour (browser-verified, logged out)

- [x] `/login` shows the indigo brand bolt, no header, no self-linking
      "Login" button; form focus rings are brand-coloured.
- [x] Logged-out `/dashboard` redirects cleanly to `/login` — no shell, no
      fake empty states, no loop.
- [x] Logged-out `/crm/overview` also redirects (the `x-open-route` carve-out
      has never actually functioned — see PREMIUM_UX_AUDIT §Day 228).
- [x] No console errors on the login page.

### Scorecard Studio authenticated QA (as Dana) — PASSED 16 Jul 2026

Walked live on the preview origin (localhost, non-3000 port):

- [x] Context tab: UFC context v1 published, compiled block renders, publish
      copy safe, coverage honest (competitors EMPTY). Narrow viewport holds.
- [x] Scorecards list: UFC Sales Scorecard v1 Active + Company default;
      Gravix Default read-only; "New scorecard" action present.
- [x] UFC detail: weights 20/30/30/20 totalling 100% with guidance, 4
      criteria with emphasis chips, active version locked with fork CTA and
      zero editable fields.
- [x] Create: modal → draft v1 at 25/25/25/25, auto-opened in the editor.
- [x] Edit: call type tick, weight edits (95% total shows the warning
      "must be 100% to activate (saving is fine)"), criterion with label /
      emphasis Major / description / scoring guidance / good example;
      Critical disabled until Pass/fail ticked; dirty chip live.
- [x] Save: "Draft saved. Scoring is unchanged until you activate this
      version." Readiness flips to Meets requirements.
- [x] Activate: confirmation modal (summary + future-scoring-only copy +
      activation note) → confirmed → card flips to locked read view with
      fork CTA. No silent path anywhere.
- [x] Fork: locked v1 → draft v2 with weights/criteria/call types copied;
      readiness green; archive link correctly HIDDEN for the active card
      (it only renders for never-active cards).
- [x] Cleanup: all QA/probe cards archived via the API's own lifecycle,
      `seed:ufc-intelligence` re-run, seed validator 57/57.

**Blocker found & fixed during QA** — every mutation via the proxy answered
500 while GETs worked: browsers attach `Origin` to all POSTs, the proxy
forwarded it, and the API's CORS allow-list rejects any origin that isn't the
configured WEB_ORIGIN. The proxy now strips `Origin`/`Referer` (it is a
server-to-server client). See PREMIUM_UX_AUDIT §Day 228.

Known cosmetic leftovers: archived Day 228 QA/probe cards remain visible in
the scorecard list as honest history (nothing is ever deleted); a deletion
script exists in the session scratchpad if a pristine list is wanted before
demos. Readiness detail line says "1 criteria defined" (Day 226 helper,
fixture-pinned).

## Day 229 — Scorecard Studio builder UX QA

Open `/intelligence?tab=scorecards` as Dana, open/create a draft.

- [ ] Weight distribution strip renders above the stage rail; segments match
      the rail tint dots; changing a weight moves the strip immediately.
- [ ] Invalid total shows "must be 100% to activate (saving is fine)" and
      Save still works.
- [ ] Stage tiles show weight · criteria count, critical count when > 0, and
      "No criteria yet" on empty stages.
- [ ] Call types are chip toggles; selected chips read brand-tinted.
- [ ] Collapsed criteria rows show a one-line description/guidance preview;
      expanding reveals the full field set; Done collapses back.
- [ ] "Add criterion" opens the new row expanded with the label focused.
- [ ] "Criteria live inside the four core sales stages" copy visible; no AI
      Builder/Autofill controls anywhere.
- [ ] Readiness checks render two-up; activation still opens the
      confirmation modal; nothing activates silently.
- [ ] UFC Sales Scorecard stays locked/active with the fork CTA.

## Day 230 — Scorecard list demo hygiene QA

Open `/intelligence?tab=scorecards` as Dana. This closes the Day 228 "known
cosmetic leftover": archived QA/probe cards no longer sit inline — they live
in a collapsed Archived history section.

- [ ] "Scoring today" still names the UFC Sales Scorecard as active.
- [ ] Primary list shows Active first (UFC Sales Scorecard with Company
      default pill), then Drafts under their own heading — no archived cards
      inline.
- [ ] Group headings carry the honest copy: "Active scorecards affect future
      scoring." / "Drafts do not affect scoring until activated."
- [ ] Gravix Default card unchanged, read-only, in its usual position.
- [ ] Archived history sits last, collapsed, with a clean count
      ("Show N archived"); copy says archived cards stay available for
      history but do not affect future scoring.
- [ ] Expanding Archived history reveals the archived QA/probe cards, still
      clickable and readable — and with no restore or delete controls.
- [ ] Opening a draft still mounts the Day 229 builder (strip, chips,
      compact rows); create / save / fork / confirmed activation unchanged.
- [ ] Archiving a safe draft moves it into Archived history and the section
      auto-expands so the card is not hidden mid-action.
- [ ] If nothing is archived, no archive section renders at all.

## Day 232 — Context Engine workspace QA

Open `/intelligence?tab=context` as Dana.

- [ ] Hero band reads "Teach Gravix how your company sells" with the UFC
      published version (v1+) and honest draft status.
- [ ] Module rail shows eight modules with Not taught / Basic / Strong
      labels that match the seeded UFC content.
- [ ] Clicking a module swaps the focus editor; fields carry hints and
      character counts; nothing autosaves.
- [ ] Products / objections / competitors / compliance render read-only
      inside their modules with the "Read-only for now" note.
- [ ] Guidance panel is clearly static — no AI assistant, no Autofill,
      no website import anywhere.
- [ ] "View as Gravix sees it" shows the compiled block; Published/Draft
      toggle works.
- [ ] Save draft → publish flow unchanged; publish copy still says future
      scoring only.
- [ ] Scorecards tab still renders (Archived history collapse intact).
- [ ] DEMO NOTE: if a rehearsal edits/publishes over the seeded UFC
      context, re-run API `seed:ufc-intelligence` to restore the demo
      story before showing buyers.

## Day 233 — /intelligence premium walkthrough

Open `/intelligence` as Dana. The ten-second test: without clicking, the
page should say Gravix knows how UFC sells, knows what good calls look
like, and that only future scoring is affected by changes.

- [ ] Command band shows both pillars with live status lines (UFC context
      vN published; UFC Sales Scorecard active).
- [ ] Chips read: Published context vN · Active scorecard · Future scoring
      protected.
- [ ] Status strip: Context / Scorecards / Runtime / Safety cells match
      the seeded state; no invented claims.
- [ ] Clicking a pillar switches to that tab (same as the tab buttons).
- [ ] Context tab: Day 232 module rail workspace unchanged.
- [ ] Scorecards tab: Day 230 grouping + Archived history unchanged.
- [ ] Scoring impact panel lists the five facts; "Open call library" goes
      to /call-library; a recent call's review page shows provenance.
- [ ] No AI Builder / Autofill / scraping anywhere on the page.
- [ ] Band disappears cleanly for a rep login (tabs show the manager gate).

## Day 233 addendum — signed-in proof PASSED (Dana, 19 Jul 2026)

User signed in as dana.white@ufcelite.demo inside the preview browser; the
Day 230, Day 232 and Day 233 walkthroughs were all run live and PASSED:

- Command band: both pillars with real status ("Published v1 · draft in
  progress" / "UFC Sales Scorecard v1 active · 1 draft waiting"), all three
  chips, four-cell strip matching seeded state. Pillar click switches tab
  and writes ?tab=.
- Context tab: hero stats (v1 published 16 Jul, 7/8 modules taught, 3
  objections), module rail strengths from real content (Company profile
  Strong, Sales motion Basic, ICP Basic, Products Strong, Objections
  Strong), focus editor switching, static guidance, "View as Gravix sees
  it" compiled block with Published/Draft toggle. No saves or publishes
  were made during proof.
- Scorecards tab: "Scoring today: UFC Sales Scorecard v1", Active/Drafts
  group copy, Gravix Default read-only bars, Archived history collapsed
  with "Show 6 archived"; expanded, the six Day 228 QA/probe cards are
  readable with no restore/delete controls.
- Scoring impact panel: all five facts + provenance bridge + Open call
  library. Zero console errors throughout; no Autofill/AI-assistant text
  anywhere.

Environment gotcha recorded: running `npm run build` and then starting
`next dev` on the same .next serves a blank page (chunk 404, empty body,
no error). Fix: stop server, `rm -rf .next`, restart. A pinned-port
launch config (`web-proof`, port 49361) exists so a dev restart keeps the
per-origin login alive.

## Day 234 — demo reseed + full signed-in proof PASSED (Dana, 19 Jul 2026)

Reseed chain run clean (seed:demo → seed:ufc-story → seed:ufc-intelligence).
API validators: context PASSED, scorecards PASSED, runtime 53/53, UFC
intelligence seed 57/57, team management 15/15; API typecheck at the 60
baseline. WEB validators 233/232/230/229/228 + design-system + smoke all
PASSED; build warning-free; WEB typecheck at the 186 baseline.

Signed-in walkthrough as dana.white@ufcelite.demo on the pinned proof
origin (localhost:49361), all PASSED:

- /dashboard renders; logged-out redirect to /login proven earlier same
  day at this origin; /login brand verified.
- Call library: proof call under "My calls"; hero call under "Company
  calls" (it belongs to the rep — this is scoping, not a bug).
- Hero call (Nate Diaz — Price Objection Call, 45/100): Gravix default
  rubric, no company provenance — the intended calm default state.
- Proof call (Nate Diaz — Pricing Follow-up Call, 62/100): "Scored with
  UFC Sales Scorecard v1 · Company context v1 applied" + review audit
  with per-stage evidence.
- /intelligence: command band pillars/chips/strip live; Context tab v1 +
  7/8 modules + compiled preview; Scorecards tab UFC v1 active, archived
  collapsed ("Show 6 archived"); Scoring impact panel present.
- /team and /crm/analytics: human names, no raw UUIDs anywhere.
- Zero console errors across the whole walkthrough; no Autofill/AI
  Builder text anywhere.

Known cosmetic (not a blocker): the seeded proof call has no audio object,
so GET /signed-audio returns 500 in the network log; the page degrades to
the honest "No audio available for this call" state. If audio matters for
a demo beat, use the hero call's player instead.

## Day 235 — demo route guidance

Show freely: /dashboard, /call-library, /calls/[id], /coaching,
/assignments, /upload, /crm/analytics, /crm/overview, /crm/manager,
/crm/accounts, /team, /intelligence.

Resolved former C-grades:
- /crm/actions now redirects to /crm/overview (orphan demoted).
- /crm/tasks is shell-adopted and safe if reached via Pipeline → Tasks.
- /admin/users is explicitly framed "Control Plane · Internal admin";
  partneradmin-only nav; managers get a calm access-denied. Keep it out
  of demos on principle — it is internal tooling, not product story.

---

## Day 250 — Objection Library checklist

/intelligence?tab=objections (Dana / manager):
- [ ] Objections tab loads; Context and Scorecards tabs still load.
- [ ] Empty state offers "New objection" (no coming-soon buttons).
- [ ] Create a draft (label only is enough); it appears under Drafts.
- [ ] Edit draft fields; readiness lists what approval still needs.
- [ ] Save draft, then Approve — confirmation says "Future coaching can use
      this approved guidance. Existing call scores do not change."
- [ ] Approved item is locked/read-only; moves under Approved guidance.
- [ ] Archive (confirmed) moves the item to Archived history (collapsed).
- [ ] Evidence panel shows the honest empty message when none exists.
- [ ] No raw UUID labels; zero console errors.

## Day 251 — Objection Library browser proof (PASSED)

Signed in as Dana (dana.white@ufcelite.demo, UFC Elite) against the running
web + api dev servers; walked the live rendered UI at
/intelligence?tab=objections. Library started empty (no seeded UFC
objections), so a clearly-labelled throwaway "QA TEST — Day 251 (delete me)"
was used for the full lifecycle — no seeded demo objection was touched.

Result: every checklist item passed. Verified in the real UI:
- [x] Objections tab loads; Context and Scorecards tabs still load.
- [x] Command band (Context/Scorecards) + status cards render (Approved /
      Drafts / Archived / Categories covered).
- [x] Approved/draft/archived grouping renders; Archived history collapsed by
      default (disclosure toggle).
- [x] "New objection" modal opens; hint "Only a label is needed to save a
      draft." Draft created with label only → appears under Drafts.
- [x] Readiness lists missing requirements (buyer phrase / approved response /
      coaching note or why-it-matters). Approve button honestly disabled
      ("Fill in the required fields before approving").
- [x] Edited every field — label, category, buyer phrases, why it matters,
      approved response, weak response patterns, no-go language, coaching note.
- [x] Save persists (PUT 200); readiness turns green ("Ready to approve — all
      required guidance is in place").
- [x] Approve confirmation carries exact copy: "Future coaching can use this
      approved guidance. Existing call scores do not change." Approve succeeds
      (POST /approve 200).
- [x] Approved item is locked/read-only ("Approved guidance is locked. Editing
      is disabled to keep coaching consistent."); only Archive remains — no
      edit controls; Categories covered ticked to 1/8.
- [x] Evidence honest empty state ("Evidence will appear here when this
      objection is linked to calls or moments.").
- [x] Archive confirmation ("...move to Archived history and can no longer be
      edited. Nothing is deleted — you can still read it."); archive succeeds
      (POST /archive 200); item moves to Archived history, read-only.
- [x] No delete controls anywhere; no AI Builder / Autofill / suggestion-mining
      copy; no raw UUID primary labels; zero console errors.
- [x] All calls went through /api/proxy (GET/POST/PUT only, no DELETE).

Cleanup: the QA test objection was carried through create → approve → archive
and left in Archived history. The data layer has no hard-delete by design
(no DELETE endpoint), so archived is the terminal safe state; the item is
clearly labelled "QA TEST — Day 251 (delete me)" and can be purged directly
from the DB if desired. No seeded demo objections exist in the UFC org.

Validators (all green): validate-objection-library-day-250,
validate-intelligence-workspace-day-233, validate-tier-2b-smoke.
typecheck: one pre-existing failure in src/hooks/useInfiniteScroll.ts (an
orphaned page component mis-saved as a .ts hook, imported by nothing —
unrelated to the objection library; flagged for separate cleanup).
No code changes required.

## Day 252 — Objection Library seeded with demo content (API seed)

Supersedes the Day 251 note "No seeded demo objections exist in the UFC org."
`npm run seed:ufc-intelligence` (API repo) now seeds **8 manager-approved
objections** into the UFC demo company so /intelligence?tab=objections is no
longer empty in demos: Too expensive (price), Need to think about it (timing),
Send me more information (timing), Need to speak with my partner (authority),
We already have training (competitor), Not the right time (timing), I don't
trust AI coaching (trust), Not sure it fits our team (fit). Six categories
covered; each carries buyer phrases, an approved response, weak-response
patterns, no-go language and a coaching note.

Proven at the API/DB level (WEB visual proof pending a Dana login):
- validate:ufc-objection-seed 22/22 — exactly the 8 deterministic seeded ids
  exist, all approved, idempotent across re-runs (no duplicates), category
  coverage, content completeness, no duplicate live label, API lists all 8 to
  Dana, cross-company manager sees none.
- validate:intelligence-objections 48/48 · validate:crm-account-ownership 8/8
  · validate:schema-selects (6 baselined, no new drift) · typecheck 60 (baseline).
- DB confirms 9 UFC objection rows: 8 approved (seed) + 1 archived (the Day 251
  "QA TEST — Day 251 (delete me)" item, untouched by the seed).

Full pre-demo reseed run to close the hero-call gap, in order:
seed:demo → seed:ufc-story → seed:ufc-intelligence. After the reseed the whole
UFC demo suite is green together: validate:ufc-intelligence-seed 57/57 (Nate
Diaz hero call restored, score 45), validate:ufc-objection-seed 22/22,
validate:intelligence-objections 48/48, validate:crm-account-ownership 8/8,
validate:schema-selects (no new drift), typecheck 60. The 8 seeded objections
survive the reseed and the Day 251 QA item stays archived (still 8 approved +
1 archived). No code changes were needed — the reseed alone closed the gap.

Demo-state expectation for the next WEB proof as Dana: Approved = 8, Categories
covered = 6/8, approved group shows the 8 seeded objections, and the Day 251 QA
item remains in Archived history.

## Day 253 — Seeded Objection Library visual proof (PASSED)

Signed in as Dana (dana.white@ufcelite.demo) against the running web + api dev
servers after the Day 252 pre-demo reseed; walked the live rendered UI at
/intelligence?tab=objections. Every checklist item passed — no bugs, no code
changes needed.

Counts observed (status cards): Approved = 8 · Drafts = 0 · Archived = 1 ·
Categories covered = 6/8 — exactly as expected.

Approved Guidance lists all 8 seeded objections, each with a human label, a
category and "3 buyer phrases", stamped "Updated 19 Jul 2026":
- Too expensive (Price)
- Need to think about it (Timing)
- Send me more information (Timing)
- Need to speak with my partner (Authority)
- We already have training (Competitor)
- Not the right time (Timing)
- I don't trust AI coaching (Trust)
- Not sure it fits our team (Fit)

Verified in the rendered UI:
- [x] Objections tab loads; Context and Scorecards tabs still load (Company
      Intelligence + UFC Sales Scorecard v1 active).
- [x] Opened "Too expensive": read-only locked ("Approved guidance is locked.
      Editing is disabled to keep coaching consistent."), all fields static
      text (buyer phrases / approved response / coaching note / weak patterns /
      no-go language); only the Archive lifecycle action, no edit inputs.
- [x] Evidence honest empty state ("Evidence will appear here when this
      objection is linked to calls or moments.").
- [x] Archived history collapsed by default; expanded shows "QA TEST — Day 251
      (delete me)" badged Archived, read-only ("Archived history. This
      objection is kept for reference and can no longer be edited.") — untouched.
- [x] No raw UUID labels; no delete controls anywhere; no AI Builder / Autofill
      / suggestion-mining copy (only "New objection"); zero console errors.

Supersedes the "WEB visual proof pending" note above — the seeded Objection
Library is now visually proven end-to-end.
