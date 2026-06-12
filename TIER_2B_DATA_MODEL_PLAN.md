# TIER 2B — DATA MODEL PLAN (Day 110)

**Plan only — no migration today.** Nothing whisperer-related exists in the schema, so unlike Tier 2A this is greenfield. Lessons applied from Tier 2A: tenant columns from day one (no Day-106-style retrofit), meta-first is unnecessary here because tables are new, house workflow (Supabase SQL editor, `IF NOT EXISTS`, documented rollback), schema-probe fail-soft in code until each environment runs the SQL.

**Day 111 starts with two tables only** (`whisperer_sessions`, `whisperer_triggers`) — segments ride inside the session row for the stub phase; the segments table lands with Deepgram (Day 112/113) when volume justifies it.

## 1. `whisperer_sessions`

**Purpose:** one row per live listening session; the manager-view anchor.

| Column | Type |
|---|---|
| `id` | uuid pk default gen_random_uuid() |
| `rep_id` | uuid not null |
| `org_id` / `company_id` / `office_id` | uuid null (stamped from the rep's users row at creation) |
| `call_id` | uuid null (link to a call when known — replay path) |
| `persona_id` | text null (sparring-linked sessions) |
| `status` | text default 'active' (`active\|ended\|abandoned`) |
| `started_at` / `ended_at` | timestamptz |
| `segment_count` / `trigger_count` | int default 0 |
| `latency_p50_ms` / `latency_p95_ms` | int null (written at end) |
| `meta` | jsonb null (segment buffer during stub phase, settings snapshot, source `live\|simulator`) |

Indexes: `(rep_id, started_at desc)`, `(company_id, started_at desc)`, `(office_id, started_at desc)`, `(status)`, `(call_id)`.
Rep/user linkage: `rep_id` = users/reps id (same convention as sparring_sessions).
Retention/privacy: transcript content is sensitive — plan a configurable purge (`WHISPERER_RETENTION_DAYS`, default 90) applied to segments/meta transcript text while keeping aggregate counts; document in the migration header.
Rollback: `drop table if exists whisperer_sessions;`

## 2. `whisperer_transcript_segments` (Day 112/113, with Deepgram)

**Purpose:** durable per-segment transcript once real volume arrives (a 30-min call ≈ hundreds of segments — too big for jsonb meta).

| Column | Type |
|---|---|
| `id` | uuid pk (client-generated allowed — idempotent retries) |
| `session_id` | uuid not null references whisperer_sessions(id) on delete cascade |
| `speaker` | text null (`rep\|prospect\|unknown`) |
| `text` | text not null |
| `start_ms` / `end_ms` | int null (offsets from session start) |
| `is_final` | boolean default true |
| `client_captured_at` / `server_received_at` | timestamptz |

Indexes: `(session_id, start_ms)`.
Retention: text nulled by the purge job after the retention window; row kept for counts.
Rollback: `drop table if exists whisperer_transcript_segments;`

## 3. `whisperer_triggers`

**Purpose:** every detected trigger + the suggestion shown + outcome + latency — the commercial telemetry of the tier.

| Column | Type |
|---|---|
| `id` | uuid pk |
| `session_id` | uuid not null references whisperer_sessions(id) on delete cascade |
| `segment_id` | uuid null (text ref during stub phase) |
| `type` | text not null (`price\|timing\|authority\|trust\|competitor\|send_info\|silence\|custom`) |
| `phrase` | text null (matched phrase) |
| `confidence` | int null (0–100) |
| `suggestion` | jsonb not null (`{title, response, urgency, emoji}`) |
| `suggestion_outcome` | text default 'shown' (`shown\|used\|ignored`) — item 8 ready, wired later |
| `library_id` | uuid null (custom trigger library linkage, later) |
| `detected_at` | timestamptz default now() |
| `latency_ms` | int null (PATCHed from the client render stamp) |
| `company_id` / `office_id` | uuid null (denormalised for manager queries) |

Indexes: `(session_id, detected_at)`, `(company_id, detected_at desc)`, `(type)`.
Rollback: `drop table if exists whisperer_triggers;`

## 4. `whisperer_suggestions` — **not a separate table**

Suggestions are 1:1 with triggers at MVP → embedded as `suggestion` jsonb on the trigger row (same reasoning as Tier 2A's turn_score-on-turn decision). Revisit only if multi-suggestion-per-trigger or A/B variants arrive.

## 5. `whisperer_trigger_library` (later, with item 7)

| Column | Type |
|---|---|
| `id` | uuid pk |
| `company_id` / `office_id` | uuid null (tenant) |
| `type` | text not null |
| `phrases` | jsonb not null (array) |
| `suggestion` | jsonb not null |
| `active` | boolean default true |
| `created_by` | uuid not null |
| `created_at` / `updated_at` | timestamptz |

Indexes: `(company_id, active)`, `(office_id, active)`. Rollback: drop table.
**Timing:** only when item 7 is implemented — not Day 111.

## Latency metrics fields

Per-trigger `latency_ms` (above) + per-session `latency_p50_ms`/`latency_p95_ms` written at `POST .../end`. No separate metrics table — aggregate from triggers if deeper analysis is ever needed.

## Migration sequencing

1. **Day 111:** `sql/2026xxxx_whisperer_foundation.sql` — `whisperer_sessions` + `whisperer_triggers` only (small, two tables, safe). Code ships with schema-probe fail-soft so the loop also runs pre-migration (sessions/triggers in memory + response only, flagged `persistence: false`).
2. **Day 112/113:** segments table with the Deepgram wiring.
3. **Later:** trigger library table with item 7; retention purge job.

## Call linkage & replay

`whisperer_sessions.call_id` + per-trigger `start_ms` offsets are sufficient to materialise timeline entries (pins or `crm_activities type='whisperer_trigger'`) at session end — no extra schema needed for the replay phase.
