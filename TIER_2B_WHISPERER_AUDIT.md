# TIER 2B — LIVE WHISPERER AUDIT (Day 110)

**Checkpoint audited:** API `f907275` / WEB `591eca2`, both tagged `sprint-day-109-complete`, clean.

## Headline finding

**A miniature Whisperer already exists — but nothing live.** The API has a single rule-based suggestion endpoint and the web has a suggestion panel wired into sparring; both prove the suggestion UX. There is **zero realtime infrastructure**: no Deepgram, no WebSocket/SSE, no mic capture, no session/segment persistence, no trigger logging. Tier 2B is therefore mostly greenfield on the transport/persistence side, with a ready-made suggestion seed and strong patterns to copy from Sprint 4 / Tier 2A.

## 1. Existing API files

| File | Size | What's in it |
|---|---|---|
| `src/routes/whisperer.ts` | 213 lines | **One endpoint: `POST /v1/whisperer/preview`** — takes `{transcript[], personaId}`, runs rule-based suggestion building (regex for price/"think about it"/"send me info"/pushback per persona) + optional `gpt-4.1-mini` rewrite (fail-soft). **This IS an embryonic trigger engine** — the phrase patterns Tier 2B item 3 asks for already exist here |
| `src/server.ts` (~1900) | — | Batch transcription pipeline: upload → `simulateTranscription` job → OpenAI `gpt-4o-mini-transcribe` (`TRANSCRIBE_MODEL` env) with explicit stub fallback ("Replace with real Whisper/Deepgram later"); segment shape `{speaker, start_sec, end_sec, text}` already defined; job status machine (`setJobStatus`, kinds `transcribe`/`score`) |
| `src/routes/pins.ts` | 152 lines | Per-call pins with ownership — the natural anchor for replaying trigger moments into call review |
| `src/lib/transcript.ts` | 144 lines | `cleanTranscript`/`buildSegments` helpers |

**Not present:** Deepgram SDK, `ws`/`socket.io`/SSE packages, `DEEPGRAM_API_KEY`/STT env vars, whisperer tables, trigger logging, WebSocket/SSE endpoints, silence detection.

## 2. Existing WEB files

| File | Size | Notes |
|---|---|---|
| `src/components/Whisperer/WhispererPanel.tsx` | 203 lines | Takes sparring turns, posts to `/preview`, renders suggestions. ⚠️ Contains a **localhost-direct URL hack** bypassing the proxy in dev — replace with `proxyFetch` |
| `src/app/sparring/[id]/page.tsx` | — | A **second, duplicated** whisperer integration (`whispererHits`, `whispersByTurnId`, `inferWhisperTag`) calling `/preview` directly |
| Navigation | — | `/whisperer` is in `SHELL_PATHS` but no page exists (nav items removed Day 80 as 404s) — a panel home is needed |

**Not present:** `getUserMedia`/`MediaRecorder`, WebSocket/EventSource clients, transcript display UI, latency UI, whisperer e2e tests.

## 3. Existing trigger logic summary

`buildSuggestions()` in `whisperer.ts` detects: price (`price|cost|expensive|budget|roi`), thinking/stall (`think about it|send me info|email me`), pushback (`not interested|happy with|already using`) — keyed by persona. Tier 2A's `inferObjectionType` (`src/sparring/state.ts`) covers price/timing/authority/trust/competitor with richer keyword sets. **The Tier 2B trigger engine should unify these two**, not add a third.

## 4. Audio/mic support summary

None in the browser. Server-side audio handling exists only for **uploaded files** (multer → Supabase storage → batch transcription). Nothing streams.

## 5. Logging/timeline support summary

- `logAuditEvent` → `audit_events` (fail-soft) — reuse for `whisperer.session_started/ended`
- Pins + `/review/[callId]/timeline` pages — replay integration point for trigger moments
- `crm_activities` typed-event pattern — alternative lightweight log sink
- Tier 2A `meta`-first persistence + schema probe pattern — the model for whisperer session storage

## 6. Security/tenant patterns to reuse

- Identity: `x-user-id` via proxy (`getUserIdHeader` pattern); **the Deepgram key must stay server-side** — browser must never hold it (token-proxy or server-relay required)
- Manager surfaces: requireManager + `getUserContext`/`applyHierarchyFilters` (Day 105 sparring endpoint is the template, incl. rep-hierarchy fallback scoping)
- Audit events fail-soft; validation script per day; UK copy

## 7. Gaps (the actual Tier 2B work)

1. No whisperer sessions/segments/triggers persistence (tables or meta)
2. No live transcript transport (Deepgram WS or browser→API relay)
3. No mic capture in the browser
4. No formal trigger engine (two partial keyword sets to unify)
5. No suggestion logging / used-vs-ignored tracking
6. No latency measurement anywhere
7. No silence detection
8. No custom trigger library
9. No manager view of live sessions
10. No whisperer page (`/whisperer` path reserved but empty)

## 8. Risks

- **Key exposure:** Deepgram browser-direct streaming needs short-lived tokens; getting this wrong leaks the key — prefer server-relay or Deepgram temporary-token flow
- **Latency stack-up:** mic → STT → trigger → render must fit ≤1.8s; an LLM rewrite per suggestion (as `/preview` does today) would blow the budget — rule-based suggestions on the hot path, LLM polish off-path only
- **Duplicated client logic:** sparring page + WhispererPanel both call `/preview` differently; building a third path would make it worse
- **Privacy:** live transcripts of real sales calls are sensitive — retention and tenant isolation must be designed in from Day 111, not retrofitted
- **The localhost-direct URL hack** in WhispererPanel bypasses proxy auth — fix when touched

## 9. Cost/latency notes

- Deepgram streaming ≈ $0.0059–0.0077/min (nova-class) — cheap; the cost risk is LLM suggestion calls per trigger, so MVP suggestions are **rule-based templates** (zero marginal cost, ~0ms)
- Trigger detection on interim transcripts = regex on strings — microseconds
- Latency budget (target ≤1.8s): mic→Deepgram ~100–300ms, interim result ~200–500ms, trigger+suggestion <5ms server, render <50ms — feasible with headroom **only if** no LLM call sits on the hot path
- Logging is async/fail-soft — never blocks the loop

## 10. Reuse vs replace

| Existing | Verdict |
|---|---|
| `POST /v1/whisperer/preview` rule patterns | **Reuse** — seed the trigger engine; keep endpoint for sparring back-compat |
| LLM rewrite on hot path | **Drop for live** (latency); optional async polish later |
| `WhispererPanel.tsx` | **Evolve** — becomes the live sidebar; remove URL hack |
| Sparring page duplicate whisperer code | **Leave** (works); converge later |
| Tier 2A `inferObjectionType` keywords | **Reuse** in the unified trigger engine |
| Batch transcription pipeline | **Untouched** — separate concern from live |
| Pins/timeline | **Reuse** for replay (architecture only this tier-phase) |
| Day 105 manager endpoint pattern | **Copy** for `GET /v1/manager/whisperer-sessions` |
| Job/status machine, schema probe, validation scripts | **Copy** |
