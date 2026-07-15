# Gravix Intelligence Layer — Product Blueprint (Day 207)

Status: **Planning document; build under way in the API repo.** Implemented
so far: Context Engine data layer (Day 218), Scorecard Studio data layer +
lifecycle (Days 219B/220), and §9 scoring-runtime integration (Day 221 —
published-context + active-scorecard resolution, bounded prompt blocks,
versioned `score_cache` keys, `rubric._meta` provenance; default path proven
byte-identical). Day 224 seeded the UFC demo assets, and **Day 225 shipped the
first WEB surface** — `/intelligence` with the Context and Scorecards tabs
(route/nav exactly as planned in `CONTEXT_ENGINE_ROUTE_PLAN.md` §1–2). That
MVP reads the real APIs and allows context draft editing + publish; the
Scorecard Studio tab is read-only, and the AI Builder, Autofill, Objection
Library and team-management modules remain unbuilt (see
`PREMIUM_UX_AUDIT.md` §Day 225 for the scope boundary and the
whole-object-`PUT` merge rule the Context editor must honour).
Implementation detail lives in the "Implementation status" /
"Runtime integration" sections of the companion specs.
Companion specs: `CONTEXT_ENGINE_SPEC.md`, `SCORECARD_STUDIO_SPEC.md`,
`MANAGER_TEAM_MANAGEMENT_SCOPE.md`.
Day 208 addenda (Context Engine UX design): `CONTEXT_ENGINE_UX_BLUEPRINT.md`
(layout, states, workflow, copy deck), `CONTEXT_ENGINE_FIELD_SPEC.md`
(exact MVP fields + UFC seed examples + compiled-block contract),
`CONTEXT_ENGINE_ROUTE_PLAN.md` (route decision + nav wiring checklist).
Day 209 addenda (Scorecard Studio UX design):
`SCORECARD_STUDIO_UX_BLUEPRINT.md` (list/editor/lifecycle/versioning UX),
`SCORECARD_STUDIO_FIELD_SPEC.md` (exact MVP fields + validation rules),
`SCORECARD_STUDIO_ROUTE_PLAN.md` (query-param deep links — supersedes the
`/intelligence/scorecards/[id]` subroute sketch in §7),
`AI_SCORECARD_BUILDER_SPEC.md` (draft-only AI flow, built after the editor).
Day 210 addenda (Objection Library + Sparring Scenario Engine — the
designed promotion of `company_context.objections` foreshadowed in §8):
`OBJECTION_LIBRARY_BLUEPRINT.md` (library UX, suggestion review,
supersession of the Context Engine objections module),
`OBJECTION_LIBRARY_FIELD_SPEC.md` (fields + data entities),
`SPARRING_SCENARIO_ENGINE_SPEC.md` (scenario builder + versioning +
sparring integration), `OBJECTION_TO_ASSIGNMENT_FLOW.md` (detect → review
→ teach → practise → prove loop + analytics).
Day 211 addenda (Manager Team Management UX):
`MANAGER_TEAM_MANAGEMENT_UX_BLUEPRINT.md` (team list, member drawer,
invite/deactivate flows, `rep_missing_office` fix loop),
`MANAGER_TEAM_MANAGEMENT_FIELD_SPEC.md` (fields + permission matrix),
`MANAGER_TEAM_MANAGEMENT_ROUTE_PLAN.md` (new `/team` route — supersedes
the "extend `/admin/users`" note; legacy `/admin/reps` + `POST
/v1/admin/users` disposition), `LICENCE_AND_SEAT_RULES.md` (seat model,
`company_licences` canonical over legacy `org_limits`).

---

## 1. Strategic goal

Gravix today scores every call the same way for every company: a generic
4-stage rubric (intro / discovery / objection / close) with generic coaching
suggestions. That is fine for a demo; it is not defensible as a product.

The Intelligence Layer is the system where a manager **teaches Gravix how
their company sells**:

