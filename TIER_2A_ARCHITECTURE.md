# TIER 2A — SPARRING BRAIN ARCHITECTURE (Day 100)

Text-first. No Deepgram (2B), no ElevenLabs (2C), no audio scoring (2D).

## Target architecture

A **Sparring Brain layer** in `src/sparring/` (new modules) that formalises the existing engine in `src/routes/sparring.ts` without rewriting it:

```
rep message
  → state.ts        update conversation state (stage, mood, trust, pressure, objection)
  → pressure.ts     difficulty/pressure rules adjust state + buyer directives
  → providers.ts    buyer reply (Claude | OpenAI | stub) from persona + state + windowed history
  → scoring.ts      turn score (heuristic now, structured dimensions) + state feedback loop
  → persistence     turn + state snapshot + score saved (existing tables, additive columns)
  → on complete     summary generated, assignment auto-completed, XP awarded, audit event
  → manager         GET /v1/manager/sparring-sessions (hierarchy-scoped) + /coaching surface
```

New modules (API): `src/sparring/state.ts`, `src/sparring/providers.ts`, `src/sparring/pressure.ts`, `src/sparring/scoring.ts`, `src/sparring/summary.ts`, `src/sparring/prompts.ts`. The existing routes call into these; `sparring.ts` does not grow.

## Conversation lifecycle

1. **Create** — `POST /v1/sparring/sessions` (exists): persona + difficulty + optional `assignmentId`; initial state derived from persona behaviour + difficulty + assignment `sparring_context` (flag_section seeds the objection focus).
2. **Turns** — `POST /v1/sparring/sessions/:id/messages` (alias of existing `/turns`): state update → buyer reply → turn score → persist. State snapshot saved per turn.
3. **Complete** — `POST /v1/sparring/sessions/:id/complete`: final scores aggregated, summary generated, `completeAssignmentsForTarget`, XP, `sparring.session_completed` audit event.
4. **Review** — rep retry via existing replay endpoints; manager via `GET /v1/manager/sparring-sessions`.

## State manager (`state.ts`)

Pure, deterministic, unit-testable. The session-state shape (persisted in `sparring_sessions.state` jsonb, snapshot per turn):

```json
{
  "stage": "opening|discovery|pitch|objection|close|ended",
  "buyerMood": "neutral|curious|sceptical|frustrated|warm",
  "trustLevel": 0-100,
  "pressureLevel": 0-100,
  "objectionState": { "active": true, "type": "price|timing|authority|trust|competitor|unknown", "resolved": false },
  "repPerformance": { "clarity": 0-100, "confidence": 0-100, "objectionHandling": 0-100, "progression": 0-100 },
  "difficulty": "easy|standard|hard|nightmare",
  "nextBuyerMove": "ask_question|raise_objection|request_info|soften|push_back|close_window"
}
```

Transitions are rule-based: stage advances on progression signals; mood/trust move from turn scores + existing `EmotionalState` logic (extracted from `sparring.ts`); `nextBuyerMove` is chosen from persona behaviour + pressure + a bounded random factor (existing `unpredictability`). The LLM never owns state — it receives state as a directive and returns only the buyer's words.

## Persona memory

Per-session memory (in `state.meta.memory`, no new table): persona traits snapshot, objections already raised (+ whether resolved), key facts the rep claimed (price, features — extracted cheaply by regex/keyword first), emotional trajectory. Injected into the buyer prompt each turn so the buyer "remembers" — e.g. re-raises an unresolved price objection, calls out contradictions. Existing company persona profiles + `PERSONAS` configs remain the trait source (Tier 2A item 13 already shipped in code).

## Provider orchestration (`providers.ts`)

```
interface SparringProvider {
  buyerReply(ctx): Promise<{text, latencyMs}>
  scoreTurns(ctx): Promise<TurnScores>      // batch, session-end by default
  summarise(ctx): Promise<SessionSummary>
}
```

- **Providers:** `claude` (new, `@anthropic-ai/sdk`; buyer replies on `claude-haiku-4-5-20251001` for cost/latency, summaries optionally `claude-sonnet-4-6`), `openai` (existing `gpt-4o-mini` call moved behind the interface, behaviour-preserving), `stub` (deterministic rule-based replies from persona + state — dev/test/fallback).
- **Routing:** env-driven — `SPARRING_PROVIDER=claude|openai|stub` (+ optional per-task overrides `SPARRING_SUMMARY_PROVIDER` etc.), `ANTHROPIC_API_KEY` added to env.
- **Fallback chain:** configured provider → other LLM provider → stub. A stub reply is tagged in turn meta so sessions never break mid-conversation.

