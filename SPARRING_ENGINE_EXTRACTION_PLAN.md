# Sparring Engine Extraction Plan (Phase 1 — Prospect Brain)

Companion to `GRAVIX_AI_CORE_ARCHITECTURE.md`. This plan governs the first
extraction step of Phase 1: pulling the **Prospect Brain** (the buyer-utterance
model call) out of the `sparring.ts` monolith and behind a Gravix `Brain`
interface, so the conversation loop stays Gravix-owned and the provider is
configuration.

**Core principle:** AI models power the experience. Gravix controls the
experience. No provider owns the turn loop.

Repo: `~/Dev/gravix-sales-trainer-api` (API-first). This doc lives in WEB only
because that is where the architecture/plan docs sit; no WEB UI changes.

---

## 1. Current state (pre-Day-258)

The buyer brain was **already partially extracted** at Tier 2A Day 101–102 into
`src/sparring/providers.ts`:

- `SparringProvider` interface + `openai` / `claude` / `stub` providers.
- `generateBuyerReply()` orchestrator with a fallback chain and latency capture.
- `resolveProviderName()` reading `SPARRING_PROVIDER` (default `openai`).
- `withStateDirectives()` — appends the rules-engine state summary to the prompt.

Day 258 **formalises** this into the AI Core `Brain` module named in the
architecture (`src/lib/sparringBrain/`), gives it the canonical
`generateProspectReply(input): Promise<BrainResult>` contract with richer
provenance (provider, model, latency, fallback, usage), and leaves the existing
`src/sparring/providers.ts` as a thin compatibility shim so nothing upstream
changes. **No behaviour change; OpenAI stays the default.**

### `sparring.ts` regions (3,988 lines)

| Region | Lines (approx) | Responsibility | Phase-1 disposition |
|---|---|---|---|
| Imports + Supabase/OpenAI clients | 1–37 | wiring | keep |
| Scoring + XP helpers | 39–~700 | per-turn / session scoring | **stays monolithic** (no scoring change) |
| Session CRUD routes | ~700–2700 | create/list/load sessions | stays monolithic |
| **Turn handler `POST /:id/turns`** | ~2700–3400 | orchestrates a turn | stays; brain call swapped |
| ├─ Persona / difficulty / mode resolve | 2795–2807 | persona brief | stays (Persona Engine, future) |
| ├─ Emotional state + objection stacking | 2812–2879 | State/Emotion/Objection | stays (rules engines) |
| ├─ Auto hang-up decision | 2873–2927 | Difficulty/State | stays |
| ├─ Persona system-prompt build | 2941–2981 | prompt assembly | stays (Persona Engine) |
| ├─ **Brain call** `generateBuyerReply(...)` | 2983–2999 | model utterance | **extracted → `Brain`** |
| ├─ Persist turns + micro-score | 3002–3400 | scoring/state persist | stays (no scoring change) |
| End-of-session summary route | ~3400–3964 | summary | stays |
| `POST /analyse-turn` classifier | 3966–3986 | ad-hoc `gpt-4o-mini` label | **out of scope** (not the brain, not scoring runtime) |
| `openai` client (line 35) | 35–37 | used only by `/analyse-turn` now | keep until that route is engined later |

Only the **Brain call** at lines 2983–2999 is touched this day. Everything else
is unchanged.

---

## 2. Target engine modules (AI Core `Brain`)

New canonical module — the `Brain` interface from architecture §5:

```
src/lib/sparringBrain/
  types.ts        # ProspectBrainInput, BrainResult, BrainProvider, BrainProviderName
  openaiBrain.ts  # OpenAI provider (faithful move of the Day-101 inline call)
  claudeBrain.ts  # Claude provider (skeleton live since Day 102; not default yet)
  stubBrain.ts    # deterministic, no LLM — CI/fallback
  index.ts        # resolveBrainProvider() + generateProspectReply() orchestration
```

`generateProspectReply(input): Promise<BrainResult>` where:

- **input:** `systemPrompt` (fully assembled by the route), `history`
  (messages), plus optional `state` / `personaId` / `difficulty` /
  `providerOverride` for future context.
- **result:** `text`, `provider`, `model`, `latencyMs`, `fallbackUsed`, `ok`,
  optional `usage` (token counts when the SDK returns them). Provenance travels
  with the output (architecture §5.6).

