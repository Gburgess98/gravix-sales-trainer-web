# Gravix AI Core Architecture (Day 257)

Status: **Architecture specification.** Docs-first — no runtime change lands with
this document. It defines the internal architecture the sparring/scoring rebuild
must follow so Gravix stays an orchestration platform, not a wrapper around one
AI vendor.

## 0. Core principle

> **AI models power the experience. Gravix controls the experience.**

Models are swappable suppliers of four capabilities — realtime audio transport,
speech-to-text, a prospect "brain", and speech synthesis — plus a scoring/coaching
judge. Everything that makes Gravix a coaching product (persona, conversation
state, behaviour, emotion, objections, difficulty, memory, scoring evidence,
coaching loop, manager intelligence) is **Gravix-owned code and Gravix-owned
data**. No core logic lives inside a provider's realtime agent.

**Hard rule:** we do **not** build on OpenAI Realtime, Retell, or Vapi as the
orchestrator. Those are provider-locked agents that own the conversation loop; we
would be renting our own product. We assemble the loop ourselves from
best-of-breed, individually swappable components.

## 1. Locked stack (Day 257)

| Layer | Choice (now) | Benchmark later | Notes |
|---|---|---|---|
| Frontend | Next.js (App Router) | — | existing WEB app |
| Realtime audio | **LiveKit** | — | transport only; not an agent framework |
| STT | **Deepgram** | — | streaming transcription; already used by the Whisperer lane |
| Prospect brain | **Claude Sonnet** (prompt caching) | — | replaces today's `gpt-4o-mini` sparring brain |
| Voice output | **ElevenLabs** (first) | Cartesia, Hume EVI, Rime | swappable behind a TTS interface |
| Scoring / coaching | **GPT-4o-mini** | — | already the scoring model (`AI_MODEL`) |
| DB | Postgres (Supabase) | — | existing platform |
| Vector memory | **pgvector** | — | `src/lib/embeddings.ts`, `text-embedding-3-small` |
| Backend | Node / Express | — | existing API |
| Storage / auth / admin | existing Supabase / Gravix platform | — | unchanged |

Provider choices are configuration behind interfaces (§7). The engine boundaries
below never change when a provider is swapped.

## 2. What already exists (grounding — this is a formalisation, not a greenfield)

This spec renames and hardens machinery that is largely already in the codebase.
Prior audits (`TIER_2A_SPARRING_BRAIN_AUDIT.md`, `TIER_2A_ARCHITECTURE.md`,
`TIER_2B_ARCHITECTURE.md`) reached the same conclusion for the sparring layer.

| Engine (this doc) | Exists today as | Location |
|---|---|---|
| Conversation Orchestrator | the monolithic turn handler | `api/src/routes/sparring.ts` (~3,988 lines) |
| Persona Engine | `PERSONAS` config + behaviour/difficulty types | `api/src/personas.ts` |
| State Engine | implicit per-turn state in the route + `sparring_turns` | `api/src/routes/sparring.ts`, `sparring_sessions`/`sparring_turns` |
| Behaviour Engine | `PersonaBehaviour` (tone/pace/objection freq/interruption/patience) | `api/src/personas.ts` |
| Emotion Engine | `EmotionalState` + `getInitialEmotionalState` + mutation state | `api/src/routes/sparring.ts` |
| Objection Engine | Objection Library (Days 236–255) | `api/src/routes/intelligenceObjections.ts`, `objection_library_items` |
| Difficulty Engine | per-difficulty modifiers + adaptive difficulty | `api/src/personas.ts`, `api/src/routes/sparring.ts` |
| Memory Engine | `rep_memory` + knowledge embeddings (pgvector) | `api/src/lib/embeddings.ts`, `rep_memory` table |
| Coaching Engine | scoring runtime + Context/Scorecard resolution + provenance `_meta` | `api/src/lib/scoring.ts`, `api/src/lib/intelligenceRuntime.ts` |
| Manager Intelligence | assignments engine + manager list/trust/signals | `api/src/routes/assignments.ts`, `assignments` table |

The rebuild's job: **extract these into named modules with explicit contracts**,
swap the prospect brain to Claude Sonnet behind a provider router, and add the
voice pipeline — without collapsing any logic into a provider agent.

## 3. The engines

Ten engines. The **Conversation Orchestrator** is the spine; the other nine are
called by it (or by the Coaching/Manager surfaces). Every engine has a stable
input/output contract so its internals — and any model it uses — can change
without touching its callers.