- what the company sells, to whom, and how (Context Engine)
- what a good call looks like, per call type (Scorecard Studio)
- how to turn that into a rubric without prompt-engineering skills
  (AI Scorecard Builder)
- which objections recur and what good answers sound like
  (Objection / Playbook Library)
- who is on the team and who gets coached (Manager Team Management)

Once taught, every existing surface gets sharper for free: call scoring uses
company context, review flags map to company-specific criteria, assignments
and sparring target the criteria a rep actually failed.

**Principles extracted from competitor research (principles only — no layout,
wording, or feature structure copied):**

1. Company-specific context materially improves AI output quality.
2. Managers need visible control over scoring criteria — a black box is a
   trust killer in enterprise sales coaching.
3. Different call types deserve different scorecards.
4. AI should assist setup (drafting, autofill) but never hide the result —
   the manager always sees and approves what the AI will use.
5. A clean setup flow is what makes advanced AI understandable to a
   non-technical sales manager.

---

## 2. Current-state audit (what already exists)

Audited 11 July, WEB `05561b8`, API `3add39b`.

### Scoring
- `api/src/lib/scoring.ts` — the entire scoring runtime. Fixed 4-stage
  rubric hard-coded into a strict OpenAI JSON schema
  (`intro/discovery/objection/close`, each `{score, notes}`), plus overall,
  summary, moments, suggestions, voice.
- **Versioning spine already exists**: `RUBRIC_VERSION = "v1"`,
  `SCORING_PROMPT_VERSION`, `SCORING_MODEL_VERSION` are stamped onto
  `calls.rubric._meta`, `calls.ai_model`, `calls.rubric_version`, and each
  `call_scores` history row. A deterministic `score_cache` is keyed on
  rubric + prompt + model + transcript hash.
- `admin_config` low/critical score thresholds are already
  manager-configurable (`/admin/score` page) — precedent for manager-owned
  scoring configuration.
- Critical flags auto-create `coach_assignments` with a section→drill mapping
  (`close → closing-drill` etc.).

### Company/rep knowledge
- `knowledge_embeddings` table with `company_playbook` and `rep_memory`
  source types, **already retrieved into the scoring prompt**
  (`getScoringKnowledgeContext`). The Context Engine has existing plumbing
  to feed.
- `rep_memory` — rolling per-rep stage averages, strengths, weaknesses,
  coaching focus.
- `api/src/lib/contextBuilder.ts` — builds rep + company weakness context
  from `crm_activities` review flags (Day 66 era, crude but live).

### Team / seats
- `/v1/team/users` — tenant-scoped read of profiles (Day 168), plus
  `ensure-profile`. **No manager invite, edit, or deactivate.**
- `licence_pools` + `company_licences` tables exist at partner/super-admin
  level (`/v1/admin/partner/licences`, `/v1/admin/super/licences`) — seat
  limits exist as data; nothing enforces them at manager level.
- WEB team surfaces: `/admin/users`, `/admin/users/[id]`, `/admin/reps`,
  `/crm/manager/*`.

