# Demo Readiness Plan — Lighthouse Client Prep (Day 160)

First Demo Readiness / Lighthouse Client Prep layer for Gravix AI Sales Trainer.
This is a readiness audit and runbook — not a new feature lane. It maps a clean
manager demo path, audits demo-facing routes, and lists what must be polished or
avoided before showing Gravix to real lighthouse clients.

**Product rule (always true):** Gravix does not own the call. Gravix listens to
the call, coaches the rep, scores the session, and trains the team. The manager
stays in control — nothing is auto-created, auto-activated, or auto-completed.

---

## 1. Demo positioning

> **Gravix helps sales managers review calls, assign targeted practice, and
> track coaching follow-through from one command centre.**

One manager surface. Real calls in, weak skills surfaced, targeted sparring
assigned, follow-through tracked, and AI-discovered coaching moments reviewed —
all without Gravix touching the dialler or the phone system.

---

## 2. Demo narrative (7-step walkthrough)

The whole story runs from **/coaching** (the Manager Command Centre). Steps 1–7
are a single linear path a manager can click through live.

1. **Open Manager Command Centre** — land on `/coaching`. The Demo flow strip at
   the top of the Overview tab is the spine of the demo.
2. **Show the team coaching snapshot** — priority actions, reps at risk, team
   health headline. Manager sees where to spend attention first.
3. **Open the Coaching Queue** — the prioritised list of reps/calls that need a
   manager decision (the "Assign sparring" step jumps here).
4. **Review a weak skill / call needing review** — open the Review Queue tab or a
   reviewed call at `/calls/[id]`; the weak skill and recommended drill are shown.
5. **Assign the recommended sparring** — manager clicks to assign the targeted
   drill to the rep. Manager-initiated only; nothing auto-assigns.
6. **Show queue-assigned sparring follow-through** — the queue-assigned sparring
   block shows the drill was assigned, then its completion proof and score trend.
7. **Show AI Discovery / Whisperer Insights** — review AI-discovered trigger
   candidates and Whisperer session moments; manager approves or defers. AI
   discovers, managers approve — no auto-create, no auto-activate.

---

## 3. Safe routes to show

| Route | Status | Notes |
|-------|--------|-------|
| `/coaching` | **Primary demo route** | Manager Command Centre. Start here. Demo flow strip drives the whole story. |
| `/calls/[id]` | Show if demo call exists | Call review: weak skill, recommended drill, replay/trigger moments. Only open a reviewed call. |
| `/call-library` | Show only if populated | Real list of past calls/sessions; depends on seeded demo data. `/recent-calls` redirects here. |
| `/dashboard` | Optional (rep view) | Rep-side dashboard. Optional to show the rep perspective; not central to the manager story. |
| `/sparring/[id]` | Show if a seeded drill exists | The sparring drill runner. Use a known-good drill only. |
| `/whisperer` | Show with care | Live Whisperer session with moments. Avoid the local simulator flake; show a seeded session, not a cold start. |

---

## 4. Avoid / risky routes

- `/crm/manager/control-centre` — **redirects to `/coaching`**. Not a demo route;
  don't navigate here on stage (it just bounces).
- `/recent-calls` — redirects to `/call-library`. Link to `/call-library` directly.
- `/dev/audio-test`, `/health`, `/admin/status` — internal/diagnostic. Never demo.
- Deep `/admin/*` and `/crm/*` sub-pages (auto-assign runs, partners, nudges,
  imports) — out of the manager coaching story; skip unless asked.
- Any route that depends on unseeded data — an empty critical card reads as broken.
  Verify data is loaded before navigating (see §5).

---

## 5. Demo data checklist

Minimum seeded data for a clean run:

- [ ] 2–3 reps in the org
- [ ] 3–5 reviewed calls
- [ ] 1 low-score call (drives the "weak skill" moment)
- [ ] 1 rep needing attention (shows in Coaching Queue / at-risk)
- [ ] 2 open assignments
- [ ] 1 queue-assigned sparring drill
- [ ] 1 completed sparring proof row (completion proof + score trend)
- [ ] 1 AI trigger candidate (for the AI Discovery approve step)
- [ ] 1 custom trigger
- [ ] 1 Whisperer session with moments
- [ ] 1 call replay with trigger moments

---

## 6. Lighthouse client readiness checklist

- [ ] Login works (manager account)
- [ ] Manager demo route (`/coaching`) stable and fast
- [ ] Sample data loaded (all of §5)
- [ ] No broken CTAs anywhere in the demo path
- [ ] No obvious empty critical cards on the demo path
- [ ] Pricing / value story ready
- [ ] Data privacy explanation ready (Gravix listens, does not own the call)
- [ ] Onboarding runbook drafted

