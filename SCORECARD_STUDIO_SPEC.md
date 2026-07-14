# Scorecard Studio — Module Spec (Day 207)

Status: **Planning only.** Part of the Intelligence Layer
(`INTELLIGENCE_LAYER_BLUEPRINT.md`). Covers Scorecard Studio, the AI
Scorecard Builder, and scoring-runtime integration. Day 209 UX design:
`SCORECARD_STUDIO_UX_BLUEPRINT.md`, `SCORECARD_STUDIO_FIELD_SPEC.md`,
`SCORECARD_STUDIO_ROUTE_PLAN.md`, `AI_SCORECARD_BUILDER_SPEC.md`.

## Purpose

Managers define **what a good call looks like** — per call type — instead of
accepting Gravix's generic rubric. A scorecard is a named, versioned rubric:
weighted sections, concrete criteria, pass/fail checks, and coaching guidance
that flows into assignments.

## Hard constraint (drives the whole MVP shape)

The scoring runtime (`api/src/lib/scoring.ts`) uses a **strict JSON schema
with four fixed stages** (`intro`, `discovery`, `objection`, `close`), and
every WEB consumer (call review, dashboard, rep memory, drill mapping,
review flags) renders exactly those stages.

**MVP scorecards therefore customise *within* the four canonical stages:**
per-stage weights, criteria, pass/fail flags, coaching guidance, and
call-type applicability. Fully custom section structures are phase 2 and
require a generalised `analysis_json` renderer first. This is a deliberate
scope decision, not a limitation to engineer around quietly.

## Concepts

```
Scorecard            "Discovery Call — UFC"  (name, call types, status)
 └─ Version 1        immutable once activated
 └─ Version 2 (active)
     └─ Sections     intro (10%) · discovery (35%) · objection (30%) · close (25%)
         └─ Criteria "Asked about training goals before pitching"
                      { description, coaching_guidance,
                        pass_fail: true, critical: false }
```

