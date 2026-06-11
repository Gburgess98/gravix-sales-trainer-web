# SPRINT 4 CLOSE — Manager Value Layer

**Sprint:** Sprint 4 – Manager Value Layer (Days 89–99)
**Final status:** Complete
**Closed:** Day 99 (2026-06-11)
**Tags:** `sprint-day-99-complete` (web + api)

## Shipped features

- **Manager Command Centre** — `/coaching` + `GET /v1/manager/command-centre` aggregate (team health, reps needing attention, calls needing review, open assignments, weakest skills, coaching impact, ROI)
- **Review Queue** — `GET /v1/manager/review-queue` + `/coaching` tab with reasons chips
- **Manager Review History** — `call_manager_reviews` table + `GET`/`POST /v1/calls/:id/manager-review`
- **Assign Coaching From Call** — reused `POST /v1/assignments`; rule-based pre-fill (title from weakest skill, note from reasons, priority, due +3 days); duplicate-drill guard surfaced in UI
- **Assignment Tracking Polish** — manager-scoped assignments tab, Open/Overdue/Completed/All filters, priority/origin badges, "From call" links, notes preview
- **Weakness Trends** — current vs previous window per skill (`↑ from N` / `↓ from N` / flat / new)
- **Coaching Impact** — completed assignments + skills improving/declining
- **ROI Snapshot** — real manager-review counts × 20 minutes saved
- **Manager Audit Logging** — `manager.call_reviewed`, `manager.coaching_assigned_from_call` → `audit_events`, fail-soft
- **Tenant/role hardening** — requireManager gate + getUserContext/applyHierarchyFilters on every manager surface; cross-scope reviews rejected (403); 22-check isolation validation
- **Call Review UX polish** — Reviewed ✓ survives refresh, review date, Manager Review Note block
- **E2E regression test** — `tests/e2e/manager-workflow.spec.ts` (stateful-mock full loop)
- **As-built docs + demo checklist** — SPRINT_4_* docs updated to actuals; DEMO_CHECKLIST.md 10-step script

## Final demo workflow

Command Centre → Review Queue → Review Call → Mark Reviewed → Assign Coaching → Track Assignment → See Weakness Trends / Coaching Impact / ROI

## Validation summary (Day 99 final run)

| Check | Result |
|---|---|
| Web build (`next build`) | ✅ passes |
| Full E2E suite | ✅ 92/92 (includes smoke + manager-workflow spec) |
| validate-sprint-4-day-95…98 | ✅ all pass (22/22, 12/12, 11/11, 14/14) |
| Web typecheck | 186 errors — pre-existing baseline, none in Sprint 4 files |
| API typecheck | 71 errors — pre-existing baseline, none in Sprint 4 files |
| Live API rehearsal | ✅ command-centre, review-queue, review state, assignment filters, 403s |

## Important environment note

`call_manager_reviews` must be applied **manually via the Supabase SQL editor** per environment (this repo's standard migration workflow — no CLI/psql access).

- **Dev: applied.** Other environments must run: `sql/20260610_call_manager_reviews.sql`
- Rollback: `drop table if exists call_manager_reviews;`

## Known caveats

- Typecheck baselines are pre-existing: API 71, web 186.
- Trend chips need scored calls in **both** the current and previous windows to show ↑/↓/flat; dev calls cluster in Mar–Apr 2026, so most windows show "New this period". Scoring a few fresh calls before a demo lights them up (see DEMO_CHECKLIST.md).
- A stale Next server on :3000 can wedge and cause false E2E failures — kill it and rerun before changing code.
- Demo-data: fresh in-window scored calls were not created on Day 99 (requires the audio upload/score pipeline); documented rather than rushed.

## Next sprint recommendation

**Tier 2A – Sparring Brain foundation**, entered via Day 100 transition planning:

- Conversation state manager
- Persona memory
- Claude/OpenAI orchestration layer
- Assignment-linked sparring (schema already supports `type='sparring'`; the Command Centre tracks it with no further migration)

Sprint 4's review history and rule-based recommendation fields (`riskReason`, `recommendedAction`, `weakestSkill`) are the contract Tier 2 swaps AI-generated values into without UI changes.
