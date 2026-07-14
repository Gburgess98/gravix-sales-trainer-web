# Context Engine — Module Spec (Day 207)

Status: **Data layer implemented (Day 218, API repo).** Part of the
Intelligence Layer (`INTELLIGENCE_LAYER_BLUEPRINT.md`). Day 208 UX design:
`CONTEXT_ENGINE_UX_BLUEPRINT.md`, `CONTEXT_ENGINE_FIELD_SPEC.md`,
`CONTEXT_ENGINE_ROUTE_PLAN.md`.

## Implementation status (Day 218)

API repo, `feat: add context engine data layer`:

- Migration `sql/20260714_company_context.sql` — **row-per-lifecycle-state**
  refinement of the single-row sketch below: at most one `draft` row (working
  copy) and one `published` row per company (partial unique indexes), with
  `archived` history rows. This is what keeps the published snapshot stable
  while the draft is edited — the guarantee the single-row shape could not
  give. Section keys live in one `context` jsonb column
  (profile/offering/objections/competitors/compliance/tone per the field
  spec). Applied via the Supabase SQL editor (standard workflow).
- Endpoints (all manager-gated via `requireManager`; company resolved from
  the requester's identity, never from the request):
  `GET /v1/intelligence/context` → `{ draft, published }` ·
  `PUT /v1/intelligence/context` → draft save only ·
  `POST /v1/intelligence/context/publish` → archive previous, insert
  version n+1 with a compiled snapshot, audit event ·
  `GET /v1/intelligence/context/compiled?state=draft|published` → preview.
- `compileContextBlock` (`src/lib/contextEngine.ts`) is pure/deterministic
  per §"Runtime compilation" and the field-spec §4 caps; the published row
  stores its compiled block at publish time so the snapshot never shifts.
- Validator: `npm run validate:intelligence-context` (lifecycle, rep 403s,
  cross-company isolation, snapshot stability, audit row; self-cleaning).
- **Not yet built:** scoring-prompt integration, `knowledge_embeddings`
  sync, `rubric._meta.context_version` stamping, the WEB `/intelligence`
  workspace, and the rep read-only summary endpoint (ships with the WEB
  build). Nothing in the scoring runtime reads `company_context` yet.

## Purpose

A single, org-scoped, manager-editable company profile that Gravix compiles
into every AI operation: call scoring, coaching suggestions, AI scorecard
drafting, and (later) sparring persona grounding. It answers: *what does this
company sell, to whom, how, and what does good sound like here?*

Product principle: the manager can always **see exactly what Gravix has been
taught**. No hidden context, no inferred profile the manager can't inspect.

## What already exists (build on, don't duplicate)

- `knowledge_embeddings` (`source_type='company_playbook'`) is already
  retrieved into the scoring prompt via `getScoringKnowledgeContext`. The
  Context Engine becomes the *managed source* whose published sections are
  synced into that store — retrieval plumbing unchanged.
- `contextBuilder.ts` derives rep/company weaknesses from review flags —
  behavioural context, complements (does not replace) declared context.

## Sections (MVP form structure)

| Section | Fields (all optional, free text unless noted) | Used by |
|---|---|---|
| Company profile | about, sales_motion (select + notes), ICP | scoring tone, AI builder |
| Products & services | offerings list, pricing/positioning notes | scoring accuracy, objection realism |
| Objections | list: objection / approved response / weak response / notes | scoring, drills, (later) objection library |
| Competitors | list: name / notes / how we position against | scoring, sparring realism |
| Compliance & no-go | no-go phrases list, required disclosures | scoring criteria, (later) auto-flagging |
| Tone & playbook | playbook guidance, tone notes | scoring notes style, coaching guidance |

Every list section starts empty with one worked placeholder example. Nothing
is mandatory: partial context is still useful context.

## Lifecycle

```
draft ──(manager edits, autosave)──▶ draft ──(Publish)──▶ active vN
                                                 │
                              scoring uses active vN; edits reopen a draft
```

- One record per company (`company_context`, unique on `company_id`).
- **Publish** bumps `version`, stamps `published_at`/`updated_by`, writes an
  audit activity, and re-syncs the playbook-relevant sections into
  `knowledge_embeddings`.
- Scoring only ever reads the last **published** version; a half-finished
  draft never leaks into live scoring.
- Calls stamp `context_version` in `rubric._meta` so history shows which
  context produced a score. Publishing never rescores old calls.

## Runtime compilation

`compileContextBlock(companyId)` produces a **bounded** plain-text block
(target ≤ ~1,500 tokens):

1. Fixed section order (profile → offering → objections → compliance → tone).
2. Empty sections omitted entirely.
3. Long lists truncated deterministically (first N, no sampling — keeps the
   score cache meaningful).
4. Injected into the scoring prompt alongside the existing playbook/rep
   -memory retrieval; existing behaviour when context is empty is byte-for-
   byte today's prompt (zero regression path).

## UX flow (`/intelligence?tab=context`)

1. **Empty state** — "Teach Gravix how {Company} sells." Three-step framing
   (Teach → Score → Coach), single CTA: Start with company profile.
2. **Guided form** — one page, six collapsible SectionCards (existing shell
   components), autosave-as-draft, per-section completeness ticks.
3. **Review & publish** — sticky footer: "Draft — not yet used for scoring"
   → Publish button (manager-gated) → confirmation states what changes
   ("New calls will be scored with this context. Existing scores are
   unchanged.").
4. **Read view for reps** — summary card only (profile + tone), no edit.

Design notes: dark Command Centre shell, PageHeader + SectionCard + Button
primitives, no wizard-with-steps overkill — it is one form with sections.

## Deferred (explicitly not MVP)

- **AI autofill from website** — phase 2: manager enters a URL, AI drafts
  sections, everything lands in the *draft* state for review (same approval
  gate as the Scorecard Builder). Needs fetch/enrichment infra.
- Context version history browser / diffs (versions are stored; UI later).
- Per-office context overrides.
- Automated compliance flagging from the no-go list.

## API sketch

```
GET  /v1/intelligence/context           → { draft, activeVersion }
PUT  /v1/intelligence/context           → save draft (manager+)
POST /v1/intelligence/context/publish   → bump version, sync embeddings
```
Org-scoped via existing middleware; proxied via `/api/proxy` as always.

## Safety rules

- Company-scoped reads/writes only; no global or cross-org context.
- Publish is manager+ and audited.
- Compiled block is size-capped; a pathological context cannot blow up the
  scoring prompt.
- Empty context = today's exact scoring behaviour.
