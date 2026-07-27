# Objection → Assignment Flow & Analytics Loop (Day 210)

Status: **Design documentation. Day 254 shipped the first slice** — the
"assign-from-item" path (§3, MVP path 1): an approved Objection Library item
now has an "Assign coaching" manager action that creates a coaching assignment
through the EXISTING engine (`POST /v1/assignments`, type `custom`) via
`assignCoachingFromObjection` in `src/lib/api.ts`. The assignment title +
instructions are prefilled deterministically from the objection's approved
fields (`buildObjectionAssignmentPrefill` in `src/lib/objectionLibraryApi.ts`)
and carry `meta.objection_item_id` for traceability. No scenario engine, no
auto-assignment change, no analytics/trend section yet — those remain the
design below. Validator: `validate-objection-assignment-day-254`. The rest of
this document (call-review moment chip, scenario picker, enriched
auto-assignment, per-item trend/proof) stays design-only.

## 1. The loop (product story)

```
DETECT            REVIEW              TEACH               PRACTISE           PROVE
calls surface  →  manager approves →  approved response → scenario assigned → objection-stage
recurring         objection with      + coaching note     to the reps who     trend + drill
objections        evidence            + sparring scenario lose that moment    completion visible
(moments,         (draft → approved)                                          to the manager
triggers,
suggestions)
```

Every arrow is either existing machinery or a manager action — no step is
automatic content creation, and no step publishes anything a manager
hasn't approved.

## 2. Detect → Review (existing detectors, new destination)

- Sources: objection `CallMoment`s from scoring, Whisperer trigger matches,
  and the blended suggestion mining (field spec §2) — all already produce
  the raw signal today; the library gives it somewhere to go.
- Call review: a moment that matches a library item (via the linked
  trigger) shows a quiet chip — `In library: "It's too expensive"`.
  Managers click through to the item; reps get a read-only guidance card
  (approved response + coaching note). Unmatched recurring patterns
  surface only in the manager's suggestion review — never as rep-facing
  noise.

## 3. Teach → Practise (assignment integration)

### Assignment creation paths (MVP)
1. **From the item** — detail page → Practice section → **Assign drill**:
   pick scenario (active versions only) + reps + optional due date + note.
   Uses the existing assignment machinery; the assignment `meta` carries
   `{ objection_item_id, scenario_id, scenario_version }` (Day 155
   meta precedent — no assignment-schema change in MVP).
2. **From call review** — a manager reviewing a call with a matched, badly
   handled moment gets **Assign practice** on the moment chip, pre-filled
   with that item's default scenario and that rep. One click from evidence
   to drill.
3. **Auto-suggested, never auto-created** — the existing critical-flag
   auto-assignment keeps working as today (it creates generic
   `objection-handling-drill` assignments). When a critical objection flag
   matches a library item with an active scenario, the auto-created
   assignment is **enriched** with the item's coaching note and scenario
   reference — same trigger conditions, better content. It does not create
   new assignment types or fire more often.

### The rep experience
Assignment brief = scenario rep-brief + item coaching note + why-it-matters
paragraph. Completing it = running the sparring scenario; the existing
completion-proof flow (Day 155: proof persisted to `assignments.meta`)
records the session, score, and signals hit/missed.

### Manager proof surface
The `/coaching` command centre's existing assignment/proof widgets gain the
objection dimension: an assignment row can show "Price pushback — tour
close v2 · completed · 71 (signals: 3/4)". No new page — the proof lands
where managers already look.

## 4. Prove (analytics feedback loop)

MVP measures with data that already exists or is created by this design:

| Question | MVP answer (source) |
|---|---|
| How often does this objection come up? | Evidence matches over 30/90 days (trigger matches + attached evidence) — trend arrow on list + sparkline on detail |
| Who struggles with it? | Reps whose matched moments carry low objection-stage scores / failed linked criterion (existing `analysis_json` + review flags) |
| Is handling improving? | Objection-stage score trend (`rep_memory.objection_score` rolling values + `call_scores` history) for linked reps, before/after drill completion dates |
| Are drills being done? | Assignment completion + sparring proof meta (Days 155–158 data) filtered by `objection_item_id` in meta |

Presentation in MVP: **on the item detail page only** (Assignments & trend
section) — a per-item view, honest and small. The cross-library dashboard
("highest-ROI coaching focus", drill completion vs call-score improvement
correlation) is **deliberately phase 2**: correlation claims need months of
usage data, and shipping them early would be exactly the fake-signal
arcade feel the platform just removed. When it comes, it lives in
`/crm/analytics` (the observe surface), not in the library (the teach
surface).

## 5. MVP vs later (loop-level)

**MVP:** moment chip + guidance card on call review · assign-from-item and
assign-from-moment · enriched (not multiplied) auto-assignments · per-item
trend section · proof rows in the existing command-centre widgets.

**Later:** ROI dashboard in analytics · objection-handling league/without
arcade framing · auto-suggested assignment bundles ("3 reps struggling
with pricing this month") · scorecard-criterion failure ↔ item analytics
join (needs the phase-2 `assignment_links` table and relational criteria).

## 6. Integrity rules

1. Trend numbers come from real scored calls and real completed sessions —
   the UI never interpolates or projects.
2. Improvement is shown as "before/after" data points, not causal claims
   ("scores since completing" not "improved because of").
3. Old assignments and sessions keep their scenario version and item
   references forever (immutable versions; archived items readable).
4. Auto-assignment conditions are unchanged by this design — the library
   enriches content, it does not add triggers for creating work.
5. Everything company-scoped; a rep sees only their own guidance and
   assignments; managers see their scope per existing hierarchy filters.
