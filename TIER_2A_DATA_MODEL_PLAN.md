# TIER 2A — DATA MODEL PLAN (Day 100)

**Plan only — no migration created today.** Key finding: `sparring_sessions`, `sparring_turns` and `xp_events` already exist in dev (created ad-hoc, no files in `sql/`). Tier 2A therefore needs **additive columns on two existing tables + one small new table**, not the five new tables originally envisaged. All migrations follow the house workflow (paste into Supabase SQL editor, `IF NOT EXISTS` guards, documented rollback).

## As-deployed today (baseline)

- `sparring_sessions(id, rep_id, persona_id, score, xp_awarded, turns, created_at, meta, total_score, duration_ms, summary, flags, difficulty, failed_moments)`
- `sparring_turns(id, session_id, role, text, created_at)`
- `xp_events(id, rep_id, source, delta, created_at, amount, session_id)`

A baseline migration file should be added to `sql/` recording this schema (`create table if not exists` — no-op in dev, makes other environments reproducible).

## 1. `sparring_sessions` — additive columns (no new table)

**Purpose:** tenant scoping, assignment linkage, lifecycle status, Brain state.

| Column | Type | Why |
|---|---|---|
| `assignment_id` | uuid null | Direct linkage (today only in `meta`); powers `GET /v1/sparring/assignments/:id/session` and manager views |
| `company_id` | uuid null | Hierarchy scoping for `GET /v1/manager/sparring-sessions` (Sprint 4 `applyHierarchyFilters` works directly) |
| `office_id` | uuid null | Same |
| `org_id` | uuid null | Parity with calls/reviews |
| `status` | text default 'active' (`active\|completed\|abandoned`) | Lifecycle; completion gate |
| `completed_at` | timestamptz null | ROI/trend windows |
| `state` | jsonb null | Current Brain state (stage, mood, trust, pressure, objection, repPerformance) |

Indexes: `(company_id, created_at desc)`, `(office_id, created_at desc)`, `(assignment_id)`, `(rep_id, created_at desc)` (if missing).
Backfill: tenant columns from the rep's `users` row — same pattern as `db:backfill-calls` (dev-only script).
Rollback: `alter table sparring_sessions drop column if exists <col>;` per column — nothing else references them until Tier 2A code lands.

## 2. `sparring_turns` — additive columns

**Purpose:** per-turn scores and state snapshots (today: only role + text).

| Column | Type | Why |
|---|---|---|
| `turn_score` | jsonb null | `{clarity, confidence, objectionHandling, progression, overall, tier: 'heuristic'\|'llm'}` |
| `state_snapshot` | jsonb null | Brain state after the turn — powers replay/retry of weak moments and analytics |
| `meta` | jsonb null | Provider used, latency, stub-fallback flag |

Index: `(session_id, created_at)` (likely exists implicitly; confirm).
Rollback: drop columns.

**Decision: no separate `sparring_turn_scores` table.** Scores are 1:1 with turns; jsonb on the turn row is simpler, cheaper and reversible. Revisit only if score history per turn (re-scoring) becomes a requirement.

## 3. `sparring_session_summaries` — **not needed**

`sparring_sessions.summary` (existing column) stores the structured summary JSON. A separate table adds nothing at MVP.

## 4. `sparring_personas` — **deferred**

Personas stay code-config (`src/personas.ts`) + existing company persona profiles. A DB table only becomes necessary when managers author custom personas in the UI (post-Tier 2A). Documented as a future migration, not created.

## 5. New table: `sparring_objection_sets` (small, optional — Tier 2A item 11)

**Purpose:** manager/team scripts and objection sets loaded into sessions.

| Column | Type |
|---|---|
| `id` | uuid pk default gen_random_uuid() |
| `company_id` / `office_id` | uuid null (tenant) |
| `name` | text not null |
| `objections` | jsonb not null (array of `{type, text, expected_counter}`) |
| `created_by` | uuid not null |
| `active` | boolean default true |
| `created_at` / `updated_at` | timestamptz default now() |

Indexes: `(company_id)`, `(office_id)`. Rollback: `drop table if exists sparring_objection_sets;`
**Timing:** only when item 11 is implemented (mid-Tier 2A) — not Day 101.

## Migration sequencing

1. **Day 101:** none required — state can live in `sparring_sessions.meta.state` (column exists) while the state manager is built. Zero-migration start.
2. **Day 102–103:** `20260612_sparring_brain_columns.sql` — sessions + turns additive columns above, after the state manager proves the shape.
3. **Later:** objection sets table with item 11; baseline schema file alongside.

## Tenant fields & assignment linkage summary

Every manager-facing query path gets first-class columns (`company_id`, `office_id`, `assignment_id`) so the Sprint 4 dual pattern (requireManager + `applyHierarchyFilters`) applies to sparring with no joins. Rep-facing paths keep ownership checks on `rep_id` exactly as today.