### Coaching surfaces that will consume the Intelligence Layer
- `/coaching` (command centre: review queue, assignments, sparring proof)
- `/assignments`, `/admin/assignments/*` (manager lane)
- `/sparring`, `/call-library`, `/whisperer`
- `/crm/analytics`, `/crm/overview` (both restyled as "Intelligence
  Cockpit" Days 205B–206 — the shell language already promises this layer)

### Placeholders
- Day 205B explicitly documented "Context Engine / Scorecard Studio —
  documented, not built". No routes, tables, or stubs exist. Clean slate.

---

## 3. Module overview

| # | Module | One-liner | MVP? |
|---|--------|-----------|------|
| 1 | Context Engine | Structured company profile injected into every AI operation | **Yes** |
| 2 | Scorecard Studio | Manager-owned, versioned scoring rubrics per call type | **Yes** |
| 3 | AI Scorecard Builder | Prompt → draft scorecard → manager review → activate | **Yes (single flow)** |
| 4 | Objection / Playbook Library | Recurring objections + approved responses + drills | Partial (data via Context Engine; UI later) |
| 5 | Manager Team Management | Invite/edit/deactivate reps within seat limits | **Yes (thin)** |
| 6 | Scoring Runtime Integration | Context + scorecard resolution, versioning, fallback | **Yes** |

---

## 4. User roles and permission model

Roles already in the platform: rep, manager, admin (company), partner admin,
super admin. The Intelligence Layer adds **no new roles**.

| Capability | Rep | Manager | Company admin | Partner/Super |
|---|---|---|---|---|
| View which scorecard scored their call | ✅ | ✅ | ✅ | ✅ |
| View company context | read-only summary | ✅ | ✅ | ✅ |
| Edit company context | ❌ | ✅ | ✅ | ❌ (support only) |
| Create/edit scorecard drafts | ❌ | ✅ | ✅ | ❌ |
| **Activate** a scorecard version | ❌ | ✅ | ✅ | ❌ |
| Manage objection library | ❌ | ✅ | ✅ | ❌ |
| Invite users (within seats) | ❌ | ✅ | ✅ | ✅ |
| Deactivate/reactivate users | ❌ | ✅ | ✅ | ✅ |
| Change seat limits / billing | ❌ | ❌ | ❌ | ✅ |

Hard rules:
- Everything is `company_id`-scoped using the existing `applyOrgScope` /
  hierarchy-filter patterns. **No cross-org context leakage** — context and
  scorecards are never readable or resolvable across companies, and
  embeddings queries already filter by `companyId`.
- Reps can always see *which* scorecard version scored a call (trust), but
  never edit intelligence configuration.
- No self-service billing or licence-pool editing at company level.

---

## 5. Key flows

### 5.1 First-run setup (manager)
1. Manager opens the new **Intelligence** workspace (nav: Admin group).
2. Empty state explains the three steps: *Teach → Score → Coach*.
3. Fills Context Engine sections (guided, skippable, autosaves as draft).
4. Opens Scorecard Studio → sees the Gravix default scorecard (read-only)
   already active for all call types → duplicates or AI-drafts a custom one.
5. Reviews draft, edits weights/criteria, **activates** it for a call type.
6. Next uploaded call of that type is scored with company context + custom
   scorecard; the call review page shows the scorecard name + version.

### 5.2 Scoring a call (runtime)
1. Call finishes transcription → scoring job starts.
2. Resolve scorecard: `(company_id, call_type)` → active version →
   else company default → else **Gravix default v1** (today's behaviour,
   zero regression).
3. Compile context block from `company_context` (bounded size) + existing
   playbook/rep-memory embeddings.
4. Score. Stamp `scorecard_version_id`, context version, and existing
   `SCORING_MODEL_VERSION` onto the call + `call_scores` row + cache key.
5. Flags/assignments derive from the scorecard's criteria and weights.

### 5.3 Weakness → coaching loop
1. Call fails criteria on a section → review flag carries the criterion id.
2. Assignment auto-creation (existing) maps the weakest section to a drill —
   now enriched with the criterion's coaching guidance text.
3. Sparring scenarios can later be linked from objection-library entries
   (deferred; see §8).

### 5.4 Team management (manager)
1. Manager opens Team page → sees seat usage ("7 of 10 seats used" from
   `company_licences`).
2. Invites a rep by email → profile created/invited within seat limit →
   assigns office/team.
3. Deactivate keeps history (calls, scores, memory) but frees a seat and
   blocks login/scoring.

---

## 6. Data model sketch (planning only — no migration yet)

All tables `company_id uuid not null` + RLS/`applyOrgScope` per existing
patterns.

```
company_context
  id, company_id (unique), status(draft|active),
  version int,                      -- bumped on each publish
  profile jsonb        -- { about, sales_motion, icp }
  offering jsonb       -- { products_services, pricing_positioning }
  objections jsonb     -- [{ objection, approved_response, weak_response, notes }]
  competitors jsonb    -- [{ name, notes, positioning }]
  compliance jsonb     -- { no_go_language: [], required_disclosures: [] }
  tone jsonb           -- { playbook_guidance, tone_notes }
  updated_by, updated_at, published_at

scorecards
  id, company_id, name, description,
  call_types text[]    -- inbound|outbound|demo|discovery|renewal|objection
  status(draft|active|archived),
  active_version_id → scorecard_versions.id (null while draft),
  created_by, created_at

scorecard_versions            -- IMMUTABLE once activated
  id, scorecard_id, version int,
  status(draft|active|superseded),
  sections jsonb       -- snapshot: [{ key, label, weight, criteria: [...] }]
  origin(manual|ai_draft|duplicate), source_prompt text null,
  approved_by, approved_at, created_at

-- Logical child entities (stored as the jsonb snapshot above in MVP;
-- split into real tables only when per-criterion analytics demands it):
scorecard_sections:  key, label, weight (weights sum to 100), order
scorecard_criteria:  id, section_key, label, description,
                     coaching_guidance, pass_fail bool, critical bool

objection_library    -- MVP: lives inside company_context.objections;
                     -- promoted to its own table in phase 2:
  id, company_id, objection, approved_response, weak_response,
  coaching_drill_id null, sparring_persona_id null, status, created_by

playbook_entries     -- already effectively exists as knowledge_embeddings
                     -- rows with source_type='company_playbook'; phase 2
                     -- adds a managed CRUD surface over it, not a new store.

team_members / seats -- NO new table. profiles (+ office_id/company_id
                     -- stamping from Days 165–168) is the member record;
                     -- company_licences is the seat limit. Add only:
  profiles.is_active bool default true   (phase: team mgmt day)
```

Call stamping (extends existing columns, no schema change needed for MVP):
- `calls.rubric._meta` gains `scorecard_id`, `scorecard_version`,
  `context_version` (it already carries `rubric_version`, `model_version`).
- `call_scores` rows likewise (jsonb `rubric` snapshot already stored).

---

## 7. Route map (WEB) and API sketch

### WEB routes (new, App Router, shell + PageHeader + WorkspaceTabs patterns)
```
/intelligence                     workspace home (tabbed, ?tab= deep links)
  ?tab=context                    Context Engine editor
  ?tab=scorecards                 Scorecard Studio list
/intelligence/scorecards/[id]     scorecard detail / version editor
```
Nav: add "Intelligence" to the **Admin** group in the sidebar (manager+
gated, same gating as existing manager surfaces). Team management extends
the existing `/admin/users` surface — no new route.

### API endpoints (new `/v1/intelligence/*` router; sketch only)
```
GET    /v1/intelligence/context             read (org-scoped)
PUT    /v1/intelligence/context             save draft
POST   /v1/intelligence/context/publish     bump version + activate

GET    /v1/intelligence/scorecards          list (incl. default virtual card)
POST   /v1/intelligence/scorecards          create draft
GET    /v1/intelligence/scorecards/:id      detail + versions
PUT    /v1/intelligence/scorecards/:id/draft    save draft version
POST   /v1/intelligence/scorecards/:id/activate activate draft (manager only)
POST   /v1/intelligence/scorecards/:id/archive

POST   /v1/intelligence/scorecards/ai-draft prompt → draft version (never live)

-- Team (extends existing /v1/team)
POST   /v1/team/invite                      seat-checked invite
PATCH  /v1/team/users/:id                   office/role/is_active
```
All behind the existing auth + proxy (`/api/proxy`) + org-scope middleware.
No new trust boundaries.

---

## 8. MVP vs later

### MVP (build first)
1. **Context Engine v1** — one org-scoped record, guided sectioned form,
   draft/publish, compiled into a bounded context block in the scoring
   prompt. No AI autofill.
2. **Scorecard Studio v1** — list + editor + versioning + activation.
   Custom scorecards keep the **four canonical stages fixed** and customise
   per-stage weights, criteria, pass/fail flags, and coaching guidance.
   Call-type applicability per scorecard.
3. **AI Scorecard Builder v1** — one flow: manager prompt (+ published
   context) → AI drafts sections/criteria → lands as a **draft** version →
   manager edits → activates. No auto-publish, ever.
4. **Runtime integration v1** — scorecard resolution + fallback chain,
   version stamping on calls/history/cache-key, call review page shows
   "Scored with {name} v{n}".
5. **Team management v1** — invite within seats, edit office/role,
   deactivate/reactivate, seat-usage display.

### Deliberately NOT in MVP (and why)
- **AI autofill from website** — needs crawling/enrichment infra; the form
  works without it. Later.
- **Fully custom section structures** — every WEB consumer renders the four
  canonical stages (`analysis_json.stages.intro…close`); arbitrary sections
  would break call review, dashboards, rep memory, drill mapping. Phase 2
  requires a generalised renderer first.
- **Objection Library as its own module** — objections are captured inside
  the Context Engine in MVP; a dedicated CRUD surface + sparring-scenario
  linking is phase 2.
- **Playbook entry management UI** — `knowledge_embeddings` ingestion stays
  seed/support-driven for now.
- **Per-criterion analytics** — needs the relational criteria split; wait
  for real usage.
- **Scorecard import/export, per-office scorecards, A/B rubrics** — no.

### Scope-creep guardrails
- One new WEB workspace, one new API router, ≤3 new tables in the first
  migration.
- Any feature that requires changing the strict scoring JSON schema beyond
  criteria-within-stages is automatically phase 2.
- The Gravix default rubric remains the untouched fallback — the MVP must be
  deletable without breaking existing scoring.

---

## 9. Scoring runtime integration (detail)

### Scorecard resolution (per call)
```
call.call_type (set at /upload; nullable)
  → active scorecard_version for (company_id, call_type)
  → else company default scorecard (call_types = [] means "all")
  → else Gravix default rubric v1 (exactly today's behaviour)
```

### Versioning and history — manager changes never rewrite history
- Activated versions are **immutable**; editing creates a new draft version;
  activation supersedes the previous one.
- Old calls keep the `scorecard_version_id` they were scored with; re-scoring
  is only ever an explicit manager action and writes a new `call_scores` row
  (the history table already exists for this).
- Reports/analytics group by scorecard version; the call review page always
  shows the scorecard name + version that produced the number on screen.

### Determinism and cache
- `score_cache` key gains `scorecard_version_id` + `context_version`
  (today: rubric/prompt/model/transcript hash). Publishing context or
  activating a scorecard naturally misses the cache — old entries stay
  valid for old versions.

### Downstream consumers
- Review flags carry `criterion_id` where a pass/fail criterion failed;
  severity from the criterion's `critical` flag (feeds the existing
  threshold/flag machinery rather than replacing it).
