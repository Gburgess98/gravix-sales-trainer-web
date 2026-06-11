# TIER 2A — SPARRING BRAIN AUDIT (Day 100)

**Checkpoint audited:** API `d20dfe2` / WEB `f3ad6a5`, both tagged `sprint-day-99-complete`, clean.

## Headline finding

**A substantial text-first sparring system already exists end-to-end.** Tier 2A is not a greenfield build — it is a formalisation layer: extract the implicit conversation state into a real state manager, put the hard-wired OpenAI call behind a provider router (adding Claude), structure the turn scoring, and add the manager review surface. Most of the 16 Tier 2A items map to existing code to reuse or upgrade, not new systems.

## 1. Existing API sparring files

| File | Size | What's in it |
|---|---|---|
| `src/routes/sparring.ts` | **3,707 lines** | The whole engine: sessions, turns, scoring, XP/streaks, emotional state, analytics, leaderboard, replay |
| `src/personas.ts` | 285 lines | `PERSONAS` config: typed `PersonaBehaviour` (tone, replyLength, pace, objectionFrequency, interruptionLevel, pricePressure, hangupChanceBase, patienceTurns) + per-difficulty modifiers for **easy/normal/hard/nightmare** |
| `src/lib/llm.ts`, `src/lib/openai.ts` | 29 lines | Thin OpenAI client singletons (`OPENAI_API_KEY`) |
| `src/lib/contextBuilder.ts` | 55 lines | Context assembly helper |

### Existing endpoints (`/v1/sparring`)
- `POST /sessions` — create; accepts `personaId`, `difficulty`, `mode`, **`assignmentId`**; loads company persona profile + emotional tuning; computes adaptive difficulty
- `POST /sessions/:id/turns` — rep message → loads full turn history → **OpenAI `gpt-4o-mini` buyer reply** (env `OPENAI_SPARRING_MODEL`) with error fallback → heuristic micro-score → persists both turns
- `POST /sessions/:id/micro-score`, `POST /score` — heuristic turn scoring + session finalise (XP award, `completeAssignmentsForTarget` for assignment auto-completion)
- `POST/GET /sessions/:id/replay` — **rep retry mode already exists**
- `GET /sessions`, `GET /sessions/:id`, `GET /sessions/:id/analytics` (behavioural analytics), `GET /personas`, `GET /leaderboard/:personaId`, `POST /analyse-turn` (second `gpt-4o-mini` call)

### Existing tables (live in dev, **no SQL migrations in `sql/`** — created ad-hoc)
- `sparring_sessions(id, rep_id, persona_id, score, xp_awarded, turns, created_at, meta, total_score, duration_ms, summary, flags, difficulty, failed_moments)`
- `sparring_turns(id, session_id, role, text, created_at)` — **no per-turn score or state columns**
- `xp_events(id, rep_id, source, delta, created_at, amount, session_id)`

### Existing intelligence
- **Emotional state:** `EmotionalState {anger, boredom, trust}` + `PersonaMutationState {volatility, resistance, unpredictability}` scaled by difficulty — pressure ramping partially exists
- **Micro-scoring:** keyword-heuristic per rep turn with calibration env flags (`SPAR_STREAK_USE_CALIBRATION`, etc.) — explicitly documented in-code as a stopgap
- **Failed moments** tracked per session (feeds replay)
- **Company persona profiles** + emotional tuning loaded per org — script/objection loader foundation
- XP + streak system with multipliers

## 2. Existing WEB sparring files

| File | Size | Notes |
|---|---|---|
| `src/app/sparring/[id]/page.tsx` | **2,850 lines** | Full chat session UI: turns, micro-score, analytics, leaderboard, replay, score submission |
| `src/components/SparringStartButton.tsx` | 390 lines | Persona picker + session create |
| `src/app/reps/[id]/sparring/page.tsx` | 78 lines | Rep sparring view |
| `src/app/call-library/page.tsx` | — | Sparring tab lists sessions + personas |
| `src/app/assignments/AssignmentsClient.tsx` | — | **`sparringHref()` already launches `/sparring/[personaId]?assignmentId=`** — assignment-linked sparring entry exists |

No sparring e2e tests exist.

