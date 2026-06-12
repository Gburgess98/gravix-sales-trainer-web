# TIER 2B — LIVE WHISPERER ARCHITECTURE (Day 110)

Transcript-first. No ElevenLabs (2C), no audio scoring (2D), no voice synthesis.

## Target architecture

```
browser mic (getUserMedia)
  → Deepgram realtime WS (short-lived token or server relay)
  → transcript segments arrive in browser
  → POST /v1/whisperer/sessions/:id/segments   (batched, fire-and-forget)
  → trigger engine (deterministic, server-side, shared module src/whisperer/)
  → triggers + template suggestions returned in the segment response
  → sidebar renders transcript + suggestion cards (<50ms)
  → latency stamped at each hop; logged async
  → session end → durable log → manager view → (later) pins into call review timeline
```

**Build order (locked):** 1 transcript loop (stubbed text first) → 2 trigger detection → 3 sidebar suggestions → 4 logging → 5 latency metrics → 6 review/replay integration. Deepgram joins at step 1's *transport* only after the loop is proven with typed/dev-simulated segments (Day 111 stub → Day 112/113 live).

## Browser mic flow

`getUserMedia({audio})` → `MediaRecorder`/AudioWorklet chunks → Deepgram realtime WebSocket. Mic permission requested only on explicit "Start listening"; visible recording indicator; stop releases tracks. No audio is ever sent to the Gravix API — only text segments.

## Deepgram connection strategy

- **Phase 1 (Day 112):** browser connects directly to Deepgram's WS using a **short-lived scoped token** minted by a new API endpoint (`POST /v1/whisperer/token`, requireAuth, expiry ≤60s). The permanent `DEEPGRAM_API_KEY` never leaves the server.
- Fallback if temporary tokens prove awkward: server relay (browser→API WS→Deepgram). More moving parts and the repo has no WS server today — only adopt if the token route fails.
- Model: `nova-2` (or current nova-class), `interim_results=true`, `smart_format=true`, `endpointing` for utterance boundaries (also gives silence signals for item 6 later).

## Transcript segment lifecycle

1. Deepgram interim/final results arrive in-browser with `start`/`end`/`is_final`.
2. Interim results update the sidebar immediately (display only).
3. **Final segments** are POSTed to the API in small batches (1–3 segments or 2s, whichever first): `{text, speaker?, startMs, endMs, clientCapturedAt}`.
4. API stores the segment, runs the trigger engine, and returns any `triggers[]` in the same response — one round-trip, no push channel needed for MVP.
5. Sidebar merges returned triggers/suggestions next to the transcript rows.

No WebSocket/SSE from API→browser in MVP: the segment POST response carries triggers (simple, stateless, proxy-friendly). Revisit push only if multi-tab/observer views are needed.

## Trigger engine design (`src/whisperer/triggers.ts`, new API module)

- Pure + deterministic, same discipline as Tier 2A's `src/sparring/` modules; unit-scripted.
- **Unifies** the two existing keyword sets: `whisperer.ts` `buildSuggestions` patterns + Tier 2A `inferObjectionType` (price/timing/authority/trust/competitor) + `send_info` and stall phrases.
- Output = the agreed trigger shape (type, phrase, confidence 0–100, suggestion, latencyMs).
- Confidence from match specificity (exact phrase > keyword) and segment finality.
- De-duplication: same trigger type suppressed for N seconds (default 30s) per session to avoid spam.
- `silence` trigger (item 6): driven later by Deepgram endpointing/utterance gaps — engine accepts a synthetic `silence` segment type so the contract is ready; **not prioritised before the transcript loop works**.

## Suggestion engine design

- MVP: **rule-based template per trigger type** (UK copy), e.g. price → "Handle price objection" + acknowledge/reframe/binary-question response. Zero latency, zero cost.
- Templates resolved in priority order: custom trigger library (later) → team/company overrides (existing company persona profile pattern) → built-in defaults.
- LLM personalisation is explicitly **off the hot path**; if ever added it runs async and replaces the card in place.