- Assignment auto-creation keeps the section→drill map, enriched with
  criterion coaching guidance in the assignment notes.
- `rep_memory` weakness labels can later reference criteria (phase 2).

### Day 222 — live runtime proof status (PROVEN)

Day 221 wired resolution into `scoreWithLLM` and proved the units against
synthetic companies. Day 222 proved the same chain end-to-end on the real UFC
demo company, through the real manager HTTP routes and the real scoring entry
point: `npm run validate:intelligence-runtime-live` (API), 58/58.

What is proven live:

- Dana publishes a real UFC context (`PUT /v1/intelligence/context` →
  `POST /context/publish` → v1) and activates a real UFC company-default
  scorecard (weights 20/30/30/20, one criterion per fixed stage).
- A controlled proof call scored through `scoreWithLLM` persists
  `calls.rubric._meta` naming exactly those assets: `scoring_model_version`,
  `rubric_version`, `scorecard_source=company_default`, `scorecard_name`,
  `scorecard_id`, `scorecard_version_id`, `scorecard_version=1`,
  `context_version=1`, `context_published_at`.
- Cache keys: custom ≠ default, a context bump changes the key, a scorecard
  bump changes the key, and the default path key shape is unchanged.
- Isolation: another company resolves none of UFC's assets; the surviving
  draft context is never scored; archived scorecards and superseded versions
  are never selected.

