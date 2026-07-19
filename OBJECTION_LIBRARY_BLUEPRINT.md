# Objection Library — Blueprint (Day 210)

Status: **Data layer implemented (Day 236 — see §10).** UX sections remain
design documentation; no WEB UI, suggestion mining, or runtime consumption
is built yet. Third Intelligence Layer module
(`INTELLIGENCE_LAYER_BLUEPRINT.md`), following the Context Engine (Day 208)
and Scorecard Studio (Day 209) UX blueprints. Companions:
`OBJECTION_LIBRARY_FIELD_SPEC.md` (fields + entities),
`SPARRING_SCENARIO_ENGINE_SPEC.md` (scenario builder + runtime),
`OBJECTION_TO_ASSIGNMENT_FLOW.md` (end-to-end coaching loop + analytics).

---

## 1. Product intent

Reps hear the same objections every week — *too expensive, need to think
about it, send me some info, already with a competitor, no budget, not the
decision-maker*. Today Gravix can detect them (moments, triggers, discovery
candidates) but the knowledge of **how to answer them well lives in the
manager's head**.

The Objection Library turns each recurring objection into a managed
coaching asset: the buyer's language, the approved response, the weak
patterns to coach away, and the sparring drill that practises it — all
manager-approved, all connected to real calls.

**Positioning within the Intelligence Layer:** Context teaches Gravix the
business; Scorecards teach it what good looks like; the Objection Library
teaches it **how to win the hard moments** — and is the only module that
closes the loop into practice (sparring) and proof (assignments,
analytics).

**Principle (from competitor research, principle only — no layout, wording
or visuals copied):** manager-controlled company knowledge should directly
improve scoring, coaching and practice — one asset, three consumers.

**Desired feel:** premium coaching playbook · manager-controlled · clean
and serious · evidence-based · connected to real calls · dark Command
Centre native · no arcade · no fake AI magic.

---

## 2. Current-state audit (what this module reuses)

Audited 11 July, WEB `4539868`, API `3add39b`.

- **AI Discovery pattern (proven, Days 122–147):**
  `GET /v1/manager/whisperer-trigger-candidates` mines candidates live —
  no DB rows until a manager acts — blending raw-segment and
  triggered-moment sources ("mixed"), suppressing already-actioned ones
  via `whisperer_trigger_candidate_decisions` (approve / dismiss /
  restore, with history). **The objection suggestion flow copies this
  pattern wholesale** rather than inventing a second approval machine.
- **Triggers:** `whisperer_triggers` (custom) + `whisperer_trigger_library`
  (built-in), merged at detection; approved candidates already link back to
  their source (Day 139–140). A library item can reference the trigger that
  detects it.
- **Detection on calls:** scoring emits `CallMoment` type `objection`;
  Whisperer sessions emit triggered moments. Both are evidence sources.
- **Sparring:** `sparring_sessions` + `sparring_turns`; five personas
  hard-coded in `api/src/personas.ts` (price_sensitive, angry, silent,
  cfo, procurement) with emotional-state/mutation engines and difficulty
  levels; completion proof persists to `assignments.meta` (Day 155), score
  trend + per-rep/drill breakdown exist (Days 156–158).
- **Assignments:** `assignments` (typed, rep/manager, target) +
  `coach_assignments` (drill ids incl. `objection-handling-drill`),
  auto-created from critical review flags.
- **Analytics surfaces:** `rep_memory.objection_score` (rolling),
  `contextBuilder` company weakness from review-flag sections,
  `/crm/overview` and `/coaching` manager surfaces.
- **Intelligence Layer so far:** Day 207–208 placed objections *inside*
  `company_context.objections` for the Context Engine MVP. §8 below
  defines the supersession when this library ships.

---

## 3. Objection Library UX

Home: **third tab of the Intelligence workspace** —
`/intelligence?tab=objections`. Same shell grammar as Days 208–209
(WorkspaceTabs, SectionCards, rail/editor/guidance where applicable);
route details in §7.

### 3.1 List page

