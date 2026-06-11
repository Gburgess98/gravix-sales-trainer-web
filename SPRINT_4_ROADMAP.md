# SPRINT 4 — ROADMAP (Manager Value Layer)

> **As-built status (updated Day 98).** Days 89–98 shipped. Actuals vs plan below —
> the order shifted slightly (review history landed Day 91 with its UI; ROI shipped
> early inside the command-centre payload; hardening pulled forward to Day 95) but
> everything stayed inside the planned architecture.
>
> **Shipped manager workflow:** Command Centre (`/coaching` + `GET /v1/manager/command-centre`)
> · Review Queue (`GET /v1/manager/review-queue` + tab) · Manager Review History
> (`call_manager_reviews` + GET/POST `/v1/calls/:id/manager-review`) · Assign Coaching
> From Call (reused `POST /v1/assignments`, rule-based pre-fill) · Assignment Tracking
> (manager-scoped tab, Open/Overdue/Completed/All, priority/origin/From-call) ·
> Weakness Trends + Coaching Impact (previous-window comparison) · ROI snapshot ·
> Audit Logging (`manager.call_reviewed`, `manager.coaching_assigned_from_call`) ·
> E2E Regression Test (`tests/e2e/manager-workflow.spec.ts`).

## Objective

Turn Gravix into a manager-facing coaching command platform. A manager opens the Command Centre and within seconds sees team health, reps needing attention and calls needing review; reviews a priority call; assigns coaching from it; tracks assignments; and sees weakness trends and a simple ROI snapshot.

**Commercial loop:** call review finds weakness → manager sees priority in Command Centre → manager reviews the call → manager assigns coaching → rep completes coaching → manager sees improvement/ROI.

## Feature order

1. **Manager Command Centre** (aggregate endpoint + `/coaching` overview) — the anchor; everything else hangs off it.
2. **AI Review Workflow** (review queue + manager-review record) — unlocks "needs review → reviewed" state, which ROI depends on.
3. **Assignment Engine wiring** (assign coaching from a reviewed call) — closes the loop; reuses the existing assignments system.
4. **Coaching Intelligence Layer** (server-side rule-based recommendations + weakness trends) — moves the rules out of the client.
5. **Manager ROI Dashboard** (ROI endpoint + card) — needs reviewed-call data to exist first.
6. **Call Review UX polish** — last, once the workflow is functionally complete.

## Day 89 → Day 99 plan

| Day | Planned | Actual (as-built) |
|---|---|---|
| **89** | Audit + deliverables | ✅ As planned. |
| **90** | Command-centre endpoint + `/coaching` overview | ✅ As planned (ROI block shipped inside the payload from Day 90). |
| **91** | Review history migration + review endpoints | ✅ Plus the Review Queue tab, Mark Reviewed UI on `/coaching` and `/calls/[id]`, the pre-existing web build blocker fix, and the dev calls hierarchy backfill. |
| **92** | Review UI on `/coaching` and call detail | ✅ Became **Assign Coaching From Call** (reused `POST /v1/assignments`; modal with rule-based title/note/priority pre-fill; command-centre gained `repId`). |
| **93** | Assign coaching flow | ✅ Became **Assignment Tracking Polish** (manager-scoped tab data source, Open/Overdue/Completed/All filters, priority/origin/From-call/notes, extended `openAssignments` shape). |
| **94** | Assignment tracking views | ✅ Became **Weakness Trends + Coaching Impact** (previous-window comparison, trend chips, coachingImpact block). |
| **95** | Weakness trends | ✅ Became **Hardening** (audit events, tenant-isolation validation 22/22, cross-scope 403 verified). |
| **96** | ROI endpoint + card | ✅ Became **Call Review UX + Demo Readiness** (GET review state, Reviewed ✓ survives refresh, manager note block, DEMO_CHECKLIST.md). ROI had already shipped Day 90/91. |
| **97** | Hardening | ✅ Became **E2E Regression Test** (`manager-workflow.spec.ts`, stateful mocks, full loop). |
| **98** | Testing + QA | ✅ Full suite 92/92 after fixing one stale Sprint-3 login assertion; UK spelling sweep clean; as-built docs. |
| **99** | Buffer, demo, sprint close + tag | Planned: demo rehearsal vs DEMO_CHECKLIST.md, tag `sprint-day-99-complete` in both repos. |

## What should be built now

- One new API router (`/v1/manager`) with three GET endpoints + one POST on calls.
- One small additive migration (`call_manager_reviews`).
- `/coaching` overview consuming the single aggregate payload.
- Rule-based logic only (thresholds: team red < 55 avg or overdue + >5 review backlog; amber < 70 or any review backlog; rep red < 55 avg / 2+ calls < 50 / overdue; review queue = score < 70 or stage < 50; ROI = 20 min × reviewed call).

## What should stay out of scope

- Tier 2 sparring, Deepgram, ElevenLabs, real-time/live features.
- New heavy AI calls (no LLM-generated recommendations — rules only).
- Large schema migrations or changes to `calls`/`assignments` columns.
- Refactoring the 1,168-line `/coaching` page, the `/v1/coach` legacy router, or `dashboard.ts` — additive changes only.
- Rep-facing UX changes beyond what assignment completion already does.
- Per-skill drill content library (assignments carry recommended titles only).

## How Sprint 4 connects to Tier 2 later

- `call_manager_reviews` becomes the training signal for Tier 2: which calls managers prioritise, what they annotate, what they assign from them.
- The rule-based recommendation layer is the contract Tier 2 swaps in behind: same payload fields (`riskReason`, `recommendedAction`, `weakestSkill`), AI-generated values later — no UI change needed.
- The review queue becomes the entry point for AI-assisted review (Deepgram-timestamped moments, generated coaching notes) once Tier 2 lands.
- ROI baseline collected now (reviewed counts, completion rates, score trends) gives Tier 2 a before/after story to sell against.
- Assignment `type='sparring'` already exists in the schema, so Tier 2 sparring drills plug into the same engine and Command Centre tracking without migration.