**Scoring method — stated honestly.** No LLM call is made. The validator unsets
`OPENAI_API_KEY` (so a cache miss can only degrade to the heuristic fallback,
never a paid call) and seeds a sentinel into `score_cache` under the key derived
from the just-published versions. `scoreWithLLM` then runs for real and resolves
and keys *itself* — so the cache **hit** is the proof that its live resolution
matched, and the rubric it writes is real runtime output. The LLM request path
is unexercised; its only two injection points (the context and scorecard prompt
blocks) are asserted directly against the live resolved assets instead. A
genuine paid end-to-end score remains unproven and is the one honest gap.

**Nothing is persisted (superseded by Day 224 — see below).** The Day 222
validator removed the UFC context and scorecard when it finished, because
`validate:intelligence-context` and `validate:intelligence-scorecards` both
asserted the UFC company starts with no context and no scorecard rows.

### Day 224 — UFC assets seeded, validators decoupled from demo data

`npm run seed:ufc-intelligence` now seeds the assets **persistently**: published
context v1, "UFC Sales Scorecard" v1 (active, company default, fixed four
stages, weights 20/30/30/20), and one proof call scored through the real runtime
so `/calls/[id]` shows "Scored with UFC Sales Scorecard v1 · Company context v1
applied". The Nate Diaz hero call is untouched and still renders the calm
default state, so the demo shows both branches.

