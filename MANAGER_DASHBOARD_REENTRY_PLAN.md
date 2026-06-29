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

---

## Day 150 — Coaching Queue consolidation (shipped)

WEB-only. No API change, no migration. Built entirely on data already loaded by
the Overview tab (`/v1/manager/command-centre`).

Implemented on `/coaching` Overview tab, directly below the Day 149 Manager
Command Centre header:

- **Coaching Queue panel** — "Prioritised coaching moments from reviews, rep risk
  signals and open assignments." Consolidates four scattered signals into one
  prioritised list of up to 6 items:
  - **Call review** — calls needing review (High when score < 50, else Medium).
  - **Rep risk** — reps needing attention (High when red risk, else Medium).
  - **Assignment** — open / overdue assignments (overdue or high priority = High).
  - **Weak skill** — weakest team skills (High when average score < 50).
- Each item shows a **priority badge** (High / Medium / Low), a **type badge**, a
  title, a reason, a **recommended drill** where relevant (`sparringDrillForText`)
  and CTAs: Review call (→ call detail), View rep (→ Interventions), View
  assignments / Assign sparring (→ Assignments tab).
- **Recommended drill shown** for Call review, Rep risk and Weak skill items.
- **Assign sparring still jumps to the Assignments tab** — no auto-creation, no
  new endpoint. Manager approval gates and Tier 2B behaviour unchanged.
- **Empty state** — "All clear — no urgent coaching actions right now." The
  Day 149 command-centre cards stay as the high-level summary above the queue;
  existing per-section empty-states are preserved (consolidation, not a redesign).

### What remains for Day 151+

- **Day 151** — Wire "Assign sparring" to a real assignment/drill creation flow
  once a safe endpoint is confirmed (today it routes to the Assignments tab); plus
  Whisperer Insights ↔ AI Discovery cross-linking.
- **Day 152** — Fuller Sparring Progress panel (completion rate; link to
  `/reps/[id]/sparring`).
- **Day 153** — Demo polish; consolidate `control-centre` / `recent-calls` stubs.

---

## Day 151 — Assign sparring from the Coaching Queue (shipped)

WEB-only. **No API change, no migration** — the existing manager-gated
`POST /v1/assignments` already accepts `type: "sparring"`, so the CTA now creates
a real assignment instead of only jumping to a tab.

Audit result:
- `POST /v1/assignments` (`requireManager`) — required: `rep_id`, `type` (one of
  `call_review | sparring | custom | drill | replay`), `title` (≥3 chars).
  Optional: `due_at`, `source`, `notes`, `meta`, `target_id`. It derives
  `drill_type` + a uniqueness key from `meta.flag_section` and **dedupes active
  drills** (returns `{ ok: true, skipped: true, reason: "duplicate_active_drill" }`).
  Hierarchy/office/company scoped server-side. No new fields needed.

Implemented:
- `assignSparring()` posts `type: "sparring"`, `source: "manager_dashboard"`,
  `title: "Recommended drill: <drill>"`, `notes: "Reason: <reason>"`,
  `meta.origin_label: "Coaching Queue"`, `meta.flag_section` (via
  `sectionForSkill`), `meta.priority`, `meta.recommended_drill`, plus
  `target_id`/`meta.source_call_id` for call-review items. `due_at` defaults to
  7 days out.
- Wired into the Coaching Queue items (call review, rep risk), the Reps Needing
  Attention card, and the Weakest Skills card.
- Button states: "Assign sparring" → "Assigning…" (disabled while in flight).
- Notices: success "Sparring drill assigned."; duplicate "Not assigned — this rep
  already has an active drill for this skill."; error "Could not assign sparring
  drill."
- **No rep context** (team-wide weak skills): routes to the Assignments tab with
  "Choose a rep to assign this drill." — no rep is guessed.
- Manager click required; no auto-assignment, no bulk assignment. Manager
  approval gates and Tier 2B behaviour unchanged.

### Day 152 recommendation

- Add an explicit rep-picker so team-wide weak-skill drills can be assigned in
  place (instead of routing to the Assignments tab).
- Surface assigned sparring drills in the Sparring Progress snapshot / Assignments
  list with their `origin_label: "Coaching Queue"` so managers can track follow
  through, and add a fuller Sparring Progress panel (completion rate; link to
  `/reps/[id]/sparring`).

---

## Day 152 — Sparring assignment tracking + rep picker (shipped)

WEB-only. **No API change, no migration.** Uses the manager assignments list
(`GET /v1/assignments/manager`, now loaded on mount) which already returns
`type, status, due_at, completed_at, source, meta` — enough to identify and track
queue-assigned sparring.

Data audit:
- `openAssignments` (command-centre) carries `type`, `status`, `source`,
  `originLabel` but **not** `meta`; the manager assignments list carries full
  `meta` + `completed_at`, so the new visibility uses that list.
- Queue-assigned sparring is identified by `type === "sparring"` **and**
  (`source === "manager_dashboard"` **or** `meta.origin_label === "Coaching Queue"`)
  — both written by the Day 151 `assignSparring()`.
