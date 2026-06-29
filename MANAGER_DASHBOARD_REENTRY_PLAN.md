# Manager Dashboard — Sprint Re-entry Plan (Day 148)

Re-entering the main sprint after the Tier 2B Live Whisperer + AI Trigger
Discovery closeout. Tier 2B is closed — Whisperer is bug-fixes only from here.
**No new Whisperer feature expansion.** This lane turns the intelligence already
built into clear manager-facing value.

Product rule preserved: Gravix does not own the call. Gravix listens, coaches the
rep, scores the session, and trains the team.

---

## 1. Current manager surfaces

- **`/coaching` — "Command Centre"** (3,000+ lines). The de-facto manager hub.
  Tabs: **Overview · Interventions · Assignments · Replay Queue · Review Queue**.
  Overview already aggregates: Team Health stat cards (status, average score,
  reviewed calls, calls needing review, open + overdue assignments), Reps Needing
  Attention, Calls Needing Review, Open Coaching, Weakest Skills, Estimated
  Manager Time Saved, Coaching Impact, Recent Sparring, Whisperer Insights,
  Suggested Trigger Candidates, Custom Triggers.
- **`/dashboard`** — rep-focused (XP, tier, personal assignments, voice-score
  trend). Not a manager view.
- **`/crm/manager`** + **`/crm/manager/control-centre`** — CRM-side manager
  tooling (auto-assign, nudges, contacts). `control-centre/page.tsx` is a 6-line
  stub.
- **`/recent-calls`** (4-line stub), **`/calls/[id]`** (call detail + Whisperer
  Moments + manager-review action), **`/reps/[id]`** and `/reps/[id]/sparring`.

## 2. Current data available (API)

- `GET /v1/manager/command-centre` — team health, reps needing attention, calls
  needing review, open assignments, weakest skills, coaching impact, ROI.
- `GET /v1/manager/review-queue` — calls needing manager review.
- `GET /v1/manager/sparring-sessions` — recent sparring + summaries.
- `GET /v1/manager/whisperer-sessions` — live Whisperer sessions + objections.
- `GET /v1/manager/whisperer-trigger-candidates` (+ decisions, library CRUD).
- `GET /v1/crm/manager/control-centre`, `GET /v1/dashboard/reporting-summary`,
  `GET /v1/assignments/manager`, `GET /v1/calls/paged`.

The data layer is rich and already org/tenant-scoped via `applyHierarchyFilters`.
The gap is **presentation and discoverability, not data**.

## 3. Main gaps

1. **No clear manager entry point.** The command centre lives under "Coaching" in
   nav; a manager landing/home that orients ("what needs me now") is missing.
2. **Everything is on one 3,000-line page.** Whisperer Insights, AI Discovery and
   Sparring sit far down the Overview tab — manager-critical but buried.
3. **No "what to do next" triage.** The data to prioritise (calls to review,
   overdue assignments, reps at risk, candidates to review) exists but the
   manager must scan many cards to find it.
4. **Scattered "command centre" concept** — split between `/coaching` and
   `/crm/manager`; `control-centre` and `recent-calls` are stubs.
5. **Weak cross-linking** between Whisperer Insights ↔ AI Discovery ↔ Custom
   Triggers even though they share the page (no jump/anchor affordances).
6. **Thin manager empty-states** for first-run / no-data tenants (demo risk).

What can improve **without a migration**: triage/"what to do next" panel,
tab/section jump affordances, cross-links, clearer headings and empty-states,
and consolidating the stubs — all from already-loaded data.

## 4. Recommended dashboard sections

- **Team Overview** — active reps, recent reviewed calls, average score, open
  coaching assignments. *(present as Team Health stat cards)*
- **Coaching Queue** — calls needing manager review, lowest-scoring sections,
  reps needing attention. *(present, spread across Review Queue tab + Overview)*
- **Whisperer Insights** — recent live sessions, top objections, suggestion-used
  rate, custom triggers needing editing. *(present)*
- **AI Discovery** — suggested trigger candidates, blind spots, reviewed
  candidates. *(present, with Day 146 coverage counters)*
- **Sparring Progress** — recent sparring sessions, completion rate, weakest
  skills. *(partial — Recent Sparring card; completion rate available via
  reporting-summary)*
- **Manager Actions** — review call, assign coaching, approve trigger candidate,
  restore candidate, create custom trigger. *(all present but scattered;
  consolidate into a clear action surface)*

## 5. Five-day mini-plan (from Day 149)

