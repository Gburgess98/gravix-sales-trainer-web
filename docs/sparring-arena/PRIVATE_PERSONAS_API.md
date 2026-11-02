# Private personas — required API / data changes

Status: **proposal, not built.** Nothing here has been applied to any database or deployed. The web prototype
(`/sparring` → My Personas, `/sparring/personas/new`) stores drafts **in this browser only** and says so on screen.
Server-side enforcement is the only enforcement that counts; the web rules in `src/lib/persona-library.ts` mirror this
contract for UX and are unit-tested, but must never be relied on for security.

## 1. What the API does today (read from `gravix-sales-trainer-api`, no changes made)

| Fact | Where | Consequence |
|---|---|---|
| Personas are a **static list**, defined twice | `src/personas.ts` `PERSONAS` and an inline array in `GET /v1/sparring/personas` (`routes/sparring.ts` ~L1819) | No table, owner, tenant or status exists. |
| `GET /v1/sparring/personas` is a **PUBLIC route** ("static persona catalogue") | `src/routeAuthPolicy.ts` `PUBLIC_ROUTES` | It cannot return private/tenant personas: that would be an unauthenticated data leak. Needs a separate authenticated endpoint. |
| Unknown persona ids **silently fall back to Price Sensitive** | `getPersonaConfig()` returns `PERSONAS[0]` | A custom persona id would be practised as the wrong opponent. Session creation must validate and fail loudly. |
| `meta.opponent_profile` (job title, industry, company size) is sent by the web but **not read by the API** | no match in `src/` | Role/industry typed in the existing start dialog have no effect on the buyer. |
| Aggregates are scoped by `accessibleRepIds()`: reps see only themselves, manager tiers see their tenant (`tenantKey`) | `src/lib/repAccess.ts` | Same scoping model must apply to persona visibility. |
| Session `persona_id` is `text`; `meta.personaId` also stored | `sql/00000000_base_schema.sql`, `POST /sessions` | Can hold a uuid without a migration on `sparring_sessions`. |

## 2. Data model (additive migration, draft — not applied)

```sql
create table if not exists public.sparring_personas (
  id               uuid primary key default gen_random_uuid(),
  owner_rep_id     uuid not null,                 -- reps.id of the creator (rep or manager)
  org_id           uuid null,
  company_id       uuid null,
  office_id        uuid null,                     -- tenant keys copied from the creator at write time
  status           text not null default 'private'
                   check (status in ('private','submitted','team_approved','archived')),
  name             text not null check (char_length(name) between 2 and 60),
  job_role         text not null check (char_length(job_role) <= 80),
  industry         text null     check (char_length(industry) <= 80),
  context          text null     check (char_length(context) <= 400),
  objection_style  text not null
                   check (objection_style in ('price','hostile','disengaged','numbers_risk','process')),
  traits           text[] not null default '{}',  -- max 5, each <= 30 chars (enforced in API too)
  difficulty       text not null default 'normal'
                   check (difficulty in ('easy','normal','hard','nightmare')),
  length_pref      text not null default 'standard' check (length_pref in ('quick','standard','long')),
  base_engine_id   text not null,                 -- one of the built-in persona ids; drives the behaviour model
  source_persona_id text null,                    -- set when duplicated from a team/built-in persona
  submitted_at     timestamptz null,
  reviewed_by      uuid null,
  reviewed_at      timestamptz null,
  review_outcome   text null check (review_outcome in ('approved','rejected')),
  review_note      text null check (char_length(review_note) <= 400),
  archived_at      timestamptz null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_sp_owner      on public.sparring_personas(owner_rep_id, status);
create index if not exists idx_sp_company    on public.sparring_personas(company_id, status);
-- Rollback: drop table if exists public.sparring_personas;
```

`objection_style` maps to the existing behaviour engines (the wizard offers exactly these five):
`price`→`price_sensitive`, `hostile`→`angry`, `disengaged`→`silent`, `numbers_risk`→`cfo`, `process`→`procurement`.
`base_engine_id` is derived from it server-side (never trusted from the client).

**Rejected is not deleted.** Rejection sets `status='private'`, `review_outcome='rejected'`, `review_note`; the persona
stays the rep's and stays usable. **Team-created** personas are written directly as `team_approved` by a manager tier.

## 3. State machine (server-enforced)

| From | Action | To | Who |
|---|---|---|---|
| (new) | create | `private` | any authenticated rep |
| (new) | create team persona | `team_approved` | manager tier only |
| `private` | submit | `submitted` | owner |
| `submitted` | withdraw | `private` | owner |
| `submitted` | approve | `team_approved` | manager tier, same tenant |
| `submitted` | reject (+note) | `private` (`review_outcome='rejected'`) | manager tier, same tenant |
| `private` | edit | `private` | owner |
| `private` / `team_approved` | archive | `archived` | owner (private); manager tier same tenant (team) |
| `archived` | restore | `private` (rep) / `team_approved` (team) | same actors |
| any | duplicate | new `private` copy, `source_persona_id` set | any rep who can *see* the source |