The blocker Day 222 named was not that the validators *tolerated* an empty UFC —
it was that they **wrote to UFC**. `validate:intelligence-context` and
`validate:intelligence-scorecards` saved drafts, published versions and created
scorecards as Dana inside the demo company; a single run archived the seeded
context and replaced it with validator content. Teaching them to tolerate a
seeded baseline would have left that mutation in place. Instead both now own
throwaway fixture companies and never touch UFC, which also restores absolute
assertions (publish → v1, second publish → v2, empty list = empty). Day 222 was
retargeted to prove the seeded assets rather than publish its own, and no longer
deletes them.

Validators: `validate:ufc-intelligence-seed` 57/57 ·
`validate:intelligence-context` 27/27 · `validate:intelligence-scorecards` 59/59
· `validate:intelligence-runtime` 53/53 · `validate:intelligence-runtime-live`
57/57 — all green together, in any order, with the seed in place.

**Known gap (not a Day 222 blocker).** On the heuristic fallback path (LLM
unreachable), `buildRubricWithMeta` is called without the resolved context or
scorecard, so `_meta` stamps `scorecard_source=gravix_default` even for a
company with custom assets. `resolvedScorecard` is scoped inside the `try`, so
the `catch` cannot see it. The fallback genuinely uses neither asset, so no
score is wrong — but the provenance line is misleading and would read as "your
scorecard was ignored". Worth an explicit `scorecard_source=fallback` (or
similar) rather than silently reusing the default label.

1. **Manager approval before activation** — nothing the AI drafts ever
   scores a live call without a human clicking Activate.
2. **No silent scoring changes** — activating a scorecard or publishing
   context is an explicit, logged action (`crm_activities` audit row, same
   pattern as existing events).
3. **Seat limits enforced server-side** on invite (count active profiles vs
   `company_licences`); UI shows usage but the API is the gate.