---

## 7. What not to demo yet

- Tier 2C voice sparring (paused)
- Tier 2D audio scoring (paused)
- Native call system / dialler / phone system / CRM calling (paused)
- Browser extension (paused)
- Advanced AI auto-actions
- **auto-create** triggers — never; managers approve
- **auto-activate** triggers — never; managers activate
- Auto-completing assignments without a manager click

---

## 8. Day 161 — UX simplification (done)

UX simplification started ahead of demo data work. On `/coaching`:

- **Upload Call is now visible from `/coaching`** — a primary CTA in the Command
  Centre header (and the first step of the workflow strip).
- The "Demo flow" strip was refined into a calmer **Manager workflow** navigation
  strip: Upload Call → Review Calls → Coaching Queue → Sparring → AI Discovery.
- Upload Call was also promoted into the sidebar so managers never hunt for it.
- Shouty "Start demo here" badge softened to a calm "Start here"; header copy now
  leads with "Start by uploading a recorded sales call."

See [UX_SIMPLIFICATION_PRINCIPLES.md](UX_SIMPLIFICATION_PRINCIPLES.md) for the
principles future days must follow.

**Next step:** demo data readiness check — run the §5 checklist against a real
demo org and fix the first gap found.

---

## 9. Day 162 — Upload flow structured linking (done)

The Upload Call page was restructured for cleaner demo data and a calmer flow.

- **Structured linking started.** `/upload` now asks "Who is this call for?" first,
  with an **Account / Company** picker (CRM accounts via `GET /v1/accounts`) and a
  **Rep** picker (team members via `GET /v1/team/users`).
- **Account linking persists.** A small fail-soft API patch makes
  `POST /v1/upload/finalize` accept an optional `accountId` and write it to the
  existing `calls.account_id` column (no migration). If linking is rejected the
  upload still succeeds without the link.
- **Free-text fallback preserved.** When no CRM accounts/reps are available the
  page falls back to free-text fields, and the rep name remains the required
  field — quick demos still work.
- **Calmer layout + copy:** three numbered steps (who → context → recording), a
  primary "Upload and send to review queue" CTA, a "Back to Manager Command Centre"
  secondary, and clearer post-upload success with Command Centre / View call /
  Upload another call actions.

**Remaining demo-data gap:** the `calls` table has no column for rep linkage
(rep = uploader `user_id`), call type, or a free-text tag/label, so rep / call
type / tag are UI-organisational only and do not yet persist server-side.

**Next step (Day 163):** compact the layout — the structured form was correct but
too tall — and add a clear "create new client" path.

---

## 10. Day 163 — Upload layout compacted + create client CTA (done)

WEB-only UX pass; no API change, no migration.

- **Layout compacted.** The three separately-bordered step cards collapsed into a
  single card with small labelled groups (**Call ownership**, **Call context**,
  **Recording**); narrower max width, smaller paddings, tighter dropzone and helper
  text. The form now fits on a normal laptop screen without zooming out.
- **Create new client CTA.** A calm "Create new client" link sits beside the
  Account / Company field and opens the existing `/crm/accounts` management page
  (which already has an account-create modal backed by `POST /v1/accounts`).
- **Temporary fallback preserved.** "Client not listed? Add a temporary label" —
  a free-text company label remains available whenever no account is selected, and
  the rep free-text fallback / required rep field are unchanged.
- **Calmer copy:** subtitle "Link the recording to the right client, rep and review
  queue"; success "Call uploaded. We'll add it to the review queue once processing
  finishes." with Open Command Centre / View call / Upload another.

**Remaining account-creation gap:** there is still no inline create-client flow on
`/upload` itself — managers create accounts on `/crm/accounts` in a separate tab,
then return. Rep / call type / tag remain UI-only (no column), as in Day 162.

**Next step (Day 164):** fix the `missing_user` processing failure seen in demo
testing and use the desktop width better.

---

## 11. Day 164 — Fix upload user linking + better space usage (done)

WEB-only fix + layout pass; no API change, no migration.

- **`missing_user` fixed.** The job-status poll after upload used a raw `fetch`
  with no auth headers, so the Next proxy (`/api/proxy`) could not resolve the
  user and returned `missing_user` 401 — even though init + finalize (which go
  through the authenticated `jfetch` helper) succeeded and the call row was
  created with `user_id`. Polling now routes through a new authenticated
  `getJobStatus()` helper, carrying the same `Authorization` / `x-user-id`
  context. No API change; the authenticated uploader remains the call owner.