Anything else returns `409 invalid_transition`. A `submitted` persona is **read-only** until withdrawn.
Editing a `team_approved` persona is **403 `persona_read_only`** for reps (hint: duplicate it).

## 4. Authorisation matrix (all checks in the API, using `tenantKey` and the verified `req.userId`)

| Action | Owner rep | Other rep (same tenant) | Manager (same tenant) | Any caller, other tenant |
|---|---|---|---|---|
| See `private` | yes | **no (404)** | **no (404)** by default | 404 |
| See `submitted` | yes | no (404) | yes (approval queue) | 404 |
| See `team_approved` | yes | yes | yes | 404 |
| See `archived` | yes (own) | no | yes (team) | 404 |
| Use in a session | private/submitted/team_approved | team_approved only | team_approved + own | never |
| Edit | private only | no | team personas they own/manage | never |

Cross-tenant and not-visible both answer **404** so existence is not leaked. Managers do not read reps' *private*
personas (the rep chose privacy); they see them only once submitted.

## 5. Endpoints (all authenticated; none added to `PUBLIC_ROUTES`)

- `GET  /v1/sparring/library?scope=shared|mine|submitted[&include_archived=1]`
  `shared` = built-ins + this tenant's `team_approved`; `mine` = caller's own; `submitted` = manager tiers only.
  `GET /v1/sparring/personas` stays public and unchanged (backwards compatible).
- `POST /v1/sparring/personas` (create) · `PATCH /v1/sparring/personas/:id` · `POST /:id/duplicate`
- `POST /:id/submit` · `/:id/withdraw` · `/:id/approve` · `/:id/reject` · `/:id/archive` · `/:id/restore`
- No `DELETE`: history is retained (archive only).
- Limits: max 20 non-archived private personas per rep; per-rep write rate limit (reuse `rateLimited`).
- `npm run validate:route-authz` must be re-run: every new route has to answer anonymous/forged requests with 401.

## 6. Session creation (`POST /v1/sparring/sessions`)

1. `personaId` may be a built-in id **or** a persona uuid.
2. Resolve through one function that applies §4 ("use in a session"). Not visible / archived / other tenant →
   `422 persona_not_available`. **Remove the silent fallback** for unknown ids.
3. Store a **snapshot** of the persona (`meta.persona_snapshot`: name, role, industry, context, objection style,
   traits, difficulty) so later edits or archiving never rewrite a past session.
4. Stats and leaderboards for a private persona are **the owner's sessions only** and must never enter team aggregates;
   `GET /leaderboard/:personaId` must apply the same visibility check.

## 7. Engine

Build a `PersonaConfig` from the row: behaviour parameters from `base_engine_id` + difficulty modifiers (existing
`buildPersonaBehaviourSummary`), plus name / role / industry / context / traits injected into the buyer system prompt.
**These free-text fields are untrusted user input interpolated into an LLM prompt**: cap lengths (§2), strip control
characters, wrap them as quoted data, and add a test that an instruction-like persona description cannot change the
buyer's rules. Decide whether to wire or deprecate `meta.opponent_profile` at the same time.

## 8. Tests the API change must ship with

authz matrix (§4) incl. cross-tenant 404 · reject keeps the persona and its usability · rep cannot edit team persona ·
submitted is read-only · session creation with someone else's private persona → 422 · archived unusable ·
unknown id no longer falls back · stats scoping · prompt-injection fixture · `validate:route-authz`.

## 9. What the web prototype does now (and what changes)

| Today (prototype) | After the API ships |
|---|---|
| `PersonaStore` = `localStorage` keyed by user id: **this browser only**, labelled "Prototype" in My Personas and the wizard | `PersonaStore` calls the endpoints above; no other UI change |
| "Start practising" starts a round on the **closest built-in engine** (`objection_style` → base persona). Name/role/industry/context do **not** change the buyer yet | Sends the persona uuid; the engine uses the full persona |
| "Submit for team approval" is **disabled** with an explanation: it cannot reach a manager without the service | Calls `/submit`; managers get an approval queue |
| Managers' approve/reject UI is **not built** (no queue to read) | Built against `scope=submitted` |
| Archive/duplicate/edit work on the local copy | Same actions via the API |

## 10. Rollout

1. Apply the migration (additive; staging first). 2. Deploy API (new routes + session resolution) — no web dependency.
3. Run API tests + `validate:route-authz`. 4. Switch the web `PersonaStore` implementation behind a flag on staging.
5. Enable on production only after the WEB↔API secret pairing in `SECURITY_ROLLOUT_CHECKLIST.md` is confirmed.

## 11. Open decisions

- May managers ever read a rep's *private* persona (e.g. coaching a struggling rep)? Default here: no.
- Should approval copy the persona (rep keeps a private original) or promote it in place? Default here: promote in place.
- Per-persona stats for `team_approved` personas: attempts/defeats only, or also a named record holder?
