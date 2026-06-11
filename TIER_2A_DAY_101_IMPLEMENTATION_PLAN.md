# TIER 2A — DAY 101 IMPLEMENTATION PLAN

## First build target

**Conversation state manager + provider router skeleton**, wired into the existing turns route with zero behaviour change for users and **zero migrations** (state persists in `sparring_sessions.meta.state`, which exists).

The original "session persistence skeleton" target is already shipped (sessions/turns endpoints and tables exist) — so Day 101 builds the Brain's two core modules instead, against the live engine.

## Exact API files

**Create:**
1. `src/sparring/state.ts` — pure state manager:
   - `initialState(persona, difficulty, assignmentContext)` → the agreed state shape (stage/buyerMood/trustLevel/pressureLevel/objectionState/repPerformance/difficulty/nextBuyerMove)
   - `applyRepTurn(state, text, heuristicScore)` → new state (stage transitions, mood/trust/pressure moves, objection lifecycle, nextBuyerMove selection)
   - Extracts/reuses the existing `EmotionalState` + `PersonaMutationState` logic from `sparring.ts` (import or copy with attribution comment — do not modify the originals yet)
   - No I/O, fully deterministic given a seeded random — unit-testable
2. `src/sparring/providers.ts` — provider router:
   - `SparringProvider` interface (`buyerReply` only on Day 101)
   - `openai` provider: move the existing inline `gpt-4o-mini` call from `/sessions/:id/turns` behind the interface **behaviour-preserving** (same model env, same prompt, same error path)
   - `stub` provider: deterministic reply from persona behaviour + `nextBuyerMove` (no API key needed)
   - Router: `SPARRING_PROVIDER` env (default `openai`), fallback chain → stub. **No Claude call yet** (Day 102, once the seam is proven)
3. `src/sparring/__tests__/state.test.ts` (or `scripts/validate-sparring-state.ts` if no test runner exists — repo has none; use a tsx script): assert stage transitions, pressure ramping by difficulty, objection lifecycle, nextBuyerMove bounds

**Edit:**
4. `src/routes/sparring.ts` — surgical changes only:
   - `POST /sessions`: build `initialState(...)` and store in the session `meta.state`
   - `POST /sessions/:id/turns`: read state from meta → `applyRepTurn` → pass state directives into the (now router-based) buyer reply → save updated state back to `meta.state`; include `state` in the turn response
   - `GET /sessions/:id`: include `state` in the response
   - Add route alias `POST /sessions/:id/messages` → same handler as `/turns`

## Exact WEB files

**None required Day 101** (state is additive in API responses; the 2,850-line sparring page keeps working unchanged). Optional if time allows: show `buyerMood`/`pressureLevel` chips in `src/app/sparring/[id]/page.tsx` — defer to Day 102+ otherwise.

## Minimal endpoint for Day 101

No new endpoints — the `/messages` alias plus state in existing responses. (`/complete`, assignment-session lookup and the manager view follow on Days 102–104.)

## Test plan

API:
- `npx tsx scripts/validate-sparring-state.ts` — unit assertions on the state manager (transitions, ramping, determinism)
- typecheck: baseline 71, no new errors
- curl: create session (dev rep) → POST 3 messages with weak then strong replies → assert `state.pressureLevel` rises then falls, `stage` advances, buyer reply non-empty under both `SPARRING_PROVIDER=openai` and `=stub`
- curl `GET /sessions/:id` → `state` present
- Regression: existing sparring web page still loads a session and exchanges turns (manual)
- Sprint 4 guard: `npm run validate-sprint-4-day-95` (manager surface untouched)

WEB:
- `npm run build`, smoke suite (16/16), full e2e if time allows

## Validation plan

`npm run validate-tier-2a-day-101` checking: `src/sparring/state.ts` + `providers.ts` exist; turns route uses the router (no inline `openai.chat.completions` in the turn handler); state persisted/returned; stub provider present; state unit script passes; Sprint 4 validations still green.

## Rollback plan

- All changes additive + behind the existing routes: `git revert` the Day 101 commit
- No migration to roll back (state in `meta`)
- `SPARRING_PROVIDER=openai` default means provider behaviour is identical to today; emergency switch is one env var (`stub`) if a provider misbehaves
