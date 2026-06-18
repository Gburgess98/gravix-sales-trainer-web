# Whisperer Raw Segment Storage — Plan (Day 141)

**Status:** planning / schema design only. No migration and no product behaviour
change shipped on Day 141. Implementation is scoped for Day 142+.

Gravix does not own the call. Gravix listens to the call, coaches the rep,
scores the session, and trains the team. Raw transcript storage exists only to
make coaching/discovery better — never to record audio or run anything on the
live hot path.

---

## A. Current storage audit

What persists today (verified Day 141 against `gravix-sales-trainer-api`):

- **Sessions** — `whisperer_sessions` carries full tenant columns from day one:
  `rep_id, user_id, org_id, company_id, office_id, call_id, status, started_at,
  ended_at, latency_*`, `meta`.
- **Triggers only** — `POST /v1/whisperer/sessions/:id/segments`
  (`src/routes/whisperer.ts`) runs built-in + custom trigger detection on the
  posted `text`, and **only inserts a `whisperer_triggers` row when a trigger
  fires**. Each trigger row stores `segment_text` (≤2000 chars), `type`,
  `phrase`, `confidence`, `suggestion`, `latency_ms`, `detected_at`, and
  `meta.speaker` / `meta.diarizedSpeaker`.
- **Discovery source** — `src/whisperer/discovery.ts` mines
  `whisperer_triggers.segment_text` (its own comment notes "transcript table
  does not exist"), so it only ever sees text that **already fired** a trigger.

### The gap

| Question | Today |
|---|---|
| Are all final transcript segments stored? | **No** — only segments that fired a trigger |
| Are non-triggering segments stored? | **No** — `text` is detected on, then discarded |
| Are interim transcripts stored? | **No** — the web posts final-only (`is_final`); interim shows locally |
| Are speaker labels / calibration stored? | **Partially** — only on triggered rows (`meta.speaker`, `meta.diarizedSpeaker`) |
| Are timestamps stored? | **Partially** — `detected_at`/`created_at` on triggered rows; no per-segment timing for untriggered speech |
| Linked to session/call/user/org/company/office? | Sessions: yes (all columns). Triggers: via `session_id` only. Untriggered speech: **no row at all** |

**Consequence:** discovery cannot surface blind spots — missed objections,
untriggered competitor mentions, new buyer language, repeated phrases that never
matched a built-in/custom rule. Those segments are never written down.

---

## B. Proposed schema — `whisperer_segments`

Additive, nullable-friendly, tenant-scoped. Stores **text only, never audio**.

```sql
create table if not exists public.whisperer_segments (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.whisperer_sessions(id) on delete cascade,
  call_id           uuid null,
  user_id           uuid null,
  org_id            uuid null,
  company_id        uuid null,
  office_id         uuid null,

  speaker           text not null default 'unknown',   -- as sent (rep/prospect/unknown/speaker_N)
  speaker_original  text null,                          -- raw diarisation label for traceability
  speaker_role      text null,                          -- calibrated role when known (rep/prospect)

  text              text not null,                      -- ≤2000 chars, trimmed
  text_normalised   text null,                          -- lowercased/cleaned for mining

  confidence        numeric null,
  is_final          boolean not null default true,      -- MVP only stores finals
  source            text not null default 'live',       -- live | manual

  started_at_ms     integer null,                       -- offset within session if available
  ended_at_ms       integer null,
  client_sent_at    timestamptz null,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz null,

  triggers_count    integer not null default 0,         -- how many triggers this segment fired
  trigger_types     text[] not null default '{}',       -- e.g. {price,competitor}
  meta              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
```

Indexes:
- `(session_id, created_at)`
- `(call_id, created_at)`
- `(org_id, created_at)`, `(company_id, created_at)`, `(office_id, created_at)`
- `(speaker, created_at)`
- optional GIN on `trigger_types` (only if discovery needs type filters early)
- full-text search index: **not** MVP — defer until volume justifies it

Rollback: `drop table if exists public.whisperer_segments;`

---

## C. API persistence design

Target route (unchanged path): `POST /v1/whisperer/sessions/:id/segments`.

Today it: detects triggers → inserts trigger rows if any → returns triggers.

Future behaviour (Day 142):
- **Always persist the final segment** to `whisperer_segments` after detection,
  whether or not a trigger fired.
- Record trigger outcome on the segment: `triggers_count`, `trigger_types`
  (derived from the same `detected` array already computed).
- **Trigger detection stays exactly as is** — no change to what fires or how.
- **Do not store interim transcripts** by default (final-only MVP).
- **Fail-soft**: if `whisperer_segments` is missing, the live route still works
  and returns `segment.persistence: false`. Detect via a table-missing probe
  mirroring `whispererLibraryTableMissing` / `candidateDecisionsTableMissing`.
- **Latency budget**: at most one extra insert on the hot path. Insert the raw
  segment and any trigger rows in the same route after detection (no extra
  round-trips, no LLM, no network calls).

Response addition (final segment stored):
```json
{ "segment": { "id": "…", "persistence": true } }
```
Table missing (fail-soft):
```json
{ "segment": { "id": null, "persistence": false } }
```

The existing `segment.text/speaker/receivedAt/processedAt` echo and `triggers`
array are preserved for backwards compatibility.

---

## D. Discovery design

Future discovery (Day 143) mines `whisperer_segments` first:
1. Read raw `whisperer_segments` in scope/window (tenant + hierarchy filtered).
2. Exclude empty / very short text.
3. Exclude rep speech where `speaker_role`/`speaker` is `rep` (calibrated).
4. Surface candidates from **untriggered or low-trigger** segments — the blind
   spots (`triggers_count = 0`) are the new signal.
5. Keep current `whisperer_triggers.segment_text` mining as a **fallback** when
   the raw table is missing/empty, so nothing regresses.

Candidate `source` metadata gains:
- `source`: `raw_segment` | `trigger_segment`
- `untriggered`: true/false
- `exampleSegmentIds`: [...]
- `sessionsCount`
- `phrases` / `examples`

**Still no auto-activation. Manager approval remains required** for any
candidate to become a Custom Trigger.

---

## E. Web design

The web already posts final-only segments with `speaker`, `diarizedSpeaker`,
and `clientSentAt` (`src/app/whisperer/page.tsx`). Future changes are minimal
and additive:
- Include richer metadata when posting: `speakerOriginal`, calibrated speaker
  role, `clientSentAt` (already sent), optional `startedAtMs`/`endedAtMs`
  offsets if available, and `source: live|manual`.
- **No need to send interim transcripts** — final-only stays the MVP.
- No UI redesign; discovery surfaces still read through `/coaching`.

---

## F. Privacy / compliance guardrails

- Store **transcript text only, never audio** and no audio features.
- Only where the customer has permission to record/listen to the call.
- **Tenant scoped** — `org_id`/`company_id`/`office_id` on every row; manager
  access via the existing hierarchy filters. **Never expose transcripts across
  tenants.**
- **Configurable retention** later (reuse the planned `WHISPERER_RETENTION_DAYS`
  default 90 from the Day 111 migration note); MVP target 30–90 days, with a
  purge job that can null `text`/`text_normalised` while keeping counts.
- **PII redaction** is a later enhancement (not MVP).
- **No LLM on the live hot path.** Discovery is **offline/rule-based only**.

---

## G. Day 142 implementation plan

Day 142 (storage layer):
- Create `sql/202606XX_whisperer_segments.sql` (schema in section B).
- Add a fail-soft table-missing probe (`whispererSegmentsTableMissing`).
- Persist the final segment in `POST .../segments` after detection, with
  `triggers_count` + `trigger_types`.
- Add `segment.persistence`/`segment.id` to the response.
- Add `scripts/validate-tier-2b-day-142.sh` (own-checks only).
- Prove live (manager `b817133a-…`, real SalesRep `00000000-0000-4000-8000-000000000001`):
  - a final segment with **no triggers** stores a row (`triggers_count = 0`),
  - a triggered segment stores with `triggers_count`/`trigger_types`,
  - rep/calibrated speaker is stored,
  - table-missing fail-soft returns `persistence:false` (if testable),
  - tenant columns populated from the session.
- **Do not change discovery ranking yet.**

Day 143 (discovery):
- Update discovery to mine `whisperer_segments` first (section D), with the
  trigger-text fallback retained. Add untriggered blind-spot candidates and the
  new `source` metadata. Manager approval still required.

---

## Out of scope (unchanged)

No browser extension, dialler, phone system, CRM calling, ElevenLabs, voice
output, or audio scoring. No auto-create / auto-enable of triggers. Custom
Trigger Library, Suggested Trigger Candidates, Reviewed candidates, and approved
candidate source links are all preserved.
