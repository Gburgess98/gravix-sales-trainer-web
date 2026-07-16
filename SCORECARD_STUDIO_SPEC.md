# Scorecard Studio — Module Spec (Day 207)

Status: **Data layer implemented (Day 219B) · lifecycle completed (Day 220)
· scoring-runtime integration implemented (Day 221), API repo.** Part of the
Intelligence Layer (`INTELLIGENCE_LAYER_BLUEPRINT.md`). Covers Scorecard
Studio, the AI Scorecard Builder, and scoring-runtime integration. Day 209
UX design: `SCORECARD_STUDIO_UX_BLUEPRINT.md`, `SCORECARD_STUDIO_FIELD_SPEC.md`,
`SCORECARD_STUDIO_ROUTE_PLAN.md`, `AI_SCORECARD_BUILDER_SPEC.md`.

## Implementation status (Day 219B)

API repo, `feat: add scorecard studio data layer`:

- Migration `sql/20260714b_scorecard_studio.sql` — four tables:
  `scorecards` (draft/active/archived, case-insensitive unique name and one
  active company default per company) · `scorecard_versions` (unique version
  number, one draft + one active per scorecard, origin enum,
  draft/active/superseded) · `scorecard_stage_weights` /
  `scorecard_criteria` (fixed-stage checks, weight 0–100, emphasis enum,
  critical-requires-pass-fail in SQL). The "snapshot vs relational" choice
  in §Data model resolved as **both**: relational rows are the editable
  draft working copy; activation stamps the deterministic immutable jsonb
  `snapshot` the runtime will read. Applied via the Supabase SQL editor.
- Endpoints under `/v1/intelligence/scorecards` (all `requireManager`;
  company from the requester identity, never the request; cross-company ids
  404 with no existence leak): `GET /` list + read-only Gravix Default card
  (code, not a row) · `POST /` create draft (v1 draft, 25/25/25/25) ·
  `GET /:id` detail with versions/weights/criteria · `PUT /:id` metadata ·
  `PUT /:id/versions/:versionId` save draft version (structural validation
  only — weights-total-100 never blocks saving) · `POST /:id/activate`
  (weights total 100, ≥1 criterion, call type or company default; previous
  active → superseded; snapshot stamped; audit event; cross-scorecard
  call-type overlap → 409 `call_type_conflict`).
- Helpers `src/lib/scorecardStudio.ts`: fixed stage/call-type/emphasis
  enums, default weights, payload normalisation, activation rules,
  deterministic snapshot builder. Pure — no AI, no network.
- Validator: `npm run validate:intelligence-scorecards` (lifecycle,
  immutability, conflict, isolation, audit; self-cleaning fixtures;
  MIGRATION PENDING mode until the SQL is applied).
- **Not yet built** (deliberately): AI Scorecard Builder, call-type
  persistence at `/upload`, and all WEB UI. Scoring-runtime integration
  landed Day 221 (see below).

## Lifecycle completion (Day 220)

API repo, `feat: complete scorecard studio lifecycle` — the deferred
lifecycle operations, making scorecards safe to manage before the runtime
ever reads them:

- **Fork** `POST /:id/versions/:versionId/fork` — "editing" an immutable
  active/superseded version creates draft version n+1 copying weights,
  criteria, call types and origin (provenance survives forks: an
  `ai_draft` stays `ai_draft` in history). Forking a draft → 400; if a
  draft already exists → 409 `draft_already_exists` with its id — never
  silently reused, the existing draft may hold unrelated edits.
- **Replacement activation** — `POST /:id/activate` with
  `{ replace_conflicts: true }`. Without the flag, cross-scorecard
  call-type (and company-default) conflicts still answer 409 with the
  full conflict list; with it, each conflicting active version is
  superseded **whole** (narrowing an immutable version's call types would
  mutate it), the replaced scorecard drops to status `draft` with all
  history intact, and the response's `replaced` array names every
  superseded scorecard/version — the §UX dialog reads this.
- **Archive** `POST /:id/archive` — marks, never deletes: active version
  → superseded, scorecard → `archived` + `archived_at`; every version,
  snapshot and criteria row survives. Archived scorecards reject
  edit/save/fork/activate with 409. Archiving the company default is
  allowed — the Gravix Default rubric is the guaranteed fallback (§Safety
  rules). No restore endpoint yet (explicit later lane).
- **Audit** — full lifecycle now writes `audit_events`:
  `create_scorecard`, `save_scorecard_draft`, `fork_scorecard_version`,
  `activate_scorecard_version`, `replace_scorecard_conflicts`,
  `archive_scorecard`.
- Validator extended (`npm run validate:intelligence-scorecards`): fork
  lifecycle, snapshot stability after forked-draft edits, replace flow,
  archive read-only behaviour, cross-company 404s on all new endpoints,
  audit rows for every lifecycle event.

## Runtime integration (Day 221)

API repo, `feat: wire context and scorecards into scoring runtime`:

- `resolveActiveScorecard` (`src/lib/intelligenceRuntime.ts`) implements the
  §Scoring runtime integration chain: active version matching the call's
  type → active company-default scorecard → Gravix Default v1. Only
  `status='active'` versions on `status='active'` scorecards are candidates
  — archived scorecards and superseded/draft versions are never selected.
  Fail-soft: any lookup error resolves to the Gravix Default.
- **Call type**: `calls` carries no call_type/type/direction column today
  (live schema checked Day 221), and the runtime does not invent
  classification — resolution passes `null` and starts at the company
  default. When `/upload` persists a call type (future lane), the chain's
  first step activates with no further runtime change.
- Prompt: the activation `snapshot` renders as a bounded (≤6,000 chars)
  criteria block appended to the scorer's user message **only for custom
  scorecards** — it carries stage weights, guidance and per-criterion
  emphasis/pass-fail/critical flags, and instructs the model to apply them
  *within* the fixed four stages and return exactly the existing JSON
  schema. Stage weights are scoring guidance to the model in MVP; the
  runtime does not deterministically recompute `overall` from weights.
  With no custom scorecard the prompt is byte-identical to today.
- `score_cache` key gains a `scorecard=<version_id>` segment **only for
  custom scorecards** (default keys unchanged → no cache orphaning);
  activation naturally misses the old version's entries.
- `rubric._meta` now always stamps `scoring_model_version`,
  `scorecard_source` (`custom`/`company_default`/`gravix_default`) and
  `scorecard_name` ("Gravix default rubric" on the default path), plus
  `scorecard_id`/`scorecard_version_id`/`scorecard_version` when a custom
  scorecard scored the call — the "scored with" surface reads these. All
  keys additive; old calls never rewritten; re-scoring stays explicit.
- Deferred from §Downstream consumers: per-criterion review flags
  (`criterion_id`) and criterion-enriched assignment notes — the existing
  threshold/flag machinery is untouched in Day 221.
- Validator: `npm run validate:intelligence-runtime` (53 checks; resolution
  chain, precedence, archived/superseded exclusion, cross-company
  isolation, cache keying, meta stamping, fixed four-stage shape).

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

---

## Implementation status — Day 227

The editor MVP is live in `/intelligence?tab=scorecards`
(`src/app/intelligence/ScorecardStudioEditor.tsx` +
`src/lib/scorecardStudioApi.ts`): create scorecard, draft metadata + version
editing (weights, guidance, full-detail criteria with reordering), fork of
locked versions, confirmed activation with the 409 conflict → second-confirm
replace flow, and archive for never-active scorecards only. Fixed four-stage
frame throughout — no custom stages, no AI Builder, no Autofill (per this
spec's MVP scope). Validated by `scripts/validate-premium-ux-day-227.sh`.