- **Weights** are integers summing to 100; overall = weighted mean of stage
  scores (replaces the model's own overall when a custom scorecard applies).
- **Criteria** are evaluated by the LLM per stage (met / not met / unclear
  for pass/fail ones) and inform the stage score + notes.
- **Critical criteria**: failing one caps the stage score (e.g. at 40) and
  emits a review flag carrying the `criterion_id` — feeding the existing
  flag → assignment machinery.
- **Coaching guidance** per criterion is what the rep sees when they fail
  it, and what auto-created assignments quote. Managers write (or approve)
  the coaching language, not just the scoring language.

## Call types

Fixed enum in MVP: `inbound · outbound · demo · discovery · renewal ·
objection`. Set on the call at `/upload` (the "call context" step already
exists there; today the field is UI-only — the runtime day makes it persist).
A scorecard declares which call types it applies to; empty = company default
for all types.

## Versioning and approval (manager changes never rewrite history)

- Every edit happens on a **draft version**. Activation is an explicit
  manager action: draft → `active`, previous active → `superseded`.
- Activated versions are immutable rows; there is no in-place edit path.
- Calls stamp `scorecard_id` + `scorecard_version` in `rubric._meta` (and in
  the `call_scores` history row). Reports and the call review page always
  show the version that produced the score.
- Activating a new version affects **new calls only**. Re-scoring an old
  call is a separate, explicit action (existing `call_scores` history
  supports it) — never automatic.
- The **Gravix default rubric** appears in the Studio as a read-only card
  ("Gravix Default v1 — active fallback") so managers see the whole picture,
  but it is code, not a database row.

## Scoring runtime integration

```
resolveScorecard(companyId, callType):
  active version for (company, callType)
    → else company scorecard with call_types = []   (company default)
    → else Gravix default rubric v1                 (today's exact path)
```

- Prompt: stage criteria + weights are rendered into the scoring prompt;
  the strict response schema keeps the same shape (stages, notes) with
  criteria verdicts added inside stage notes/structured extras — schema
  changes stay additive.
- **Cache**: `score_cache` key gains `scorecard_version_id` +
  `context_version`. Old cache entries remain valid for old versions;
  activation naturally misses the cache.
- **Fallback safety**: any resolution/parse failure on the custom path falls
  back to the default rubric and logs a warning — a broken scorecard must
  never fail a scoring job.
- Flags carry `criterion_id`; assignment auto-creation keeps its
  section→drill mapping, enriched with the failed criterion's coaching
  guidance in the notes.

## UX flows

### Studio list (`/intelligence?tab=scorecards`)
- Cards: name, call types, status chip (Active vN / Draft / Archived),
  "last scored X calls" later. Gravix Default shown read-only.
- CTAs: **New scorecard** (blank or duplicate) · **Draft with AI**.

### Editor (`/intelligence/scorecards/[id]`)
1. Header: name, call types (multi-select), status, version.
2. Four stage sections (fixed order), each with: weight input (live "sums to
   100" validation), criteria list (add/edit/remove/reorder), per-criterion
   pass/fail + critical toggles and coaching guidance.
3. Sticky footer: "Draft vN — not scoring live calls" → **Activate** →
   confirmation spells out consequences ("New {call types} calls will be
   scored with this version. Existing scores keep their original scorecard.").
4. Version history list (read-only) below the editor.

### AI Scorecard Builder (a flow inside the Studio, not a separate surface)
1. Manager clicks **Draft with AI** → single prompt box ("Describe the call
   type and what a great one looks like") + call-type select. Published
   company context is included automatically and said so on screen.
2. AI returns a full draft version: weights + criteria + coaching guidance.
3. Draft opens **in the normal editor** — same review/edit affordances, no
   special AI mode. A banner marks origin: "AI draft — review before
   activating."
4. Activation is the same manual, manager-gated action. **No auto-publish,
   no path where an AI draft scores a live call unreviewed.**
5. `origin='ai_draft'` + `source_prompt` stored on the version for audit.

## Data model (see blueprint §6)

MVP stores sections/criteria as an immutable jsonb snapshot on
`scorecard_versions` (immutability makes a snapshot the natural shape);
relational `scorecard_sections`/`scorecard_criteria` tables come with
per-criterion analytics in phase 2.

## Deferred (explicitly not MVP)

- Custom section structures (see hard constraint above).
- Per-criterion analytics dashboards; scorecard performance comparison.
- Per-office scorecards, A/B rubric testing, import/export.
- Bulk re-scoring of historical calls against a new version.
- Auto-suggested criteria mined from Whisperer moments (natural phase 2 —
  the discovery pipeline from Days 144–147 already surfaces candidates).

## Safety rules

- Activation requires manager+ role and writes an audit activity.
- Weights validated server-side (sum 100, all stages present).
- Company-scoped resolution only; a scorecard can never apply cross-org.
- Default fallback guarantees the MVP is deletable without breaking scoring.

## Day 216 note — call review render surface is ready

`/calls/[id]` (Days 215–216) now renders the review as stage audit blocks
(verdict chip, score bar, labelled Evidence block, Coaching implication),
a "Where this call lost points" priority list mapped to next actions, and
a Scoring transparency panel that names the active rubric ("Gravix
default rubric", model when present) with the neutral line "Custom
scorecards will appear here once activated."

Integration points once the runtime emits criteria-level results:

- the transparency panel swaps the default-rubric copy for the active
  scorecard's name/version — this is the activation surface;
- each stage audit block renders its criteria as rows (score/pass-miss +
  evidence) beneath the existing stage header;
- the "Signal observed" chip pattern generalises to per-criterion
  signals (weak_close is the only real stage-mapped tag today);
- the lost-points list can rank by criterion instead of stage.

No WEB work is blocked on design: the page needs only the new fields on
the existing call payload.
