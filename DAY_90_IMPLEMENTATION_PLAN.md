# DAY 90 — IMPLEMENTATION PLAN

**Goal:** ship `GET /v1/manager/command-centre` and wire the `/coaching` overview tab to it. One endpoint, one page section, no migration.

## Exact endpoint to build first

`GET /v1/manager/command-centre` — returns the agreed Sprint 4 response shape (`teamHealth`, `repsNeedingAttention`, `callsNeedingReview`, `openAssignments`, `weakestSkills`, `roi`).

Day-90 simplifications (no DB change needed):
- `teamHealth.reviewedCalls` and `roi.callsReviewed` = count of *scored* calls in the window (switches to manager-review counts on Day 91 when `call_manager_reviews` lands).
- `callsNeedingReview` = scored calls with `score_overall < 70` or any stage score < 50 (stage scores read from `analysis_json`), newest first, capped at 10.
- `openAssignments.priority` derived: `high` if overdue, else `normal`.
- All thresholds from the agreed rule-based MVP logic; window defaults to 30 days (`?days=` param, clamped like `dashboard/kpis`).

## Exact files to edit

### API (`~/Dev/gravix-sales-trainer-api`)

1. **`src/routes/manager.ts` (new)** — router gated by `requireManager`. Internals copy established patterns:
   - Identity: `(req as any).authUserId` (same as `assignments.ts`).
   - Scoping: `getUserContext(supa, managerId)` + `applyHierarchyFilters` from `src/lib/permissions.ts` on the calls query; `office_id`/`company_id` equality filters on assignments (same as `GET /v1/assignments/manager`).
   - Queries (all `Promise.all`):
     - calls in window: `id, user_id, status, score_overall, analysis_json, created_at, org_id, office_id, company_id` → team averages, review queue, weakest skills (stage scores: `intro`/`discovery`/`objection`/`close`).
     - open assignments: `status='assigned'` → open/overdue counts + list (cap 10).
     - rep names via the same rep lookup used in `crm.ts` `resolveVisibleReps` / `team.ts`.
   - Pure helper functions for the rule logic (`computeTeamHealth`, `computeRepRisk`, `buildReviewQueue`, `aggregateWeakestSkills`, `computeRoi`) so Day 98 can unit-test them.
2. **`src/server.ts`** — add import + `app.use("/v1/manager", managerRouter)` next to the existing mounts (~line 1769).

### Web (`~/Dev/gravix-sales-trainer-web`)

3. **`src/app/coaching/page.tsx`** — additive change:
   - Add `proxyFetch('/v1/manager/command-centre?days=30')` to the overview tab's load path.
   - Render team health strip (reuse `StatCard`), reps needing attention (reuse `RiskBadge`/`ScorePill` rows), calls needing review list (links to `/calls/[id]`), open assignments summary, weakest skills, ROI snapshot.
   - Keep existing fetches/tabs untouched as fallback; remove superseded client-side stitching on a later day, not Day 90.

No other files change. No new web routes, no nav changes (Command Centre → `/coaching` already exists).

## Exact UI route to update first

`/coaching` (overview tab only).

## Minimal DB changes

**None on Day 90.** Day 91 adds the only Sprint 4 migration:

```sql
-- sql/20260611_call_manager_reviews.sql
create table if not exists public.call_manager_reviews (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null,
  manager_id uuid not null,
  company_id uuid null,
  office_id uuid null,
  status text not null default 'reviewed',
  note text null,
  created_at timestamptz not null default now()
);
create index if not exists idx_cmr_call_id on public.call_manager_reviews(call_id);
create index if not exists idx_cmr_manager_id on public.call_manager_reviews(manager_id);
create index if not exists idx_cmr_created_at on public.call_manager_reviews(created_at);
```

## Test plan

API (manual via curl/REST client + the dev server):
1. Manager identity → `GET /v1/manager/command-centre` returns 200 with all six top-level keys and sane numbers against known seed data.
2. SalesRep identity → 403 `forbidden_not_manager`.
3. Missing identity header → 401.
4. Office manager sees only office reps/calls; company manager sees company-wide (compare against `GET /v1/crm/manager/control-centre` for the same users).
5. Empty org → 200 with zeroed `teamHealth`, empty arrays (no 500s).
6. Rule thresholds: seed one rep < 55 avg → appears red; one call at 60 → appears in review queue; overdue assignment → overdue count + amber/red health.

Web:
1. `npm run check` (typecheck + lint + proxy guard) passes.
2. `/coaching` as manager: overview renders new sections, no console errors; rep with no data shows empty states.
3. `/coaching` as rep: page does not break (endpoint 403 handled silently, existing tabs unaffected).
4. `npm run test:smoke` still green.

## Rollback plan

- All changes are additive: revert = `git revert` of the Day 90 commit(s) in each repo. No migration to roll back on Day 90.
- The new endpoint is unused by anything except the `/coaching` overview section; removing the web commit alone restores the previous UI even if the API endpoint stays deployed.
- Day 91 migration rollback (if ever needed): `drop table if exists public.call_manager_reviews;` — nothing else references it until Day 91 code lands.

## Implementation order (Day 90)

1. `src/routes/manager.ts` skeleton + mount in `server.ts` (returns shape with zeros).
2. Calls query + team health + review queue + weakest skills.
3. Assignments query + open/overdue + rep risk merge.
4. ROI block (scored-call count × 20 min).
5. Manual API tests (above).
6. `/coaching` overview wiring + empty states.
7. `npm run check` + smoke tests + manual role checks.