For each engine: **purpose · input · output · DB fields · runtime responsibility ·
model/provider it may use · what must stay Gravix-owned.**

### 3.1 Conversation Orchestrator

- **Purpose:** own the turn loop. Assemble every other engine's output into one
  prospect turn, persist state, and hand transcripts to scoring. The single place
  that "runs the conversation".
- **Input:** session id, rep utterance (text now; STT transcript in voice mode),
  current session state.
- **Output:** prospect turn (text → TTS in voice mode), updated state snapshot,
  per-turn score signal.
- **DB fields:** `sparring_sessions` (persona_id, difficulty, mode, assignment_id,
  status, meta), `sparring_turns` (session_id, role, content, turn_score,
  state_snapshot, created_at).
- **Runtime responsibility:** orchestration only — no model reasoning of its own.
  Calls State → Behaviour → Emotion → Difficulty → Objection to build the brief,
  calls the Persona/brain provider for the utterance, calls per-turn scoring,
  persists.
- **Model/provider:** none directly. It *invokes* the brain provider (Claude
  Sonnet) via the router.
- **Gravix-owned:** the entire loop, ordering, state persistence, prompt
  assembly, windowing, fallbacks. **This must never be a provider's agent loop.**

### 3.2 Persona Engine

- **Purpose:** define *who* the prospect is — identity, traits, baseline
  behaviour, allowed modes.
- **Input:** persona_id, company persona overrides, scenario (later, from the
  Scenario Engine spec).
- **Output:** resolved persona config (identity + behaviour baseline + difficulty
  defaults).
- **DB fields:** static `PERSONAS` config today; future `company_personas`
  (company_id, base_persona_id, overrides jsonb) and scenario linkage.
- **Runtime responsibility:** resolve the persona for a session and expose its
  baseline to Behaviour/Emotion/Difficulty.
- **Model/provider:** none (pure config/data).
- **Gravix-owned:** the persona taxonomy, traits, and the fact that personas are
  *authored*, never provider defaults.

### 3.3 State Engine

- **Purpose:** track *where the conversation is* — stage (intro/discovery/
  objection/close), trust, pressure, active objection, patience remaining,
  whether the buyer is checking out.
- **Input:** previous state, rep utterance, per-turn score signal.
- **Output:** new state snapshot (deterministic function of previous state + turn).
- **DB fields:** `sparring_turns.state_snapshot` (jsonb per turn);
  `sparring_sessions.meta` for running counters (e.g. `last_turn_score`, streak).
- **Runtime responsibility:** the deterministic state machine. No LLM call; state
  transitions are Gravix rules so they are testable and reproducible.
- **Model/provider:** none. (A model may *read* state; it may not *own* it.)
- **Gravix-owned:** all transition rules. State is the product's memory of the
  live conversation and must be inspectable.

### 3.4 Behaviour Engine

- **Purpose:** turn persona + state into *how the buyer speaks this turn* — reply
  length, pace, interruption, objection frequency, directness — as directives for
  the brain prompt.
- **Input:** resolved persona behaviour, current state, difficulty modifiers.
- **Output:** behaviour directives (structured) injected into the brain prompt.
- **DB fields:** none of its own; reads `personas` config + state.
- **Runtime responsibility:** deterministic mapping to prompt directives; keeps
  the brain on-character rather than trusting the model to self-regulate tone.