- Completion is read directly from the assignment (`status === "completed"` /
  `completed_at`), **not** inferred from sparring sessions — so the link is
  reliable.

Implemented:
- **Inline rep picker** on Weakest Skills items (no rep context): "Choose rep" →
  select → "Assign" / "Cancel", calling the Day 151 `assignSparring()` with the
  chosen rep. Falls back to "Choose a rep from the Assignments tab." when no reps
  are available.
- **Queue-assigned sparring** section: status summary (Open / Completed / Overdue
  sparring drills) + up to 3 recent items (title, rep, status badge, due date,
  recommended drill). Empty state: "No queue-assigned sparring drills yet."
- Manager click required throughout; no auto-assignment; Tier 2B + approval gates
  unchanged.

Known limitation:
- Completion is tracked at the **assignment** level (assignment marked completed),
  not yet linked to an actual completed sparring **session** score. Linking a
  sparring session result back to its originating assignment is a Day 153+ item.

### Day 153 recommendation

- Link completed sparring **sessions** to their originating assignment (so
  "Completed" reflects a real session + score, and the Sparring Progress snapshot
  can show average score per assigned drill).
- Demo polish: consolidate the `control-centre` / `recent-calls` stubs and tidy
  manager empty-states.

---

## Day 153 — Sparring completion follow-through (shipped)

WEB-only. **No API change, no migration.** Uses `GET /v1/manager/sparring-sessions`
(now fetched with `limit=50` for matching) which already returns `assignmentId`,
`repId`, `overall`, `completedAt` and `weakestDimension`.

Data audit:
- Assignments store `rep_id`, `created_at`, `type`, `status`, `completed_at`,
  `meta.flag_section`, `meta.recommended_drill` — enough to anchor a match.
- Sparring sessions carry a **direct `assignment_id`** (API returns it as
  `assignmentId`), plus `overall`, `completedAt`, `weakestDimension`.
- So a **direct** link is possible; where absent, a safe **inferred** match is used.
- No endpoint was needed and no completion mutation was added (display-only).

Implemented:
- `findRelatedSparringSession(assignment, sessions)` →
  `{ confidence: "direct" | "inferred" | "none", sessionId?, overall?, completedAt?, weakest? }`.
  Direct = session `assignmentId` matches; inferred = same rep + completed at/after
  the assignment's `created_at`, preferring a session whose weakest area matches the
  assignment section; otherwise the latest completed session. Never fabricates
  completion — returns `none` when nothing matches.
- Queue-assigned sparring items now show follow-through: "Completed sparring: 82%",
  "Completed on DD/MM/YYYY", a "Match: inferred" badge for inferred matches, a
  "View session" link, or "No completed sparring found yet" when unmatched.
- Status summary adds **"Matched completed sparring"** alongside Open / Completed /
  Overdue sparring drills.

Clarification / limitation:
- Two notions of "completed" now coexist: **assignment-level** completion (the
  assignment row marked completed) and **session-level** follow-through (a real
  sparring session linked to the assignment). The "Matched completed sparring"
  count reflects the latter. Inferred matches are best-effort and shown as such; no
  assignment is auto-completed.

### Day 154 recommendation

- When a sparring session is launched from an assignment, persist its
  `assignment_id` consistently (and consider auto-marking the assignment complete
  on a verified direct match) so follow-through becomes "direct" rather than
  inferred — then surface average score per assigned drill in the Sparring Progress
  snapshot. Separately, demo polish: consolidate the `control-centre` /
  `recent-calls` stubs.

---

## Day 154 — Sparring assignment completion sync (shipped)

WEB-only. **No API change, no migration** — reuses the existing manager-scoped
`PATCH /v1/assignments/manager/:id`.

Endpoint audit:
- `PATCH /v1/assignments/manager/:id` is manager-scoped (verifies
  `assignment.manager_id === x-user-id`; 403/404 otherwise). Accepts `status`; when
  `status === "completed"` it auto-sets `completed_at` and `completed_by:"manager"`.
  The Next proxy injects `x-user-id` server-side, so a proxyFetch PATCH carries the
  manager identity.
- `PATCH /:id/complete` exists but is **rep-only** (assignee), so unsuitable here.
- The manager endpoint does **not** accept `meta`, so proof metadata
  (`matched_sparring_session_id`, `completion_score`) is **not** persisted today.
  "Completed via sparring session" is derived in the UI from the live direct match.

Implemented:
- `markSparringComplete(assignmentId)` → `PATCH /v1/assignments/manager/:id` with
  `{ status: "completed" }`. Manager click only; never auto-completes.
- In Queue-assigned sparring, **"Mark complete"** shows only when the assignment is
  not completed **and** `findRelatedSparringSession` returns
  `confidence === "direct"` with a `completedAt` + `sessionId`. Button → "Marking…"
  while in flight.
- Notices: success "Sparring assignment marked complete."; error "Could not mark
  sparring assignment complete." Refreshes command-centre + assignments after.
