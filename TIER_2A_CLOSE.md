# TIER 2A CLOSE — Sparring Brain

**Tier:** Tier 2A – Sparring Brain (Days 100–108)
**Final status:** Text-first loop complete / Claude pending credits
**Closed:** Day 108 (2026-06-12)

## Shipped features

- **Conversation state manager** — `src/sparring/state.ts`: pure, deterministic stage/mood/trust/pressure/objection/repPerformance model; persisted to `meta.state` (+ `state` column post-migration); 28 unit assertions
- **Provider router** — `src/sparring/providers.ts`: `SPARRING_PROVIDER` env, fallback chain, never crashes a turn
- **OpenAI provider** — existing `gpt-4o-mini` call moved behind the interface, behaviour-preserving
- **Claude provider implementation** — `claude-haiku-4-5`, 12-turn windowed history, buyer-only prompting; live-verified to the Anthropic API (blocked only by account credits)
- **Stub fallback** — deterministic replies from persona + `nextBuyerMove`; dev/CI/fallback
- **Meta write fix** — single merged session-meta write per turn; per-turn scores no longer silently dropped
- **Structured turn scoring** — `src/sparring/scoring.ts`: clarity/confidence/objectionHandling/progression + flags + feedback + recommended next move; 24 assertions
- **Session summary + completion** — `src/sparring/summary.ts` + `POST /v1/sparring/sessions/:id/complete`; drill recommendation, weak moments, next best action; 23 assertions
- **Assignment auto-completion** — completion reuses `completeAssignmentsForTarget`; Command Centre Coaching Impact counts sparring automatically
- **Manager sparring visibility** — `GET /v1/manager/sparring-sessions` (requireManager + rep-hierarchy/tenant-column scoping) + Recent Sparring card on `/coaching`
- **Sparring data-model hardening** — `sql/20260612_sparring_data_model_hardening.sql` (applied in dev) + `npm run db:backfill-sparring` (idempotent, dry-run default) + fail-soft schema probe; write paths populate first-class columns
- **Rep-facing summary UX** — Sparring Summary panel on `/sparring/[id]`; survives refresh
- **Sparring E2E test** — `tests/e2e/sparring-summary.spec.ts` (stateful mocks, full rep loop incl. reload persistence)
- **Validation scripts** — `validate-tier-2a-day-100…108` + `validate:sparring-state/scoring/summary`

## Final workflow

Manager assigns sparring → Rep completes sparring → Buyer replies via provider → Turns are scored → Session summary generated → Assignment completed → Rep sees summary → Manager sees result

## Status of the original 16 Tier 2A items

| # | Item | Status |
|---|---|---|
| 1 | Conversation state manager | **Implemented** (Day 101) |
| 2 | Claude/OpenAI orchestration layer | **Implemented** (Days 101–102; per-task provider overrides planned later) |
| 3 | Persona memory system | **Partial** — company persona profiles, objection libraries and `persona_memory` injection existed pre-Tier-2A and feed prompts; session-level structured memory beyond emotional state/objection stack not yet formalised |
| 4 | Claude Integration for Sparring | **Implemented, pending credits** — code live-verified to the API; account needs credits |
| 5 | Objection pressure ramping | **Implemented** (Day 101 pressure rules over the existing mutation/stacked-objection engine) |
| 6 | Difficulty balancing system | **Existing, formalised** — easy/standard/hard/nightmare modifiers predate Tier 2A; legacy "normal" mapped to "standard" |
| 7 | Turn-by-turn scoring | **Implemented** (Day 103, heuristic tier; batched LLM tier planned later) |
| 8 | Session summary | **Implemented** (Day 104, deterministic; LLM polish planned later) |
| 9 | Emotional realism improvements | **Existing** — anger/boredom/trust engine predates Tier 2A; now mapped into buyerMood/state directives |
| 10 | Conversation pacing realism | **Partial** — persona replyLength/pace flags + state directives; explicit pacing rules not yet built |
| 11 | Script + objection loader | **Partial/Existing** — company objection libraries load into prompts; manager-authored objection-set table planned (Day 100 data plan) |
| 12 | Assignment-linked sparring | **Implemented** (existing linkage + Day 104 completion + Day 106 columns) |
| 13 | Persona templates | **Existing** — `personas.ts` presets (price-sensitive, sceptical, etc.) predate Tier 2A |
| 14 | Session persistence | **Implemented** (existing tables + Day 106 hardening + summary/turn-score persistence) |
| 15 | Rep retry mode | **Existing** — replay endpoints predate Tier 2A; Day 104 weak moments now feed them |
| 16 | Manager review of sparring | **Implemented** (Day 105) |

## Known caveats

- **Anthropic credits pending** — `SPARRING_PROVIDER=claude` falls back to stub/openai until the account is topped up; zero code changes needed after
- Some **legacy sparring sessions lack tenant links** — the backfill correctly skipped 60 unsafe rows; rep-hierarchy fallback scoping covers them; new sessions carry full columns
- **Typecheck baselines** are pre-existing: API ~70, web ~186
- **outDir fix shipped** (Day 108): `tsc` now emits to `dist/` (gitignored); `npm run build` still fails on baseline TS errors but no longer pollutes `src/`. Legacy committed `src/**/*.js` artefacts (calls.js, pins.js, …) predate this and are left untouched — flagged for a future cleanup day
- Two pre-existing runtime crashes were found and fixed during the tier (turns endpoint `evaluateRepWeakness`, `/sparring/[id]` TDZ) — sparring had been broken at the Sprint-4 checkpoint

## Next recommendation

**Day 109:** Tier 2A final QA + tag (`tier-2a-complete` or `sprint-day-109-complete` in both repos) after a demo rehearsal of both loops. **Do not start Tier 2B (Deepgram / Live Whisperer) until Tier 2A is tagged and stable.** If Anthropic credits arrive first, run the five-minute Claude side-by-side and flip dev to `SPARRING_PROVIDER=claude` before tagging.