- **Model/provider:** none directly (shapes the brain's prompt).
- **Gravix-owned:** the behavioural vocabulary and the directive contract. The
  model renders words; Gravix decides the behaviour.

### 3.5 Emotion Engine

- **Purpose:** model the buyer's shifting mood — anger, boredom, scepticism,
  interest — and how the rep's handling moves it.
- **Input:** initial emotional state (persona + difficulty), rep utterance
  quality (per-turn score), volatility/resistance/unpredictability.
- **Output:** updated emotional state → colours behaviour directives and hangup
  risk.
- **DB fields:** `sparring_turns.state_snapshot.emotion` (jsonb);
  `sparring_sessions.meta` for volatility params.
- **Runtime responsibility:** deterministic emotional dynamics (already present as
  `EmotionalState` + mutation state). Model may *express* emotion; Gravix decides
  the *level*.
- **Model/provider:** none directly.
- **Gravix-owned:** the emotion model and its dynamics — the difference between a
  coaching sim and a chatbot that is always agreeable.

### 3.6 Objection Engine

- **Purpose:** decide *which objection the buyer raises and how hard*, and (in
  scoring) judge how the rep handled it — grounded in the approved Objection
  Library, not improvised by the model.
- **Input:** company Objection Library items (approved), current stage/state,
  scenario focus (later), rep utterance.
- **Output (runtime):** the objection to raise + approved-response expectations
  for the brain and the judge.
- **DB fields:** `objection_library_items` (label, category, buyer_phrases,
  approved_response, weak_response_patterns, no_go_language, coaching_note),
  `objection_evidence`.
- **Runtime responsibility:** select/sequence objections from the library and
  supply the judge with the *approved* handling so scoring is criteria-based, not
  vibes.
- **Model/provider:** the brain renders the objection in-character; the judge
  (GPT-4o-mini) evaluates against library guidance.
- **Gravix-owned:** the objection catalogue, approved responses, and the mapping
  from objection → scoring criteria. Objections are manager-approved content.

### 3.7 Difficulty Engine

- **Purpose:** scale challenge — easy/normal/hard/nightmare — and adapt to the
  rep over time so practice stays at the edge of ability.
- **Input:** chosen difficulty, rep history (`rep_memory` — recent scores per
  stage), assignment context.
- **Output:** difficulty modifiers applied to Behaviour/Emotion/Objection
  (objection frequency, patience, price pressure, hangup multiplier, volatility
  boost).
- **DB fields:** `personas` difficulty modifiers; `rep_memory` (stage attempts /
  scores) for adaptive selection; `sparring_sessions.difficulty`.
- **Runtime responsibility:** deterministic modifier application + adaptive
  next-difficulty selection (already present).
- **Model/provider:** none.
- **Gravix-owned:** the difficulty curve and adaptation policy — a core part of
  the coaching value, never a model temperature knob.

### 3.8 Memory Engine

- **Purpose:** give the system durable memory — what a rep struggles with, company
  playbook knowledge, prior calls — retrievable by semantic similarity.
- **Input:** rep_id/company_id, stage, query text; writes from completed sessions
  and calls.
- **Output:** ranked knowledge/memory snippets for prompt context; rolling rep
  weakness signals for Difficulty/Coaching.
- **DB fields:** `rep_memory` (per-rep stage memory); knowledge embeddings table
  (company_id, user_id, source_type ∈ {company_playbook, rep_memory, call,
  manual_note}, stage, content, embedding vector) via pgvector.
- **Runtime responsibility:** embed + retrieve (pgvector) and maintain rep
  weakness rollups. Retrieval is Gravix-controlled; only the embedding call is a
  provider (currently `text-embedding-3-small`).
- **Model/provider:** embeddings provider (swappable). Retrieval/ranking is Gravix
  code.
- **Gravix-owned:** what is stored, retention, scoping (company/rep isolation), and
  ranking. Memory never leaks across tenants.

### 3.9 Coaching Engine (scoring + feedback)

- **Purpose:** score a call/session with **explainable, criteria-level evidence**
  against the company's active scorecard and published context, and produce
  coaching output the manager can act on.
- **Input:** transcript, resolved active scorecard + published context
  (Intelligence Layer), objection expectations.
- **Output:** stage scores + overall, per-criterion evidence, summary, moments,
  suggestions, and provenance `_meta` (which scorecard/context version applied).
- **DB fields:** `calls.rubric` / `call_scores` (stages, criteria, `_meta`),
  `score_cache` (deterministic cache keyed on transcript+versions), plus the
  Intelligence tables (`company_context`, `scorecards`, `scorecard_versions`,
  `scorecard_criteria`, `scorecard_stage_weights`).
- **Runtime responsibility:** resolve context+scorecard, build the judging prompt,
  call the judge, validate/normalise the structured result, stamp provenance,
  cache. Heuristic fallback when the model is unreachable (never a wrong-but-silent
  score). This is Days 218–224 already live.
- **Model/provider:** **GPT-4o-mini** (judge). The rubric, criteria, evidence
  contract, and provenance are Gravix's.
- **Gravix-owned:** the scorecard model, the requirement for per-criterion
  evidence, the provenance stamp, and the cache. **Scoring is never opaque.**

### 3.10 Manager Intelligence

- **Purpose:** turn scored sessions/calls into manager action — assignments,
  completion/trust signals, objection→coaching loop, and (later) trends.
- **Input:** assignments + scored sessions/calls, hierarchy scope.
- **Output:** manager surfaces — assignment queue, completion/trust signals,
  per-objection assignment activity (Day 255), stale-rep signals.
- **DB fields:** `assignments` (rep_id, manager_id, type, title, status, due_at,
  source, meta incl. `objection_item_id`), `crm_activities` (drill memory),
  `xp_events`.
- **Runtime responsibility:** company-/hierarchy-scoped reads and the coaching
  loop wiring (objection → assign → activity). Already partially live
  (Days 254–255).
- **Model/provider:** none (aggregation). May later summarise trends with the
  judge model, always over real data.
- **Gravix-owned:** scoping, the assignment lifecycle, and the rule that manager
  numbers come from real scored sessions — never projected.

## 4. Data flow (one voice turn, target architecture)

```
rep speaks
  → LiveKit (audio transport)
  → Deepgram (STT) ─────────────► rep utterance (text)
  → Conversation Orchestrator
       ├─ State Engine        update stage/trust/pressure/objection
       ├─ Difficulty Engine   apply modifiers (persona history-aware)
       ├─ Behaviour Engine    tone/pace/length directives
       ├─ Emotion Engine      mood shift + hangup risk
       ├─ Objection Engine    pick objection + approved-response expectations
       ├─ Memory Engine       retrieve company/rep knowledge (pgvector)
       └─ Persona brief ──────► Brain provider (Claude Sonnet, prompt-cached)
  → prospect utterance (text)
  → ElevenLabs (TTS) ─────────► audio back over LiveKit
  → persist turn + state snapshot + per-turn score
on session end
  → Coaching Engine (GPT-4o-mini) score vs active scorecard + published context
  → provenance _meta + evidence + summary → calls/call_scores + score_cache
  → Manager Intelligence: auto-complete assignment, XP, surfaces
```

Text mode (Phase 1) is the same graph with LiveKit/Deepgram/ElevenLabs removed:
rep types → Orchestrator → Claude Sonnet → text back.

## 5. Provider-swap rules

1. **Every provider sits behind a Gravix interface**, one per capability:
   `AudioTransport` (LiveKit), `SpeechToText` (Deepgram), `Brain` (Claude Sonnet |
   OpenAI | stub), `TextToSpeech` (ElevenLabs | Cartesia | Hume | Rime),
   `Judge` (GPT-4o-mini), `Embeddings` (text-embedding-3-small).
2. **Selection is configuration** (env / company setting), never a code branch in
   an engine. A swap changes a factory, not an engine.
3. **The engine contracts are the invariant.** A new TTS vendor must satisfy the
   `TextToSpeech` interface and nothing upstream changes.
4. **No provider owns the loop.** We never adopt a realtime "agent" that hides the
   turn cycle. If a provider only offers an agent framework, we use its transport
   or model endpoints, not its orchestrator.
5. **Fallbacks are first-class.** Brain and Judge both have a Gravix fallback
   (stub reply / heuristic score) so a provider outage degrades, never breaks.
6. **Provenance travels with output.** Scores stamp the judge model + scorecard/
   context versions; sessions record the brain model. A swap is auditable.
7. **Prompt caching is a provider optimisation, not a dependency.** Claude prompt
   caching cuts cost/latency; the prompt is assembled by Gravix and works without
   it.

## 6. Build phases

Text brain first, voice later — the brain must be strong before we spend on audio.

- **Phase 1 — Text sparring on Claude Sonnet.** Extract the engines from
  `sparring.ts` into modules; put the brain behind the `Brain` router and switch
  the default to Claude Sonnet (keep OpenAI + stub as fallbacks). Persona, State,
  Behaviour live and explicit. Basic per-turn + end-of-session scoring (Coaching
  Engine already exists). **Exit:** a text sparring session runs end-to-end on
  Claude with inspectable state and a scored summary.
- **Phase 2 — Voice pipeline.** LiveKit transport + Deepgram STT + ElevenLabs TTS
  wrapped in the transport/STT/TTS interfaces. Same Orchestrator; voice is I/O
  only. **Exit:** a spoken sparring turn round-trips with no engine change.
- **Phase 3 — Emotion / Objection / Difficulty / Memory hardening.** Formalise the
  Emotion and Difficulty engines as modules; wire the Objection Engine to the live
  Objection Library (approved objections drive the buyer + the judge); connect the
  Memory Engine (pgvector retrieval into prompts, rep weakness rollups feeding
  Difficulty). **Exit:** objections come from the library, difficulty adapts to
  rep memory, mood shifts are rule-driven.
- **Phase 4 — Manager loop.** Assignments ↔ sparring proof, replay drills, XP,
  leaderboard, per-objection activity/trend (extends Days 254–255). **Exit:** a
  manager assigns from an objection, the rep drills it, completion + score land on
  the manager surfaces.
- **Phase 5 — Voice provider benchmark.** Swap ElevenLabs for Cartesia / Hume EVI
  / Rime behind the `TextToSpeech` interface and compare latency/quality/cost. No
  engine changes — the phase exists to prove the swap rule.

Phases 1 and 3 are mostly *refactor + wire existing pieces*; Phase 2 and 5 are the
genuinely new (voice) work.

## 7. Current stack vs future swaps (summary)

- **Now:** Next.js · (text only) · Claude Sonnet brain (Phase 1 target; OpenAI
  today) · GPT-4o-mini judge · pgvector/text-embedding-3-small · Postgres/Supabase
  · Node/Express.
- **Phase 2 adds:** LiveKit · Deepgram · ElevenLabs.
- **Swappable later:** TTS (Cartesia/Hume/Rime), and in principle brain, judge, and
  embeddings — each behind its interface. Transport/STT are stickier but still
  interfaced.

## 8. Kendo parity requirements

The bar the product must clear (Kendo-class coaching, not a demo bot). Each maps to
an engine and to code that already exists or is planned.

| Requirement | How Gravix meets it | Status |
|---|---|---|
| **Explainable scoring** | Coaching Engine stamps provenance `_meta` (scorecard + context version, judge model) on every score | Live (Days 221–223) |
| **Criteria-level evidence** | Scorecard criteria + per-criterion evidence in the rubric; not just a number | Live (Scorecard Studio + scoring) |
| **Manager actionability** | Manager Intelligence: assignments, trust/completion signals, objection→coaching loop | Live/partial (Days 254–255) |
| **Custom scorecards** | Scorecard Studio (draft→active, immutable snapshot, company default) | Live (Days 219–220) |
| **Objection handling** | Objection Library drives buyer objections + judge expectations | Data live (Days 236–255); runtime wiring Phase 3 |
| **Rep coaching loop** | Assign from objection → sparring drill → completion proof → activity | Partial (Days 254–255); closes in Phase 4 |
| **Trend tracking** | Stage-score trends per rep/objection from real scored sessions | Planned (Phase 4) — real data only, never projected |

Parity is a **product** property enforced by Gravix-owned engines; no single model
provides it.

## 9. Do not build

Explicit non-goals. Each is a way the product would decay into a commodity bot.

- **A generic AI voice bot.** If the differentiator is "it talks", we have built
  nothing defensible. The differentiator is the coaching orchestration.
- **A provider-locked realtime agent.** No OpenAI Realtime / Retell / Vapi owning
  the loop. We assemble the loop; providers supply capabilities.
- **Opaque scoring.** No score without a visible reason. Every score carries
  scorecard/context provenance and a model stamp.
- **Scoring without evidence.** No number without per-criterion evidence a manager
  can read and act on. A bare 62/100 is a bug, not a score.
- **Voice before the text brain is strong.** No spend on LiveKit/Deepgram/
  ElevenLabs until Phase 1's text brain (persona/state/behaviour + scored
  summary) is solid. Audio on a weak brain is a louder weak brain.