The provider is selected by config: `SPARRING_BRAIN_PROVIDER=openai|claude|stub`
(canonical), falling back to the legacy `SPARRING_PROVIDER`, **default
`openai`**. Invalid values resolve to `openai` (matches existing safety
convention). A configured-provider failure degrades down the chain to the
deterministic `stub`, never throwing (architecture §5.5).

---

## 3. What is extracted **today** (Day 258)

- The buyer/prospect model call, faithfully, behind the `Brain` interface.
- OpenAI (default), Claude (skeleton, not default), and stub providers.
- The `SPARRING_BRAIN_PROVIDER` resolver with legacy-env + default-openai safety.
- A validator (`validate:sparring-brain-provider`) proving default/stub/invalid
  behaviour, deterministic stub, response-shape stability, and the absence of
  voice/scoring/schema changes.

Model, temperature, token caps, fallback text and the fallback chain are copied
**exactly** from `src/sparring/providers.ts`. No prompt-quality rewrite.

## 4. What remains monolithic (deferred)

- The turn loop / Orchestrator in `sparring.ts` (`POST /:id/turns`).
- Persona system-prompt assembly, Emotion, Difficulty, Objection stacking,
  auto-hang-up — the rules engines that shape the prompt and own state.
- All scoring (per-turn micro-score, structured score, session summary).
- The `/analyse-turn` classifier and its `openai` client.
- DB schema and the sparring response shape.
- Switching the default brain to Claude Sonnet (architecture Phase-1 exit) — a
  later day, once parity is proven. Today OpenAI stays default.

## 5. Rollback plan

- Backup branch `backup-pre-day258-api` at `2451edf` (pre-work HEAD).
- The change is additive + a shim: the new module is standalone, and
  `src/sparring/providers.ts` keeps its exact public surface
  (`generateBuyerReply`, `BuyerReplyResult`, `resolveProviderName`,
  `withStateDirectives`), so the route and the Day-101 validator are untouched.
- Revert = `git checkout backup-pre-day258-api -- src/routes/sparring.ts
  src/sparring/providers.ts` and delete `src/lib/sparringBrain/`, or reset the
  feature commit. No migration, no data change, so rollback is code-only and
  instant.

---

## 6. Day 259 — Claude live parity proof

Smoke/parity proof that the Brain interface drives a real buyer turn through
each available provider on one realistic UFC sparring input (gym-owner buyer,
price + trust concerns, difficulty `hard`, medium-low trust, rep line: *"We help
managers see exactly why reps lose deals, not just give a generic AI score."*).
Script: `scripts/validate-sparring-brain-claude-parity-day-259.ts`
(`npm run validate:sparring-brain-claude-parity`). **Not a quality ranking, not a
default flip.**

**Providers run/skipped (this environment):**

| Provider | Result | Model | Latency | Rubric |
|---|---|---|---|---|
| openai | **RAN** | `gpt-4o-mini` | ~1.0–2.1s | buyer_voice ✓ · persona ✓ · objection ✓ · concise ✓ · no_meta ✓ |
| claude | **UNAVAILABLE** | — | — | key valid, but Anthropic account **credit balance too low** (HTTP 400) |
| stub | **RAN** | `gravix-stub-buyer` | ~0ms | all ✓ (deterministic) |

- **OpenAI** produced an in-voice sceptical buyer reply ("…how do you ensure the
  insights are actually relevant for my team? … generic advice…") — softens then
  pushes back, no instant agreement, no meta/assistant language, concise.
- **Claude** could not run: the API **key is present and the wiring is correct**,
  but the account has no credit. This is an external billing blocker, **not** a
  Brain-interface defect. The proof verifies the router **degrades gracefully to
  the deterministic stub** on this failure (no crash, non-empty buyer line) —
  exactly the architecture §5.5 fallback contract.
- **Stub** deterministic, instant, in-voice — the safe floor.

**Latency range:** 0–~2100ms across the live providers (stub ~0ms, OpenAI
~1–2s). Claude latency not measured (unavailable).

**Verdict:**
- **Claude is safe to keep behind the flag.** The provider is correctly wired and
  the router fails safe when Claude cannot bill. It is **not proven on live
  output** yet — that needs Anthropic credit. Do **not** flip the default until a
  Claude turn actually runs and passes the same gates as OpenAI.
- **Default remains OpenAI.** No behaviour change shipped on Day 259.

**Blocker for a full Claude parity run:** top up / enable Anthropic API credit,
then re-run `validate:sparring-brain-claude-parity` — Claude should move from
UNAVAILABLE to RAN and clear the same hard gates.