- **Better desktop space usage.** `/upload` is now a two-column layout (form on
  the left, calm guidance on the right) at `max-w-5xl`, stacking on mobile, so
  the page fills the width instead of floating with dead space.
- **Right guidance panel:** "What happens next" (upload → review queue → manager
  reviews score / weak skills / coaching actions), a "Need a new client?" create
  link (opens Accounts in a new tab), and a calm "Demo tip".
- **Clearer error copy:** processing failures now read "Call uploaded, but
  processing could not start." with a "Reason: …" line and the retry action kept.

**Remaining metadata gap:** rep / call type / tag are still UI-only (no DB column;
rep = uploader `user_id`), as in Day 162–163.

**Next step (Day 165):** prove the uploaded call actually reaches the manager
Review Queue.

---

## 12. Day 165 — Upload → Review Queue pipeline proof (done)

Traced the full path Upload → transcribe → score → Review Queue.

**Pipeline (happy path):** `finalize` inserts `calls` (`status: queued`) + a
`transcribe` job → the worker sets `status: processed` and enqueues a `score`
job → the score worker sets `status: scored` + `score_overall`. The manager
Review Queue (`GET /v1/manager/review-queue`) and Command Centre only surface
calls with `status = "scored"`, scoped by the manager's hierarchy
(`applyHierarchyFilters` → `office_id` / `company_id`), and the Review Queue
additionally keeps only calls with a review reason (score < 70 or a stage < 50).

**Root cause (ownership/scope mismatch):** `finalize` created the call **without
`office_id` / `company_id`**. For a company/office manager, the queue filters
`.eq("office_id", …)` / `.eq("company_id", …)`, so the manager's own upload
(null office/company) was filtered out and never appeared — even after scoring.

**Fix (smallest correct layer):** `finalize` now stamps the uploader's
`office_id` / `company_id` from their `users` row (fail-soft; no migration,
columns already exist). Uploader remains the call owner.

**Secondary (by design, documented):** a well-scored call has no review reason,
so it correctly does not appear in the *Review Queue*; it is still in the Calls
list / Command Centre. Scoring is also async — right after upload the call is
`processed`, becoming `scored` a few seconds later.

**Expected post-upload UX:** the success screen now polls the call status and
shows "Call uploaded. Processing has started." → "Call ready for review." once
scored, with an **Open Review Queue** CTA that deep-links to
`/coaching?tab=review`, plus Command Centre / View call / Upload another. Failures
read "Call uploaded, but processing could not start." + "Reason: …".

