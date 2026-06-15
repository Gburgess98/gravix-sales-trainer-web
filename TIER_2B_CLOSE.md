# TIER 2B CLOSE — Live Whisperer

**Tier:** Tier 2B – Live Whisperer (Days 110–116)
**Final status:** Transcript-first Whisperer loop complete. Live Listener built. Deepgram token/auth path validated. Browser-mic end-to-end validation still pending a manual physical-mic test.
**Closed:** Day 116 (2026-06-13)

**Product rule:** Gravix does not own the call. Gravix listens to the call, coaches the rep, scores the session, and trains the team.

## Shipped features

- **Tier 2B audit + architecture** (Day 110) — found only a miniature `/v1/whisperer/preview`; no real-time infra before this tier
- **Whisperer trigger engine** — `src/whisperer/triggers.ts`, deterministic, no LLM; price/timing/send_info/authority/trust/competitor + custom; exact-phrase 90 / keyword 70; rep-speech suppressed; 30s de-dup; 18 unit assertions
- **Migration** — `whisperer_sessions` + `whisperer_triggers` (tenant columns day one), applied in dev
- **`/whisperer` Manual Simulator** — typed segment → trigger → suggestion → latency → logging
- **Session API** — `POST /sessions`, `GET /sessions/:id`, `POST /sessions/:id/segments` (triggers inline), `POST /sessions/:id/end` (p50/p95); owner-scoped; audit events; in-memory fail-soft before migration
- **Deepgram token endpoint** — `POST /v1/whisperer/deepgram-token` (Grant API, 30s TTL); permanent key server-only; controlled `deepgram_not_configured`/`deepgram_token_unsupported`
- **Live Listener UI** — getUserMedia → token → Deepgram WS (token subprotocol) → MediaRecorder 250ms chunks → final-only segments; interim display
- **Reconnect/backoff** — 500/1000/2000ms, no reconnect after intentional stop, fresh token per attempt, cleanup on stop/unmount
- **Latency tracking** — "Last suggestion latency" chip + per-trigger `latency_ms` + session p50/p95
- **Manager Whisperer sessions** — `GET /v1/manager/whisperer-sessions` (requireManager + hierarchy scoping)
- **`/coaching` Whisperer Insights card** — sessions/triggers/top objection/latency, per-rep rows, live/manual source
- **Call-linked replay** — `GET /v1/calls/:id/whisperer-triggers` + `/calls/[id]` "Whisperer Moments" section + `/whisperer?callId=` linkage
- **Validation scripts** — `validate-tier-2b-day-110…116`, `validate-whisperer-triggers`
- **E2E spec** — `tests/e2e/whisperer-flow.spec.ts` (simulator loop, stateful mocks)

## Final workflow

Rep opens /whisperer → starts session → manual/live transcript segment enters Gravix → trigger engine detects objection → suggestion card appears → trigger is logged → manager sees session in /coaching → linked call shows Whisperer Moments in review.

## Status of the original 10 Tier 2B items

| # | Item | Status |
|---|---|---|
| 1 | Realtime STT foundation | **Implemented / Live QA passed** — Day 117 fixed WS auth (`bearer` token); George proved live mic end-to-end (Day 117/118) |
| 2 | Live transcript display | **Implemented** — interim + final segments display live |
| 3 | Trigger detection | **Implemented** — semantic intent classifier (Day 117), not exact phrases |
| 4 | Sidebar suggestions | **Implemented** |
| 5 | Latency monitor | **Implemented** (live ~300ms observed) |
| 6 | Silence > 5s | **Paused** (Deepgram endpointing hook ready, not prioritised) |
| 7 | Custom trigger library | **Planned Day 119** (table designed in data-model plan) |
| 8 | Suggestion quality scoring | **Planned later** (`suggestion_outcome` field ready) |
| 9 | Live session logging | **Implemented** (Day 118: stale-session classification + cleanup) |
| 10 | Replay live trigger moments | **Implemented** (Day 115) |

## Known caveats

- Physical browser-mic end-to-end still needs a manual test (token + transcription auth already proven against Deepgram with a synthetic WAV → HTTP 200).
- Deepgram live spend intentionally limited; live mode optional.
- Speaker diarisation not implemented (live segments assume `prospect`).
- Silence detection paused; custom trigger library and used/ignored scoring are later features.
- Manual SQL (`sql/20260612_whisperer_stub_loop.sql`) must be applied per environment (dev done); code is fail-soft before it.
- Baselines: API typecheck ~70, web typecheck ~186 (both pre-existing, none in Tier 2B files).

## Next recommendation

**Day 117 / next:** either (a) manual live-mic proof + speaker diarisation (`diarize=true`, label rep vs prospect) — do this **after** the tag, once the mic path is exercised; or (b) begin the **Tier 2C Voice Output audit**. Recommended immediate next: live-mic proof + diarisation before any new tier.
