# TIER 2B — DAY 111 IMPLEMENTATION PLAN

## First build target

**Transcript-first Whisperer stub** — prove `text segment → trigger detection → suggestion → latency stamp → sidebar display` end-to-end with typed/simulated segments. **No Deepgram, no mic, no WebSockets.** Deepgram joins on Day 112/113 as a transport swap once this loop is green.

## Exact API files

**Create:**
1. `src/whisperer/triggers.ts` — pure trigger engine (Tier 2A `src/sparring/` discipline):
   - `detectTriggers(text, options)` → trigger array in the agreed shape (type, phrase, confidence, suggestion, detectedAt)
   - Unifies the `whisperer.ts` `buildSuggestions` regexes + Tier 2A `inferObjectionType` keywords (price/timing/authority/trust/competitor) + `send_info`/stall phrases
   - `suggestionFor(type)` — UK-copy templates (title, response, urgency, emoji); priority slot for library/team overrides later
   - De-dup window (same type suppressed 30s/session — caller passes recent trigger types)
   - Deterministic; no I/O
2. `src/whisperer/schema.ts` — probe for `whisperer_sessions`/`whisperer_triggers` (copy `sparringHardeningColumns` pattern); fail-soft pre-migration
3. `scripts/validate-whisperer-triggers.ts` — unit assertions ("too expensive" → price + suggestion; "send me info" → send_info; "we already use X" → competitor; neutral text → none; de-dup window; clamps; determinism)
4. `sql/2026xxxx_whisperer_foundation.sql` — `whisperer_sessions` + `whisperer_triggers` per the data model plan (manual Supabase SQL editor workflow; rollback block)

**Edit:**
5. `src/routes/whisperer.ts` — add (keep `/preview` untouched for sparring back-compat):
   - `POST /v1/whisperer/sessions` — create (rep identity via header pattern; tenant stamped from users row; status active; audit event fail-soft)
   - `POST /v1/whisperer/sessions/:id/segments` — accepts `{segments: [{id?, text, speaker?, startMs?, endMs?, clientCapturedAt?}]}`; runs `detectTriggers`; persists triggers (or returns-only pre-migration); **returns `{ok, triggers[], serverReceivedAt, triggerDetectedAt}`** in the same response
   - `GET /v1/whisperer/sessions/:id` — session + recent triggers (ownership check)
   - `POST /v1/whisperer/sessions/:id/end` — close, counts + latency p50/p95 from trigger latencies, audit event
   - `PATCH /v1/whisperer/sessions/:id/triggers/:triggerId` — `{latencyMs}` or `{suggestionOutcome}` (fire-and-forget from client)

## Exact WEB files

**Create:**
6. `src/app/whisperer/page.tsx` — the Live Whisperer page (path already in SHELL_PATHS):
   - "Start session" → POST sessions
   - **Dev simulator composer** (text input, "Speak as prospect") posting segments — the mic stand-in
   - Transcript list + suggestion cards (title/response/urgency colour/emoji) + latency chip (`t3 − t0` client-computed, PATCHed back)
   - "End session" → summary line (segments, triggers, p50 latency)
   - Empty/error states; UK copy ("Listening simulator", "No triggers yet.")

**Edit (only if trivial):**
7. `src/components/Whisperer/WhispererPanel.tsx` — remove the localhost-direct URL hack (use `proxyFetch`); no behaviour change otherwise. Skip if it risks the sparring flow — note instead.

## Minimal endpoint/component for Day 111

The segment POST returning triggers inline is the heart; the page proves it visually. Everything else is supporting structure.

## Test plan

API:
- `npx tsx scripts/validate-whisperer-triggers.ts` — engine assertions
- typecheck: baseline ~70, no new errors
- curl: create session → POST segment "this is too expensive for us" → response contains price trigger + suggestion → POST neutral segment → no trigger → GET session (triggers persisted post-migration, flagged pre-) → end session → counts/latency present
- 403/ownership: another rep's session id rejected
- Sparring regression: `/preview` untouched → `npm run validate-tier-2a-day-108` chain still green

WEB:
- `npm run build`, typecheck baseline 186
- Manual: `/whisperer` → start → type "too expensive" → suggestion card appears with latency chip → end → summary
- Smoke suite still green

## Validation plan

`npm run validate-tier-2b-day-111` checking: `src/whisperer/triggers.ts` + routes exist; trigger shape fields present; web page fetches whisperer sessions/segments; simulator + suggestion copy present; migration file exists; `/preview` intact; trigger unit script passes; Day 110 docs still present.

## Rollback plan

- All additive: revert the Day 111 commit; `/preview` and sparring untouched
- Migration rollback: `drop table if exists whisperer_triggers; drop table if exists whisperer_sessions;`
- Pre-migration the code already runs in fail-soft return-only mode, so the API can deploy ahead of the SQL safely