```
┌──────────────────────────────────────────────────────────────────────────┐
│ WorkspaceTabs   Context    Scorecards    Objections ●                    │
├──────────────────────────────────────────────────────────────────────────┤
│  Objection Library                              [New objection]          │
│  Approved answers to the pushback your reps actually hear.               │
│                                                                          │
│  ▸ Suggested by Gravix (3)                              [Review]         │
│                                                                          │
│  APPROVED (5)                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ "It's too expensive"        Pricing · ▲ rising · 14 calls (30d)  │    │
│  │ Approved · 2 scenarios · linked criterion: price objection reframe│   │
│  └──────────────────────────────────────────────────────────────────┘    │
│  │ "Send me some info"         Stall · ▬ steady · 6 calls (30d)     │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  DRAFTS (2)    ·    ARCHIVED (1, collapsed)                              │
└──────────────────────────────────────────────────────────────────────────┘
```

- Row contents: objection label (buyer's words, quoted) · category chip ·
  frequency + 30-day trend (▲▼▬, from evidence matches) · status ·
  linked-asset counts (scenarios, criterion). Click → detail.
- **Suggested by Gravix** strip at the top when unreviewed suggestions
  exist (count + Review). Collapsed, never nagging; absent when empty.
- Empty state: "No objections in your library yet. Add the pushback your
  reps hear most, or review what Gravix has noticed on recent calls." CTAs:
  **New objection** · **Review suggestions** (only when suggestions exist).

### 3.2 Detail page (`&objection=<id>`)

Single-column stack of SectionCards (this is a reading-and-editing page,
not a rail workspace):

1. **Header** — quoted label, category, status chip, frequency/trend,
   source badge (`manual · suggested · call review`).
2. **Buyer language** — the phrase variants reps actually hear (list).
3. **Why it matters** — manager's one-paragraph framing.
4. **Approved response** — the benchmark answer, written as spoken.
5. **Weak responses** — named anti-patterns to coach away.
6. **Coaching note** — manager voice, quoted into assignments.
7. **Compliance** — no-go language for this objection (advisory, same
   honesty rule as the Context Engine compliance module).
8. **Evidence** — linked calls (moment excerpt, rep, date, link to
   `/calls/[id]` at the timestamp). This is what makes the library
   evidence-based rather than academic.
9. **Practice** — linked sparring scenarios (name, persona, difficulty,
   version, sessions run) + **Create scenario** (pre-filled from this
   item; `SPARRING_SCENARIO_ENGINE_SPEC.md`).
10. **Assignments & trend** — open/completed drill assignments for this
    objection and the objection-stage trend for linked reps
    (`OBJECTION_TO_ASSIGNMENT_FLOW.md`).

Draft items show the Day 208-style strip: `● Draft — not used for coaching
or scoring` → **Approve** (manager gate). Approved items autosave edits
directly (no re-approval per edit in MVP — the item-level gate is
approve-once; responses are coaching copy, not scoring structure).

### 3.3 Lifecycle

```
draft ──(Approve — manager)──▶ approved ──(Archive)──▶ archived
  ▲                                                        │
  └───────────────(Restore, as draft)──────────────────────┘
```

- **Draft** — visible to managers only; not fed to scoring context, not
  available for scenario assignment.
- **Approved** — live: feeds the compiled context block (§8), matched on
  call review, available for scenarios and assignments.
- **Archived** — read-only; historical references (evidence, scenario
  versions, assignment records, call links) remain intact and resolvable.
  Archiving never deletes anything.

### 3.4 AI suggestion review (`&mode=review`)

Reuses the candidate-review pattern (Days 130–137) with objection framing:

```
Suggested objections                                    3 to review
┌──────────────────────────────────────────────────────────────────────┐
│ "We're already with PureGym"                    Confidence: High     │
│ Source: call review moments (blended)  ·  9 calls, 4 reps, 30 days   │
│ Evidence: ▸ "…we're okay, we already use PureGym…" — Call, 2 Jul     │
│           ▸ "…already got a membership elsewhere…" — Call, 27 Jun    │
│ [Add to library]   [Merge into existing…]   [Dismiss]                │
└──────────────────────────────────────────────────────────────────────┘
```

- **Sources shown honestly**: which detector produced it (objection
  moments, Whisperer triggers, raw segments — "blended" when mixed),
  with evidence excerpts linking to the real calls. Confidence label
  (`High · Medium`) derived from frequency × spread (deterministic rule in
  the field spec — not a black-box score).
- **Add to library** → opens a pre-filled **draft** item (label, buyer
  phrases from evidence, evidence links attached). The manager writes the
  approved response and approves — **the suggestion itself is never
  published**; only the manager-completed item is.
- **Merge into existing…** → picker of approved/draft items; adds the
  suggested phrasing as a buyer-language variant and attaches the
  evidence. No duplicate items.
- **Dismiss** → persisted decision (same restore-with-history behaviour as
  trigger candidates); the suggestion stops appearing but can be restored
  from a "Previously dismissed" disclosure.
- **No auto-publish, no auto-created active items, ever.**

---

## 4. Permission model

| Capability | Rep | Manager+ |
|---|---|---|
| See guidance on an assigned drill / sparring session | ✅ (that item's response + coaching note only) | ✅ |
| See library chip on own call review moments | ✅ (read-only guidance card) | ✅ |
| Browse full library, edit, approve, archive | ❌ | ✅ |
| Review AI suggestions | ❌ | ✅ |
| Create/version scenarios, assign drills | ❌ | ✅ |

- Everything `company_id`-scoped via existing org-scope middleware; no
  cross-org visibility of items, evidence, scenarios, or suggestions.
- Reps see guidance **in context** (assignment, sparring brief, call
  moment), never the management surface — the library is the manager's
  playbook; the rep experiences its output.

---

## 5. MVP vs later

### MVP
1. Library list + detail with the full field spec; manual creation;
   draft → approve → archive lifecycle.
2. Suggestion review (approve-as-draft / merge / dismiss with persisted
   decisions), mining the **existing** detectors — objection moments +
   trigger matches. No new NLP.
3. Evidence links (call + timestamp) captured at suggestion time and
   manually attachable on the detail page.
4. Scenario Builder v1 + versioning (companion spec) and assignment via
   the existing assignment machinery with scenario references.
5. Detail-page trend: objection-stage score trend for linked reps +
   drill completion (existing `rep_memory` + Day 155 proof data).
6. Approved items feed the compiled context block (§8).

### Deliberately later
- Semantic/NLP matching of moments to items (MVP matches via the linked
  trigger's phrases + suggestion-time links).
- Multiple response guides per objection (segments/personas); MVP is one
  approved response + weak patterns per item.
- AI-drafted approved responses (would follow the draft-only Builder
  pattern; not in v1 at all).
- ROI analytics dashboard ("highest-ROI coaching focus") — MVP shows
  per-item trend only; the cross-library dashboard needs real usage data
  first (`OBJECTION_TO_ASSIGNMENT_FLOW.md` §5).
- Cross-linking criteria → scorecard editor deep integration (MVP: a
  reference field on the item, shown on both sides as a chip).
- Bulk import, industry template packs.

### Scope-creep guardrails
- No new detection tech in MVP — the library consumes existing detectors.
- One approved response per item; one review surface; one workspace tab.
- Any feature needing new scoring-schema fields is automatically phase 2.

---

## 6. Safety and product rules

1. **Manager approval before anything is live** — suggestions become
   drafts; drafts become approved only by a manager; scenarios activate
   only on manager action (companion spec).
2. **No auto-published AI content** — AI proposes objections (with
   evidence); managers write or approve every response word.
3. **Source transparency** — every item shows its origin; every
   suggestion shows its detector and evidence calls.
4. **Org scoping** — company-scoped end to end; suggestions mined only
   from the company's own calls.
5. **Archive preserves history** — archived items stay resolvable from
   old assignments, sessions, and call links.
6. **Compliance stays advisory** — same rule and caption as the Context
   Engine compliance module.

---

## 7. Route plan (nothing wired today)

```
/intelligence?tab=objections                       library list
/intelligence?tab=objections&mode=review           suggestion review
/intelligence?tab=objections&objection=<id>        item detail
/intelligence?tab=objections&objection=<id>&scenario=<sid>   scenario editor
                                                   (takeover, companion spec)
```

- Follows the Day 209 decision: query-param deep links on the single
  Intelligence workspace page; no subroutes; the Objections tab starts
  rendering only when the module ships (no placeholder tab).
- Consumers deep-linking in: call-review moment chip → item detail (reps
  get the read-only guidance card instead); assignment detail → item
  detail; sparring brief → scenario view.
- API sketch (extends blueprint §7):
  `GET/POST /v1/intelligence/objections`, `GET/PATCH …/:id`,
  `POST …/:id/approve|archive|restore`,
  `GET /v1/intelligence/objections/suggestions`,
  `POST …/suggestions/decision` (approve-as-draft / merge / dismiss —
  mirrors the trigger-candidate decision endpoints),
  scenario endpoints in the companion spec.
- Prototype policy unchanged: `/dev/objection-library-preview` only, never
  linked, deleted when real; none built today.

---

## 8. Relationship to the Context Engine (supersession, stated once)

Day 207–208 MVP stores objections in `company_context.objections`. When
the Objection Library ships:

1. Existing context objections are migrated into the library as
   **approved** items (`source='manual'` — they were manager-written).
2. The Context Engine's *Objections & responses* module becomes a
   read-only summary pointing into the library tab ("Objections now live
   in your Objection Library"), then is removed from the editor rail in a
   later pass. **One source of truth; no dual editing.**
3. The compiled context block's objections section (Day 208 field spec §4)
   draws from **approved library items** (same caps, same deterministic
   order) — scoring quality is preserved through the migration because the
   content shape is identical.

---

## 9. Implementation sequence (future days, after the Context/Scorecard
data + runtime lanes in the Day 207 sequence)

| Lane day | Scope |
|---|---|
| OL-1 | Data layer: `objection_library_items` + evidence, org-scoped CRUD + approve/archive endpoints |
| OL-2 | Library UI: list + detail + lifecycle (no suggestions yet) |
| OL-3 | Suggestion mining endpoint (reuse candidate blend + decisions pattern) + review UI |
| OL-4 | Scenario data + builder UI + versioning (companion spec) |
| OL-5 | Sparring runtime consumption + assignment references + proof surface |
| OL-6 | Context-block supersession migration + call-review moment chips + detail trend; seed + QA |

Each day independently shippable; runtime-touching days (OL-5, OL-6) need
live proofs before merging, per house rules.

---

## 10. Implementation status (Day 236 — OL-1 shipped)

API repo, `sql/20260719_objection_library.sql` +
`src/routes/intelligenceObjections.ts`, validated by
`npm run validate:intelligence-objections`.

**Built:**
- Tables: `objection_library_items`, `objection_evidence`,
  `objection_suggestion_decisions` (decision table ships now so the model
  is fixed early; the mining endpoint that writes to it is OL-3).
- Endpoints under `/v1/intelligence/objections`: list (status/category
  filters), create draft, detail + evidence, draft update, approve,
  archive, manual evidence attach. All requireManager-gated, company
  resolved from the requester (cross-company ids → 404), no hard-delete
  path anywhere. Fail-soft 503 `objection_library_not_migrated` until the
  SQL is applied.
- Lifecycle: draft → approved → archived. Approval gate: label, category,
  ≥1 buyer phrase, approved response, and a coaching note or
  why-it-matters. Archive marks, never deletes; archiving frees the label
  (live-label uniqueness is a partial index excluding archived rows).
- Audit events: `create_objection`, `update_objection_draft`,
  `approve_objection`, `archive_objection`, `add_objection_evidence`.

**Deviations from this blueprint (deliberate, Day 236 scope):**
- §3.2 said approved items autosave edits; Day 236 makes approved items
  **immutable** (409 `immutable_approved`) until a fork/revision model
  ships — safer default, mirrors Scorecard Studio.
- §3.3 restore (archived → draft) is not built yet; archived items are
  read-only history.
- Field-spec naming drift is recorded in
  `OBJECTION_LIBRARY_FIELD_SPEC.md` §7.

**Not built (later lanes):** WEB tab (OL-2), suggestion mining + review
(OL-3), scenarios (OL-4), runtime/sparring consumption (OL-5), context
supersession + seed (OL-6).
