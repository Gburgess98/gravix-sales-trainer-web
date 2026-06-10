# SPRINT 4 — ROADMAP (Manager Value Layer)

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

| Day | Work |
|---|---|
| **89** | This audit. Deliverables + validation script. ✅ |
| **90** | API: `src/routes/manager.ts` + `GET /v1/manager/command-centre` (requireManager + hierarchy scoping, agreed response shape). Web: wire `/coaching` overview tab to it. See DAY_90_IMPLEMENTATION_PLAN.md. |
| **91** | DB migration `call_manager_reviews` + `POST /v1/calls/:id/manager-review` + `GET /v1/manager/review-queue`. |
| **92** | Web: "Calls needing review" list on `/coaching` → opens `/calls/[id]`; "Mark reviewed" action on call detail. |
| **93** | Web: "Assign coaching" from a reviewed call (pre-filled `POST /v1/assignments` with `type=call_review`, `target_id`, recommended title from weakest skill). |
| **94** | Assignment tracking: open/overdue/completed views in the `/coaching` assignments tab driven by `command-centre` payload; overdue surfaced in team health. |
| **95** | Weakness trends: server-side `weakestSkills` aggregation (hierarchy-scoped, derived from stage scores/flags) + trends card. |
| **96** | `GET /v1/manager/roi` + ROI snapshot card (calls reviewed, minutes/hours saved at 20 min per reviewed call). |
| **97** | Hardening: tenant-isolation checks on all new endpoints (office vs company manager, impersonation, cross-org attempts), audit-log entries for manager reviews. |
| **98** | Testing: API route tests + Playwright e2e for the manager loop (open Command Centre → review call → assign → complete → see counts move). QA pass with UK spelling check on new copy. |
| **99** | Buffer, polish, demo data, sprint close + tag. |

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