**Remaining demo-data checklist item:** confirm on a real demo org that the
uploader has a `users` row with `office_id` / `company_id` set (otherwise the
call is stamped null and stays out of a manager's scoped queue), and seed at
least one low-scored call so the Review Queue is non-empty.

**Day 166 recommendation:** run the §5 demo-data checklist live end-to-end, then
either persist rep / call type / label (small migration) or inline a create-client
modal on `/upload`.

---

## 15. Day 166 — Live upload → Review Queue proof (done)

**Live proof PASSED end-to-end** against the running local stack (API `tsx watch`
at 791c8a5 + Day 166 patch): signed init → storage PUT → finalize → transcribe
job (`gpt-4o-mini-transcribe`, real transcript) → score job → `status: scored`
(score 45) → the call appeared in `GET /v1/manager/review-queue` with reasons
("Score below 70", Discovery/Objection/Close below 50). No `missing_user` at any
step. The Day 165 stamping fix is proven live: the call row carried the
uploader's `office_id`, `company_id` and the selected `account_id`.

**Demo user/org linkage confirmed:** the primary manager login
(george@gravixbots.com, `office_manager`) has both `office_id` and `company_id`
on its `users` row, so its uploads land in its own scoped Review Queue.
(Note: uploads made *before* Day 165 — e.g. call_16/call_19 — have null
office/company stamps and stay out of scoped queues; re-upload if they are
needed in a demo.)

**Blocker found + fixed (API):** the seeded demo-org managers
(dana.white@ufcelite.demo, hunter.campbell@ufcelite.demo) are `office_manager`
with **no `office_id`**. `applyHierarchyFilters` emitted `.eq("office_id", null)`
— a Postgres uuid error — so every hierarchy-scoped manager endpoint (Review
Queue included) returned 500 for those personas. Fix: guard the filter — office
managers without an office fall back to company scope (then unscoped, matching
the existing null-context behaviour). Verified live: dana.white now sees the 8
low-scored demo calls; tenant isolation preserved in both directions (demo org
does not see the gravixbots upload and vice versa).

**Empty-queue copy check:** `/coaching` already explains the behaviour — empty
state "No calls need review right now." under the card subtitle "Lowest scores
first · score below 70 or a critical section." No copy patch needed.

**Day 167 recommendation:** finish the §5 demo-data checklist against the demo
org (assignments, sparring proof, AI trigger candidate, Whisperer session), then
persist rep / call type / label on upload (small migration) or inline a
create-client modal on `/upload`.

---

## 16. Day 167 — Demo data checklist + live walkthrough (done)

**Checklist run against the seeded demo org** (UFC Elite Sales Team, manager
login dana.white@ufcelite.demo) via read-only DB audit + a full live browser
walkthrough of the Manager Command Centre path. Full results in
`DEMO_DATA_READINESS_AUDIT.md`.

**Result summary:** the core manager story (open `/coaching` → Command Centre →
Review Queue (8 calls) → Coaching Queue (15 flags) → reps at risk → recommended
drills) is **Ready**. Sparring proof/score trend, AI Discovery, Whisperer replay
and custom triggers are **empty in the demo org** (all live Whisperer/proof data
sits in the gravixbots dev company) — the UI shows calm, honest empty states for
each, so these are documented gaps, not broken pages.

**Top blocker found + fixed (API, priority 3 — call detail broken):** opening
any rep call from the Review Queue as a seeded demo manager returned **403
forbidden** and rendered an empty "Queued" call page. Root cause:
`getRequesterOrgId` (calls route) derived the requester's org from *their own
most recent call* — a manager who has never uploaded a call resolved to no org
and failed `canAccessCall`. Fix: fail-soft fallback to the requester's
`reps.org_id` (org visibility rules unchanged, default "everyone" still
applies). Verified live: dana.white now opens demo-call-9 (45/100, summary,
Mark Reviewed / Assign Coaching) straight from the queue.

**Deferred (documented, not fixed today):**
- `/v1/manager/whisperer-trigger-library` + `whisperer-trigger-candidate-decisions`
  return 500 for the demo managers (`invalid input syntax for type uuid: "null"`
  — same null-office class as Day 166, different endpoints). Panels still show
  calm empty states.
- Pins endpoint returns "forbidden" for managers on rep calls (list shows
  "No pins yet", non-blocking).
- Upload pickers for dana show 1 account / 1 rep (scoped to the wrong company);
  free-text rep + temporary label fallbacks keep the flow usable.
- Seeded calls have no transcript and "Weakest: Unknown" stage labels.
- Seeded calls are dated 2–8 June; the 30-day Review Queue window empties
  around 8 July — re-run `npm run seed:demo` before a demo after that.

**Day 168 recommendation:** patch the null-office uuid bug in the two
trigger-library/decision endpoints (same guard as Day 166's
`applyHierarchyFilters` fix), then decide whether to seed demo-org Whisperer +
sparring-proof data or demo those features from the dev company login.

## 17. Day 167 — Demo org blocker patch + seed strategy (done)

**Demo org blocker patch (API):** the null-office uuid 500s in
`GET /v1/manager/whisperer-trigger-library` and
`GET /v1/manager/whisperer-trigger-candidate-decisions` are fixed —
`applyLibraryScope` now uses the Day 166 rule (office scope if present, else
company scope). Demo managers with `office_id` null no longer 500 on the
Custom Trigger Library or reviewed-candidate history; tenant isolation
unchanged. Pins (ownership-gated, not needed for demo) and the wrong-company
upload rep picker (`/v1/team/users` is fully unscoped — real fix is Day 168)
were audited and deferred with root causes documented in
`DEMO_DATA_READINESS_AUDIT.md`.

**Seed strategy chosen:** single-org demo — **seed the UFC Elite org and run
the entire lighthouse demo as dana.white**; never switch to the dev-company
login mid-demo. Seed list (Whisperer session, 2–3 trigger moments, replay
link, AI trigger candidate, custom trigger, queue-assigned sparring drill,
completed sparring proof + second trend row, optional fresh upload) and the
copy-vs-script trade-off are in `DEMO_ORG_SEED_STRATEGY.md`. Recommendation:
extend `npm run seed:demo` so re-seeding stays one repeatable command.

**Day 168 recommendation:** build the seed-script extension for the UFC org
Whisperer/sparring chapters, fix the five unguarded
`.eq("office_id", …)` filters in `assignments.ts` (likely cause of the
"14 open assignments but Command Centre shows 0" finding), and add tenant
scoping to `/v1/team/users`.