## 10. References

- Sparring audit + prior architecture: `TIER_2A_SPARRING_BRAIN_AUDIT.md`,
  `TIER_2A_ARCHITECTURE.md`, `TIER_2B_ARCHITECTURE.md`.
- Scenario Engine (objection-specific drills): `SPARRING_SCENARIO_ENGINE_SPEC.md`.
- Intelligence Layer (Context + Scorecard + Objection + runtime provenance):
  `INTELLIGENCE_LAYER_BLUEPRINT.md`, `CONTEXT_ENGINE_SPEC.md`,
  `OBJECTION_LIBRARY_BLUEPRINT.md`, `OBJECTION_TO_ASSIGNMENT_FLOW.md`.
- Live code anchors (API): `src/routes/sparring.ts`, `src/personas.ts`,
  `src/lib/scoring.ts`, `src/lib/intelligenceRuntime.ts`, `src/lib/embeddings.ts`,
  `src/routes/assignments.ts`, `src/routes/intelligenceObjections.ts`.
- **Provider config & cost-safety (operational):** `AI_PROVIDER_CONFIG.md` (API
  repo) — Claude app vs Anthropic **Console API** billing separation, the env
  matrix (product / no-cost QA / future Claude trial), and what is implemented vs
  future. OpenAI is the safe default today; Claude is behind
  `SPARRING_BRAIN_PROVIDER=claude` until live parity + Console credit are proven.
  Guarded by `npm run validate:ai-provider-config`.
