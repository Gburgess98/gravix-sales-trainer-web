# Tier 2B — Live Whisperer Demo Checklist

> **Product rule:** Gravix does not own the call. Gravix **listens** to the call,
> **coaches** the rep, **scores** the session, and **trains** the team.

## Pre-demo
- API + web running; manager identity to hand for `/coaching`.
- If `/coaching` shows old "active" sessions, run `npm run db:cleanup-whisperer-stale -- --apply` (api) — stale sessions also self-classify after 30 minutes.
- Live mode needs a working mic + the Deepgram Member key; the **Manual Simulator** is the no-mic fallback.

## Live Whisperer demo (≈2 minutes)
1. Open **/whisperer**.
2. Click **Start session**.
3. Click **Start listening** (approve the microphone prompt). Status reaches **Listening**.
4. Say: *"Hello, just calling about the packages you offer."* — transcript appears, no trigger (neutral).
5. Say: *"The price is a little bit too high."* → **price** suggestion card appears ("Handle price objection").
6. Say: *"Send over the details please."* → **send_info** suggestion ("Don't die by email").
7. Say: *"My partner wants to talk about this."* → **authority** suggestion ("Bring in the decision maker").
8. Note the **Last suggestion latency** chip (~300ms in live testing).
9. Click **Stop listening** (mic + socket released; session stays open), then **End session**.

*No mic? Switch to **Manual Simulator**, type the same lines, identical triggers fire.*

## Manager visibility
10. Open **/coaching** → **Whisperer Insights** card shows session count, trigger count,
    **top objection**, **avg latency**, and active/stale/ended counts.
11. Stale (old, never-ended) sessions show a **STALE** badge and don't inflate the active count.

## Call review replay (optional, if call-linked)
12. Open **/whisperer?callId=<callId>**, run a few triggers, end the session.
13. Open **/calls/<callId>** → **Whisperer Moments** lists each trigger: type, phrase,
    segment, suggestion, urgency, latency, time, live/manual source.

## Semantic detection (why it's not brittle)
Triggers fire on **buyer intent**, not exact wording — e.g. "a bit steep", "we can't
afford that", "hard to justify the cost", "we're not ready yet", "do you have reviews",
"we already use someone" all classify correctly. No LLM on the hot path.

## Useful commands
- `npm run test:whisperer-flow` (web) — simulator E2E regression.
- `npm run validate-tier-2b-day-118` (web) — Day 118 checks.
- `npm run db:cleanup-whisperer-stale [-- --apply]` (api) — end stale sessions.