- **Day 149 — Manager Dashboard Home / Coaching Command Centre.** Promote a clear
  top-level manager landing: a "what needs me now" triage band + jump links into
  the existing tabs/sections. No new API. *(Day 148 ships a first slice of this.)*
- **Day 150 — Coaching Queue consolidation.** Unify Review Queue + Calls Needing
  Review + Reps Needing Attention into one coherent triage flow.
- **Day 151 — Whisperer Insights ↔ AI Discovery cross-linking.** Wire the three
  Whisperer/Discovery cards together with anchored navigation and suggestion-used
  rate surfaced up top.
- **Day 152 — Sparring Progress panel.** Completion rate + weakest skills from
  existing sparring + reporting data; link to `/reps/[id]/sparring`.
- **Day 153 — Demo readiness polish.** Manager empty-states, consolidate the
  `control-centre`/`recent-calls` stubs, headings, spacing, copy pass.

## 6. Definition of done (Manager Dashboard lane)

- A manager landing clearly answers "what needs me now" within one screen.
- Coaching Queue, Whisperer Insights, AI Discovery, Sparring Progress and Manager
  Actions are each reachable in ≤1 click from the manager landing.
- No new migration; all data from existing endpoints.
- Manager approval gates preserved (no auto-create / no auto-activate triggers).
- Tier 2B behaviour unchanged; smoke + own-checks green; build + typecheck at
  baseline (WEB ~186, API ~70).
- Sensible manager empty-states for first-run / no-data tenants.

## 7. Out of scope

- New Whisperer features (bug fixes only).
- CRM dialler, phone system, native call system.
- Browser extension.
- Voice output / AI talk-back.
- Advanced audio feature extraction / tone scoring.
- New migrations (unless a bug fix absolutely requires one).

---

## Day 149 recommendation

**Day 149 — Manager Dashboard Home / Coaching Command Centre.** It becomes the
top-level manager control centre that links to all the intelligence already
built (team health, coaching queue, Whisperer Insights, AI Discovery, sparring),
turning the existing data into a demo-ready manager surface with no new backend
work. Day 148 lands the first slice: a compact "What to do next" triage panel on
the Overview tab.

---

## Day 149 — Manager Command Centre header (shipped)

WEB-only. No API change, no migration. Built entirely on data already loaded by
the Overview tab (`/v1/manager/command-centre`, `/v1/manager/sparring-sessions`,
`/v1/manager/whisperer-sessions`, `/v1/manager/whisperer-trigger-candidates`).

Implemented on `/coaching` Overview tab:

- **Command Centre header** — "Your team coaching command centre" headline +
  "Review calls, assign drills, and act on the highest-priority coaching
  moments." Promotes the Day 148 triage into a proper top manager action area.
- **Priority action cards (4)** — Review calls · Coach reps at risk · Assign
  sparring · Review AI discovery candidates. Each shows a count, a short reason,
  and a CTA that jumps to the relevant tab/section (Review Queue, Interventions,
  Assignments, and a smooth-scroll anchor to AI Discovery).
- **Team coaching snapshot** — small stat row: calls needing review, open
  assignments, reps needing attention, trigger candidates / Whisperer sessions.
- **Sparring progress snapshot** — recent / completed counts, average score and
  weakest area from the already-loaded sparring sessions.
- **Recommended sparring drill mapping** (`sparringDrillForText`) — maps a weak
  skill / section / risk reason to a drill label (e.g. "Price objection
  sparring", "Closing confidence drill", "Discovery question drill", "Opening
  structure drill"). Surfaced in the Assign-sparring action card and on each
  Reps-Needing-Attention row as "Recommended drill: …" + an "Assign sparring"
  CTA (jumps to the Assignments tab — no new endpoint, no auto-creation).
- **Manager empty-states** — "No calls waiting for review.", "No reps need urgent
  coaching.", "No new AI trigger candidates yet.", "No sparring sessions
  completed yet."

Manager approval gates preserved — nothing auto-creates or auto-activates. Tier
2B behaviour unchanged.

### What remains for Day 150+

- **Day 150** — Coaching Queue consolidation (Review Queue + Calls Needing Review
  + Reps Needing Attention into one triage flow).
- **Day 151** — Whisperer Insights ↔ AI Discovery cross-linking + suggestion-used
  rate surfaced up top.
- **Day 152** — Fuller Sparring Progress panel (completion rate from
  reporting-summary; link to `/reps/[id]/sparring`).
- **Day 153** — Demo polish; consolidate `control-centre` / `recent-calls` stubs.
- **Wire "Assign sparring" to a real assignment/drill create flow** once a safe
  endpoint is confirmed (today it routes to the Assignments tab).