## Difficulty / pressure model (`pressure.ts`)

Formalises existing `PersonaMutationState` + difficulty modifiers. Levels easy/standard/hard/nightmare (mapping existing "normal"→"standard", keeping back-compat). Pressure rises on weak/vague rep turns (low turn score), falls on strong ones; difficulty scales the slope and the ceiling. Pressure drives: objection frequency, buyer patience (existing `patienceTurns`), `nextBuyerMove` weighting, and hang-up chance (existing `hangupChanceBase`). **Objection pressure ramping = pressureLevel × persona objection profile** — deterministic, no AI cost.

## Turn scoring model (`scoring.ts`)

Two tiers:
1. **Heuristic tier (every turn, free):** existing micro-score extended to emit the four dimensions (clarity, confidence, objectionHandling, progression) from rule signals; feeds state immediately.
2. **LLM tier (session end, one batched call):** scores all rep turns in one structured-output request (JSON schema, copying the `scoreWithLLM` pattern incl. caching); reconciles/overwrites heuristic dimensions in `sparring_turn_scores` data.

Per-turn LLM scoring is explicitly out of MVP (cost/latency).

## Session summary model (`summary.ts`)

One LLM call at completion (same batched request as the scoring tier where possible): overall score, dimension averages, top 2 weak moments (turn refs — feeds existing replay/retry), buyer-state journey, and a **recommended next drill** mapped to the same rule table the Command Centre uses (weakest dimension → drill title). Persisted to `sparring_sessions.summary` (existing column) as structured JSON.

## Assignment-linked sparring flow (mostly shipped)

Manager assigns (`type='sparring'`, `meta.sparring_context`) → rep opens from assignments (`sparringHref()` exists) → session created with `assignmentId` → completion auto-completes the assignment (`completeAssignmentsForTarget`, exists) → Command Centre tracking updates (Sprint 4). Tier 2A adds: persist `assignment_id` on the session row + `GET /v1/sparring/assignments/:assignmentId/session` for direct lookup.

## Manager visibility flow

- `GET /v1/manager/sparring-sessions` in `src/routes/manager.ts` — Sprint 4 dual pattern (requireManager + getUserContext/applyHierarchyFilters), returns recent sessions with rep, persona, difficulty, score, weak dimensions, assignment linkage.
- `/coaching`: sparring completions appear in the Assignments tab already; add a compact "Recent Sparring" card later (web work scheduled after API lands).
- Audit events: `sparring.session_completed` (fail-soft, existing `logAuditEvent`).

## API endpoints proposed

| Endpoint | Status |
|---|---|
| `POST /v1/sparring/sessions` | exists — extend (persist assignment/tenant/state) |
| `GET /v1/sparring/sessions/:id` | exists — extend (return state) |
| `POST /v1/sparring/sessions/:id/messages` | alias of existing `/turns`, routed through the Brain |
| `POST /v1/sparring/sessions/:id/complete` | new (wraps existing `/score` finalisation) |
| `GET /v1/sparring/assignments/:assignmentId/session` | new, small |
| `GET /v1/manager/sparring-sessions` | new, in `manager.ts` |

## Failure / fallback strategy

- Provider error → next provider → deterministic stub; never 500 the turn
- Missing tables/columns → fail-soft warnings (existing house pattern)
- State corruption → rebuild from turn history (state is derivable)
- LLM summary failure → heuristic-only summary, flagged in meta

## Cost-control strategy

Small models on the hot path; `max_tokens` ≤ 200 for replies; history window (last 12 turns + state block, not full transcript); single batched scoring/summary call per session; stub provider for dev/CI; score-cache reuse for identical replays; per-org daily session cap via env (`SPARRING_DAILY_CAP`, soft-enforced).

## Latency target

Buyer reply **p50 < 2.5s, p95 < 5s** (one small-model call + two DB writes). Turn scoring adds no latency (heuristic). Completion call may take up to ~8s (batched scoring + summary) — UI shows a "Generating summary…" state.