4. **Org scoping everywhere** — all new tables carry `company_id`; all
   queries go through the existing scope helpers; embeddings retrieval
   already company-filtered.
5. **No cross-org leakage in prompts** — the context block is compiled from
   the caller's company only; no shared/global context store.
6. **Compliance section is advisory in MVP** — no-go language informs
   scoring criteria; automated compliance flagging is phase 2 (needs its own
   accuracy bar before it can be trusted).
7. **Fallback safety** — a broken/missing custom scorecard falls back to the
   default rubric rather than failing the scoring job.

---

## 11. Demo story (single login, extends the UFC seed)

Dana (manager, UFC Gyms org):
1. Opens **Intelligence** → Context Engine shows UFC's profile: memberships
   +  PT packages, ICP (gym-curious 25–45), common objections ("too
   expensive", "no time"), competitor notes, no-go language ("guaranteed
   results").
2. Opens Scorecard Studio → "Discovery Call — UFC v2 (active)" next to the
   read-only Gravix default. Opens it: weights favour discovery (35%),
   criteria like "asked about training goals before pitching", each with
   coaching guidance.
3. Shows the AI Builder: types "renewal call scorecard focused on retention
   saves" → draft appears in seconds → *edits* a weight → activates.
4. Opens Nate Diaz's Price Objection call → header shows "Scored with
   Discovery Call — UFC v2" → the failed criterion links straight to the
   auto-created objection-handling assignment.
5. Team tab: "8 of 10 seats", invites a new rep in one line.

Narrative: *"Gravix doesn't just score calls — it scores them the way YOUR
company sells, and you stay in control of the rubric."*

---

## 12. Implementation sequence (future days — subject to re-planning)

| Day | Lane | Scope |
|---|---|---|
| 208 | Context Engine data | `company_context` migration + `/v1/intelligence/context` CRUD + org-scope tests |
| 209 | Context Engine UI | `/intelligence?tab=context` guided form, draft/publish |
| 210 | Runtime: context | context block in scoring prompt + `context_version` stamping + cache-key extension, proven no-regression on default path |
| 211 | Scorecard data | `scorecards` + `scorecard_versions` migration + CRUD endpoints + default-scorecard virtual read |
| 212 | Scorecard Studio UI | list + editor (stages fixed, weights/criteria editable) + activate flow |
| 213 | Runtime: scorecards | resolution chain + fallback + stamping + call review "scored with" surface |
| 214 | AI Builder | ai-draft endpoint + review/edit/activate UX |
| 215 | Team management | invite within seats + `is_active` + `/admin/users` extension |
| 216 | Seed + QA | UFC intelligence seed + demo rehearsal + close lane |

Each day stays independently shippable; runtime days (210, 213) each need a
live scoring proof before merging.

---

## 13. Risks

1. **Prompt-quality regression** — injecting context/criteria can degrade
   scoring consistency. Mitigation: bounded context block, keep strict JSON
   schema, side-by-side spot checks before activating for the demo org.
2. **Schema rigidity** — the strict OpenAI schema hard-codes four stages;
   criteria must be scored *within* stages in MVP. Named explicitly so
   nobody "quickly" adds custom sections and breaks every consumer.
3. **Cache/determinism churn** — forgetting to fold versions into the cache
   key would serve stale scores after activation; folding too much in kills
   the cache. Only `scorecard_version_id` + `context_version` go in.
4. **Scope creep** — this layer touches everything; guardrails in §8 exist
   to keep each day small and reversible.
5. **Seat enforcement bypass** — invite must be checked server-side; the
   existing `ensure-profile` path must not become a backdoor around limits.
6. **Stale `.js` shadowing** (Day 171 lesson) — new API modules must ship
   without compiled `.js` siblings in `src/`.
7. **Trust** — if managers see AI-drafted criteria auto-applied, trust dies.
   The approval gate is a product feature, not just a safety rule.