- Status display: completed + matched → "Completed via sparring session"; open +
  direct match → "Ready to mark complete"; inferred matches stay display-only
  ("Match: inferred") with no Mark-complete action.

### Day 155 recommendation

- Persist completion proof on the assignment (`meta.completed_via`,
  `meta.matched_sparring_session_id`, `meta.completion_score`) — either by
  extending `PATCH /v1/assignments/manager/:id` to accept a `meta` merge or a small
  dedicated complete-with-proof endpoint — so "Completed via sparring session" is
  backed by stored evidence rather than a live re-match, and surface average score
  per assigned drill in the Sparring Progress snapshot. Separately, demo polish:
  consolidate the `control-centre` / `recent-calls` stubs.

---

## Day 155 — Sparring completion proof metadata (shipped)

Persists proof onto the assignment when a manager marks a queue-assigned sparring
drill complete from a **direct** completed-session match — so completion is
auditable and can later power score trends. **No migration** — the `assignments`
table already has a `meta jsonb` column (`20260526_assignments_add_meta.sql`).

API (`PATCH /v1/assignments/manager/:id`, extended safely):
- Still manager-scoped (verifies `assignment.manager_id === x-user-id`).
- Accepts an optional `completion_proof` object, honoured **only** when
  `status === "completed"`.
- Merges a **whitelisted** proof object into existing `meta` (never replaces it),
  and only when `matched_sparring_session_id` is present:
  - `meta.completed_via = "sparring_session_match"`
  - `meta.matched_sparring_session_id`
  - `meta.completion_score` (numeric only)
  - `meta.completed_session_at`
  - `meta.completed_from_dashboard = true`
- Unknown proof keys are ignored. `completed_at` / `completed_by:"manager"`
  behaviour is unchanged. No auto-completion — still requires the manager click.

WEB:
- `markSparringComplete(assignmentId, match)` sends `completion_proof` only when the
  match is `confidence === "direct"` with a `sessionId` + `completedAt`.
- Queue-assigned sparring shows persisted proof after refresh: **"Proof: sparring
  session match"**, **"Proof score: NN%"**, and a **"Proof stored"** badge. Once
  proof exists, **"Mark complete" is not re-offered**. Open + direct match (no proof
  yet) still shows **"Ready to mark complete"**; the live matched-session display
  (Day 153/154) is preserved.
- Status summary gains a **"Proof stored"** count
  (`meta.completed_via === "sparring_session_match"`).

Manager click required; never auto-completes. Tier 2B + approval gates preserved.
Adds `scripts/validate-manager-dashboard-day-155.sh` + package script.

### Day 156 recommendation

- Surface a per-rep / per-drill **sparring score trend** from the stored proof
  (`meta.completion_score` over time) in the Sparring Progress snapshot, now that
  completion evidence is persisted rather than re-derived. Separately, demo polish:
  consolidate the `control-centre` / `recent-calls` stubs.

---

## Day 156 — Sparring score trend foundation (shipped)

**WEB-only. No new backend, no migration.** Builds an early manager-facing
Sparring Score Trend from the proof metadata persisted in Day 155
(`assignments.meta.completion_score` etc.), which the existing
`GET /v1/assignments/manager` already returns (`SELECT_FIELDS` includes `meta`).

Data audit: assignment meta now carries `completion_score`,
`matched_sparring_session_id`, `completed_session_at` and `completed_via`, so
proof-backed completions are computable from assignments alone — no sparring
sessions fallback and **no new endpoint** required.

Implemented (pure helpers, no charting library):
- `isQueueOriginSparring(a)` / `getProofScore(a)` — queue-origin sparring + valid
  numeric score.
- `getSparringProofRows(assignments, repNameById)` — queue-origin sparring with
  `meta.completed_via === "sparring_session_match"` and a numeric
  `completion_score`; rows carry rep, drill, score, completed date and matched
  session id, newest first.
- `computeSparringTrendSummary(rows)` — `proofCount`, `averageScore`, `bestScore`,
  `latestScore`, `uniqueReps`, `uniqueDrills`.

UI (Overview, under Queue-assigned sparring): **"Sparring score trend"** card —
Proof-backed completions / Average proof score / Best proof score / Latest proof
score, then up to 3 recent proof-backed completions (rep · drill · score ·
completed date · shortened session link). Empty state **"No proof-backed sparring
scores yet."** plus caveat **"Trend data becomes stronger as more assigned drills
are completed."** The Sparring Progress snapshot also gains an **"Avg proof
score"** figure.

Limited until more drills are completed — the foundation grows with proof volume.
Tier 2B + manager approval gates preserved. Adds
`scripts/validate-manager-dashboard-day-156.sh` + package script.

### Day 157 recommendation

- Add a lightweight **per-rep / per-drill breakdown** (group proof rows by rep and
  by drill with each group's average + completion count) and a simple
  improving/declining indicator once a rep has ≥2 proof scores — still WEB-only
  from `meta.completion_score`, no backend. Separately, demo polish: consolidate
  the `control-centre` / `recent-calls` stubs.
