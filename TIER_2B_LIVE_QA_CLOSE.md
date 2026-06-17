# Tier 2B — Live Whisperer QA Close (Day 129)

Closes the real-time Live Whisperer stack (Days 110–128). No new features on
Day 129 — this is a QA, documentation, validation and tagging pass.

**Product rule:** Gravix does not own the call. Gravix listens to the call,
coaches the rep, scores the session, and trains the team. There is no dialler,
phone system, CRM calling, browser extension, voice output or audio scoring.

## Scope closed

| Capability | Day | State |
| --- | --- | --- |
| Realtime STT foundation (browser mic → Deepgram → /segments) | 112–117 | Live, manual mic proof passed |
| Semantic trigger classifier (buyer intent, not exact phrases) | 117 | Live |
| Custom trigger library + noisy-trigger flags | 119–125 | Live |
| Suggestion quality scoring (used / ignored / not relevant) | 122–123 | Live |
| Speaker diarisation labels (Speaker 0 / Speaker 1) | 126 | Live |
| Rep/prospect speaker calibration | 127 | Live |
| Silence ("dead air") detection light stub | 128 | Live, UI-only |

## Manual proof record

Run by George in /whisperer, Live Listener mode, against a real microphone.

1. Live mic works — **PASS**.
2. Deepgram transcript appears (interim + final) — **PASS**.
3. Speaker labels appear (Speaker 0 / Speaker 1) — **PASS**.
4. Speaker calibration works (Speaker N → Rep / Prospect / Unknown) — **PASS**.
5. Price / send-info / authority triggers still fire on buyer speech — **PASS**.
6. Dead-air hint appears after 5–6 seconds of silence — **PASS**.
7. Speech resets the silence timer — **PASS**.
8. Silence hint does not spam inside the 30s cooldown — **PASS**.
9. Manual Simulator still works — **PASS**.
10. Manager Whisperer Insights still loads — **PASS**.

### Speaker diarisation proof
`diarize=true` is sent on the Deepgram WS URL (bearer subprotocol preserved, no
raw `DEEPGRAM_API_KEY` in the web app). Final segments derive a dominant speaker
from word-level `speaker` indices and display provisional `Speaker 0 / Speaker 1`
labels. The API stores the original label verbatim in trigger `meta.speaker`.

### Speaker calibration proof
Session-local mapping of diarised labels to Rep / Prospect / Unknown. Verified
deterministically end-to-end: a label calibrated to **Rep** is posted as
`speaker:"rep"` and suppressed by the trigger engine (0 triggers); a label
calibrated to **Prospect** (or left uncalibrated) still fires (1 trigger on
"the price is too high"). The diarised origin is preserved in `meta.diarizedSpeaker`.

### Silence hint proof
Client-side only, Live Listener only. `SILENCE_THRESHOLD_MS = 5000`,
`SILENCE_COOLDOWN_MS = 30000`. Any interim/final speech resets the clock; the
hint fires at most once per cooldown and is torn down on stop / session end /
mode change / unmount. Nothing is posted to the API.

## Known caveats

- **Diarisation is provisional.** Deepgram cannot reliably know which speaker is
  the rep without calibration; uncalibrated `speaker_N` is treated prospect-like
  so triggers are never silently lost.
- **Calibration is session-local.** It is not persisted across sessions or reps
  (no migration) — re-calibrate each session.
- **Silence detection is a UI-only stub.** No silence events are persisted, there
  is no manager analytics, and it does not yet distinguish rep-question silence
  from buyer hesitation.
- **No LLM on the live hot path.** The /segments trigger engine is deterministic;
  the only LLM use is the non-realtime /preview rewrite.
- **In-memory fallback** remains active until the whisperer SQL migrations are run
  in an environment (responses flag `persistence:false`).

## Next recommended feature

**AI Trigger Discovery** — see `WHISPERER_AI_TRIGGER_DISCOVERY_PLAN.md`. Mine
ended sessions (offline, manager-approval-gated) to propose new custom triggers
from real objections, never on the live hot path.