## Sidebar display model

`WhispererPanel` evolves into the live sidebar (its current sparring-preview mode kept behind a prop): transcript stream (interim greyed, final solid), suggestion cards (title, response, urgency colour, emoji), latency chip, Start/Stop listening, session timer. Lives at `/whisperer` (path already reserved in SHELL_PATHS) and is embeddable beside live-call surfaces later.

## Latency tracking design

Timestamps per trigger: `t0 clientCapturedAt` (segment final in browser) → `t1 serverReceivedAt` → `t2 triggerDetectedAt` → `t3 clientRenderedAt`. `latencyMs = t3 − t0` computed client-side and PATCHed onto the trigger log (fire-and-forget). Sidebar shows current/rolling latency; session log stores per-trigger latency + p50/p95 in the session summary. Target ≤1.8s spoken-word→suggestion (the speech→final-segment portion is Deepgram-bound; everything after must stay <100ms).

## Live session logging design

- `POST /v1/whisperer/sessions` (start: rep, optional call/persona linkage, tenant fields stamped at write — Day 106 lesson) → `.../segments` (append) → `.../end` (close: duration, counts, latency stats).
- Triggers + suggestions stored per session with `suggestionOutcome: shown|used|ignored` (item 8: `used` wired later via a click action; schema ready now).
- Audit events: `whisperer.session_started`, `whisperer.session_ended` (fail-soft, existing helper).

## Replay into call review/timeline (architecture only)

When a whisperer session is linked to a call (`call_id`), session end materialises each trigger as a pin-like timeline entry (existing pins table or a typed `crm_activities` row: `type='whisperer_trigger'`, with `start_ms` offsets). `/review/[callId]/timeline` then renders trigger moments alongside existing pins. No build this phase.

## Custom trigger library (architecture only)

`whisperer_trigger_library` table (tenant-scoped: company/office) with `{phrases[], type, suggestion}` rows, manager-managed via a later `/coaching` settings surface. Trigger engine loads the library per session at start (cached), merges with built-ins; custom matches carry `type='custom'` + libraryId. Deferred until the built-in loop is proven.

## Failure/fallback strategy

- Deepgram WS drop → auto-reconnect with backoff; sidebar shows "Reconnecting…"; segments buffered client-side
- Token mint fails → clear error, no key leakage, retry button
- Segment POST fails → client retry queue (idempotent via client-generated segment ids); transcript display unaffected (local)
- Trigger engine errors → segment still stored; fail-soft warnings (house pattern)
- Missing tables → schema-probe fail-soft (Tier 2A `sparringHardeningColumns` pattern) until migration applied

## Security/privacy considerations

- Deepgram key server-side only; short-lived tokens; HTTPS/WSS everywhere
- Sessions tenant-stamped at creation (org/company/office from the rep's users row); manager view uses requireManager + hierarchy scoping (Day 105 template)
- Live transcripts are sensitive: explicit start/stop consent UI, retention note in data model (configurable purge window), no audio stored
- Proxy-only API access from web (fix the existing WhispererPanel localhost-direct hack when touched)

## Cost-control strategy

Deepgram nova streaming ~$0.006/min ≈ $0.36/hour of live calling — negligible per rep. No LLM on the hot path (rule templates). Segment batching keeps API chatter low. Per-org daily session cap env (`WHISPERER_DAILY_CAP`) mirroring the sparring plan. Dev/CI use the segment-POST simulator (no Deepgram spend in tests).

## Latency target plan

| Hop | Budget |
|---|---|
| Speech → Deepgram final segment | ~300–900ms (Deepgram-bound, interim results mask it) |
| Segment POST → API | <100ms (local/regional) |
| Trigger + suggestion (rules) | <5ms |
| Response → render | <50ms |
| **Total (spoken → suggestion)** | **≤1.8s target; ~1.0s typical expected** |

Measured from Day 111 via the latency stamps — with the stub simulator first, so the non-Deepgram portion of the budget is proven before any audio exists.
