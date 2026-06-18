# Tier 2B Validation Notes

Validation workflow for the Whisperer Tier 2B work (day 110 onwards).

Product rule: Gravix does not own the call. Gravix listens to the call, coaches
the rep, scores the session and trains the team. No voice output, no LLM on the
live hot path.

## Why the old recursive chain became too slow

Each per-day script (`validate-tier-2b-day-N.sh`) ended by recursively invoking
the previous day's script:

```
Day 134 → Day 133 → Day 132 → Day 131 → … → Day 110
```

So validating the latest day re-ran the entire day-110..134 history. Each hop is
a cold `tsx` start plus repeated greps over the same files, so a single
"validate today" run grew into minutes of repeated, mostly-redundant work and
wasted usage. Most of those re-runs only re-checked stable core invariants that
never change day to day.

Day 135 fixes this without deleting any history:

- A single fast **smoke** script checks the stable core invariants once.
- New day scripts validate **their own changes only** and do **not** chain into
  the previous day.
- The old per-day chain still exists and still works — it's just no longer run
  by default.

## Recommended validation rhythm

1. **Day-specific script** for the feature you changed
   — e.g. `npm run validate-tier-2b-day-135`. Own checks only.
2. **Smoke** for current core invariants
   — `npm run validate-tier-2b-smoke`. Runs in seconds.
3. **Build / typecheck / e2e** when closing or tagging a day
   — `npm run build`, `npm run typecheck`, `npm run test:whisperer-flow`.

The smoke script covers the stable Tier 2B surface:

- `/whisperer` page exists
- Deepgram `bearer` WS subprotocol present
- `diarize=true` present
- speaker calibration copy present
- silence threshold / cooldown constants present
- `/coaching` has Whisperer Insights, Custom Triggers, Suggested Trigger Candidates
- `/calls/[id]` has Whisperer Moments
- no `DEEPGRAM_API_KEY` in the web app
- no ElevenLabs / TTS / Voice Agent in the web app
- no LLM on the live Whisperer hot path
- API pure assertions: `validate-whisperer-triggers.ts`, `validate-whisperer-discovery.ts`
  (run automatically when the API repo is a sibling at `~/Dev/gravix-sales-trainer-api`)

## When to run the full historical chain

- **Before major tags only** — e.g. when cutting a `sprint-day-NNN-complete` tag
  or a sprint milestone, run the latest per-day script (which still chains back
  through the history) for full regression confidence.
- **Not every day.** For day-to-day work, steps 1–2 above are sufficient.

## Expected baselines

- API typecheck: ~70
- WEB typecheck: ~186
- Full e2e: ~94

## API validations

The API exposes pure (in-memory, no DB, no network) validations:

```
cd ~/Dev/gravix-sales-trainer-api
npx tsx scripts/validate-whisperer-triggers.ts
npx tsx scripts/validate-whisperer-discovery.ts
npm run typecheck
```

The web smoke script calls these two directly when the API repo is found as a
sibling directory; otherwise it skips them and prints a note to run them in the
API repo.