## 3. Assignment engine integration points (ready from Sprint 4)

- `assignments.type='sparring'` supported; `POST /v1/assignments` works for it (incl. drill intelligence: `meta.drill_type`, adaptive difficulty, `sparring_context` seed)
- Session create accepts `assignmentId`; session finalise calls `completeAssignmentsForTarget` → XP + manager Command Centre tracking updates automatically
- Manager Command Centre tracks open/overdue/completed sparring assignments today with zero changes

## 4. Existing scoring/LLM services

- `scoreWithLLM` in `src/lib/scoring.ts` (2,367 lines): structured JSON-schema scoring, score caching (`score_cache`), determinism keys, retry handling — the **pattern to copy** for session summaries/turn scoring
- OpenAI usage is inline in `sparring.ts` (two call sites), not abstracted — **no provider router, no Claude**, `.env` has `OPENAI_API_KEY` only (no `ANTHROPIC_API_KEY`)

## 5. Reuse vs replace recommendations

| Existing | Verdict |
|---|---|
| Sessions/turns persistence + endpoints | **Reuse** — additive columns only |
| Persona configs (`personas.ts`) + company profiles | **Reuse** — already covers Tier 2A item 13 |
| Emotional state + mutation helpers | **Reuse/extract** into the state manager module |
| Heuristic micro-score | **Keep as fallback tier**, add structured scoring above it |
| Inline OpenAI calls | **Replace** with provider router (Claude + OpenAI + deterministic stub) |
| XP/streak/replay/analytics/leaderboard | **Reuse untouched** |
| `sparring.ts` monolith | **Do not grow** — new code goes in `src/sparring/` modules |
| `DEV_REP_ID` fallback in session create | **Replace** — gate behind `NODE_ENV !== 'production'` |

## 6. Gaps (the actual Tier 2A work)

1. **No formal conversation state object** — stage/mood/trust/pressure/objection state is implicit and scattered; nothing persisted per turn
2. **No provider orchestration** — OpenAI hard-wired; no Claude; no fallback chain policy
3. **Turn scoring is keyword-heuristic** — no clarity/confidence/objectionHandling/progression dimensions
4. **No structured session summary generation** (a `summary` column exists but no generation pipeline matching the Tier 2A model)
5. **No manager review surface** — no `GET /v1/manager/sparring-sessions`, no hierarchy-scoped sparring view, nothing in `/coaching`
6. **No tenant columns on sparring tables** — `sparring_sessions` lacks `company_id/office_id/assignment_id/status`; manager queries would need joins or additive columns
7. **No sparring e2e tests**
8. **Pacing rules** partial (replyLength/pace flags exist but prompt-side enforcement is thin)

## 7. Risks

- `sparring.ts` (3,707 lines) and `sparring/[id]/page.tsx` (2,850 lines) are the two biggest files in the codebase — modify surgically, build new logic in new modules
- Sparring tables have **no migration files**; schema drift risk — Tier 2A should bring them under `sql/` with documented additive migrations
- Two OpenAI call sites have different error handling; provider router must preserve the existing fallback behaviour exactly
- The session create dev-rep fallback (`DEV_REP_ID`) would be a prod identity hole if deployed as-is

## 8. Security / tenant considerations

- Sparring routes check rep ownership but do **not** use the Sprint 4 dual pattern; the manager sparring view must use `requireManager` + `getUserContext`/`applyHierarchyFilters` (sessions need `company_id`/`office_id` columns or a `users` join)
- Reuse `logAuditEvent` for `sparring.session_completed` and manager views (fail-soft, same as Sprint 4)
- Provider keys stay server-side; never sent through `/api/proxy`

## 9. Cost / latency considerations

- Buyer replies are the hot path: small/fast model (Claude Haiku 4.5 or `gpt-4o-mini`), `max_tokens` ≤ 200, history windowed to last ~12 turns + compact state block — not the full transcript
- Turn scoring: heuristic (free) per turn; LLM scoring batched **once at session end** by default; per-turn LLM scoring only for hard/nightmare if justified later
- Deterministic stub provider keeps dev/e2e tests free and removes API-key dependence
- Latency target: **p50 < 2.5s** per buyer reply (single small-model call, no chained calls in the turn path)
