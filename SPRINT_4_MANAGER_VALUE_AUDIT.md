# SPRINT 4 — MANAGER VALUE LAYER AUDIT (Day 89)

> ## As-built outcome (added Day 98)
>
> The recommended architecture in §11 shipped essentially as written:
>
> - `/coaching` became the Manager Command Centre (no new top-level web routes).
> - New `src/routes/manager.ts` at `/v1/manager`: `GET /command-centre` (aggregate
>   payload incl. trends + coachingImpact + ROI) and `GET /review-queue`.
> - Manager review history: `call_manager_reviews` table (the sprint's only
>   migration, live in dev) + `GET`/`POST /v1/calls/:id/manager-review` in `calls.ts`.
> - Assign Coaching From Call **reused `POST /v1/assignments`** — no duplicate
>   endpoint; rule-based pre-fill lives client-side, linkage via `target_id` +
>   `meta.source_call_id`, priority in `meta.priority`.
> - Tenant hardening held the dual-system pattern throughout (requireManager gate +
>   getUserContext/applyHierarchyFilters scoping); cross-scope review attempts
>   return 403; audit events `manager.call_reviewed` and
>   `manager.coaching_assigned_from_call` write to `audit_events` fail-soft.
> - Risks called out below largely materialised and were handled: the two role
>   systems (§7) were used together as planned; the legacy `/v1/coach` path was
>   left untouched; the large-file risk (§10.6) was avoided via the new router —
>   and the §10 web build risk turned out to be real (pre-existing JSX breakage in
>   AdminAssignmentsClient.tsx, fixed Day 91).

Audit of existing manager-facing systems across both repos before Sprint 4 implementation.

**Checkpoint audited:**
- API: `~/Dev/gravix-sales-trainer-api` @ `2700d0f` (tag `sprint-day-88-complete`, branch `claude/sprint-3-api`, clean)
- WEB: `~/Dev/gravix-sales-trainer-web` @ `8955faa` (tag `sprint-day-88-complete`, branch `claude/sprint-3-shell`, clean)

---

## 1. API routes found

Mounted in `src/server.ts` (all under `/v1`): `dashboard`, `internal`, `calls`, `pins`, `crm`, `accounts`, `coach`, `team`, `reps`, `rewards`, `sparring`, `whisperer`, `admin`, `assignments`, `users`, `auth`, `debug`.

**There is no `/v1/manager` namespace.** Manager functionality is spread across three routers:

### Assignments — `src/routes/assignments.ts` (1,899 lines)
| Endpoint | Notes |
|---|---|
| `GET /v1/assignments` | Cursor-paginated list |
| `GET /v1/assignments/summary` | Aggregate counts |
| `GET /v1/assignments/by-target` | Lookup by target (call) id |
| `GET /v1/assignments/me` | Rep's own assignments |
| `GET /v1/assignments/reporting` | Per-rep rollups |
| `GET /v1/assignments/manager` | `requireManager`; hierarchy-scoped (office/company), cursor-paginated, returns `summary` |
| `GET /v1/assignments/manager/signals` | `requireManager`; overdue, completion rate, stale reps |
| `GET /v1/assignments/manager/trust` | `requireManager`; trust metrics |
| `POST /v1/assignments` | `requireManager`; create assignment |
| `PATCH /v1/assignments/:id/complete` | Rep completion, awards XP |
| `PATCH /v1/assignments/manager/:id` | Manager edit |
| `POST /v1/assignments/:id/nudge` | `requireManager` |
| `DELETE /v1/assignments/:id` | `requireManager` |

### CRM manager — `src/routes/crm.ts`
| Endpoint | Notes |
|---|---|
| `GET /v1/crm/manager/control-centre` (line 1627) | **The closest thing to a Command Centre today.** Org-scoped (`requireManagerOrg` + `resolveVisibleReps`), returns `headline` (reps total/at_risk/watch/ok, open/overdue actions) and per-rep risk rows (`risk_score`, `band`, counts, latest call/score) |
| `GET /v1/crm/manager/overview` | Older overview |
| `POST /v1/crm/manager/auto-assign/run` + runs endpoints | Rule-based auto-assignment runner with run history |
| `GET/POST /v1/crm/manager/settings` | Manager settings |
| `GET /v1/crm/manager/contacts` | Manager contacts |
| `POST /v1/crm/assignments/manager/batch-assign` | Batch assignment |

### Dashboard — `src/routes/dashboard.ts` (1,203 lines)
| Endpoint | Notes |
|---|---|
| `GET /v1/dashboard/kpis` | Hierarchy-filtered (`getUserContext` + `applyHierarchyFilters`); total calls, avg score, sparklines, top reps/accounts |
| `GET /v1/dashboard/flags/summary` | Review-flag aggregation from `crm_activities` (by section/severity, top problem area, reps at risk) |
| `GET /v1/dashboard/company-weakness` | Skill-weakness aggregation — **direct input for "weakest skills"** |
| `GET /v1/dashboard/rep-improvement` | Rep trend tracking — input for ROI/improvement story |
| `GET /v1/dashboard/reporting-summary` | Critical calls today, flagged calls this week, auto-assignments created, completion rate, reps needing help |
| `GET /v1/dashboard/leaderboard`, `rep-summary`, `voice-score-summary`, `voice-score-trend` | Supporting views |

### Calls — `src/routes/calls.ts` (1,600 lines)
| Endpoint | Notes |
|---|---|
| `POST /v1/calls/:id/score` | Writes `score_overall` + `analysis_json`, appends `call_scores` history row, auto-completes matching assignments (`completeAssignmentsForTarget`), dispatches feedback |
| `GET /v1/calls/:id/scores` | Score history (ownership-checked via `canAccessCall`) |
| `GET /v1/calls/paged` | Paginated, supports `scope=company` |
| `GET /v1/calls/:id`, `/:id/signed-audio` | Detail + audio |

### Coach — `src/routes/coach.ts` (257 lines)
- `POST /v1/coach/assign` — small legacy assignment path; call detail page still reads `/v1/coach/assignments?callId=`. **Do not extend; consolidate on `/v1/assignments`.**

---

## 2. Web pages found

| Route | State |
|---|---|
| `/coaching` | **Already the "Coaching Command Centre"** — 1,168-line client page with tabs: overview, interventions, assignments, replay. Fetches `control-centre`, `reporting-summary`, `assignments`, `calls/paged`. Contains client-side rule-based helpers (`recommendAssignment`, `getAssignmentUrgency`, `getAssignmentReasoning`, effectiveness/outcome predictions) |
| `/crm/manager/control-centre` | Redirects to `/coaching` (already consolidated) |
| `/crm/manager` + subpages | ManagerClient, auto-assign runner + run history, nudges, contacts |
| `/assignments` | `AssignmentsClient.tsx` (1,272 lines) — rep + manager assignment list |
| `/admin/assignments` (+ `/create`, `/queue`) | `AdminAssignmentsClient.tsx` (2,313 lines) — admin creation/queue |
| `/calls/[id]` | 2,290-line call detail: score box, transcript player, "Coach assignments" panel, assignment completion |
| `/review/timeline`, `/review/[callId]/timeline` | Review timeline pages (367 lines total) |
| `/dashboard` | 729-line KPI dashboard |

Navigation (`src/config/navigation.ts`) already has **Coaching → Command Centre → `/coaching`**, with role-gated sections (`all`/`manager`/`admin`/`partneradmin`/`superadmin`).

---

## 3. Existing assignment system summary

- **Table** (`sql/20251223_assignments.sql` + follow-ups): `assignments(id, rep_id, manager_id, type ∈ call_review|sparring|custom, target_id, title, status ∈ assigned|completed|missed, due_at, created_at, completed_at, completed_by, source, meta jsonb)` plus `office_id`/`company_id` used by manager filters. Indexed on rep_id, manager_id, status, due_at.
- **No `priority` column** — urgency is derived client-side. **No `overdue` status** — derived from `due_at < now()` while open.
- **Lifecycle is solid:** manager creates (`POST /v1/assignments`), rep completes manually or auto-completes when the target call is scored (`completeAssignmentsForTarget` in `src/lib/assignmentsComplete.ts`), XP awarded by score band.
- **Auto-creation exists:** `shouldCreateAssignment` in `src/lib/scoring.ts` creates assignments on critical threshold bands with meaningful section failures (close/objection/discovery), with a Day 66 noise filter (`isHighQualityFlag`).

## 4. Existing coaching system summary

- Rule-based coaching intelligence already exists at scoring time: threshold bands, review flags, `needs_manager_review: true` on critical flags (`src/lib/scoring.ts`).
- Flags are persisted to `crm_activities` as `type='review_flag'` with `flag_key/flag_section/flag_severity/flag_category` columns (migration `20260528`) and mirrored in `meta`.
- The web `/coaching` page layers more rule-based recommendations client-side. **Sprint 4 should move the canonical recommendation rules server-side** so the Command Centre payload is the single source of truth.

## 5. Existing dashboard / manager system summary

- `GET /v1/crm/manager/control-centre` already computes rep risk bands (`at_risk`/`watch`/`ok`), risk scores, open/overdue/completed-today counts and headline aggregates — ~70% of the desired `teamHealth` + `repsNeedingAttention` payload.
- `GET /v1/dashboard/flags/summary` + `company-weakness` already aggregate skill weaknesses — covers `weakestSkills`.
- `GET /v1/assignments/manager/signals` covers overdue/completion-rate — covers `openAssignments` summary needs.
- **What's missing is one aggregate endpoint** that joins these into the Command Centre shape; today the client stitches 4 calls together.

## 6. Existing call review workflow summary

- Calls are AI-scored (`POST /v1/calls/:id/score`): `calls.score_overall` + `calls.analysis_json` (rubric v1: overall + `intro`/`discovery`/`objection`/`close` stage scores 0–100, voice score, review flags) and a `call_scores` history row (`call_id, user_id, score, rubric, created_at`).
- Critical scores flag `needs_manager_review` — but **nothing records that a manager actually reviewed a call**. There is no `reviewed_by`/`reviewed_at` anywhere, so "calls needing review" cannot be cleared from a queue and "calls reviewed" (ROI) cannot be counted. This is the single biggest data gap for Sprint 4.
- `/calls/[id]` already has score display, transcript player and an assignments panel — a good host for a "Mark reviewed + assign coaching" action.

## 7. Permission / tenant safety notes

- `requireManager` middleware (`src/middleware/requireManager.ts`): allows `reps.tier ∈ {Manager, Owner, PartnerAdmin, SuperAdmin}`. Use it on every new `/v1/manager/*` route.
- `src/lib/permissions.ts`: `UserContext` (`role ∈ rep|office_manager|company_manager`, `office_id`, `company_id`, `is_admin`), `applyHierarchyFilters`, `isOfficeManager`/`isCompanyManager`. Used by dashboard KPIs and assignments manager routes.
- ⚠️ **Two parallel role systems coexist**: `reps.tier` (requireManager) and `UserContext.role` (hierarchy filters). The established Sprint 3 pattern is *requireManager for the gate + getUserContext/applyHierarchyFilters for data scoping* — new endpoints must use both, never invent a third.
- RLS Phase 1 is in place (`sql/20260609_rls_phase1.sql`); routes use the service-role client with explicit scoping, so **every new query must apply hierarchy filters explicitly**.
- Impersonation and audit logging (Sprint 3) flow through existing headers/middleware — reusing `requireManager` + `getUserContext` preserves them.

## 8. Reusable files / components

**API:** `requireManager.ts`, `permissions.ts` (`getUserContext`, `applyHierarchyFilters`), `resolveVisibleReps` + `buildRepControlCentreRow` (crm.ts), `assignmentsComplete.ts`, flags aggregation in `dashboard.ts`, `audit.ts`.

**Web:** `proxyFetch` (`src/lib/api.ts`, enforced by `npm run check:proxy`), shell (`app-shell`, `sidebar`, `navigation.ts` role gating), `workspace-tabs`, UI kit (`stat-card`, `status-badge` incl. `RiskBadge`/`ScorePill`, `section-card`, `filter-bar`, `empty-state`, `loading-skeleton`, `ai-insight-card`), `AssignmentsList`/`AssignmentsSummary`, `ScoreHistory`/`ScoreSparkline`.

## 9. Missing data fields

1. **Manager review record** — nothing stores that a call was reviewed (who/when/note). Required for review queue clearing and ROI. → one small additive table (see §11).
2. **Assignment `priority`** — not stored; derive in MVP (`high` if overdue or source score < 55) rather than migrate.
3. **Weakest skill per call** — derivable from `analysis_json` stage scores at read time; no migration needed.
4. **ROI fields** — none stored; computable from counts (reviewed calls × 20 min), no migration needed.

## 10. Risks

1. **Two role systems** (`tier` vs `role`) — copy the assignments-manager pattern exactly; do not gate on one and scope with the other inconsistently.
2. **`/coaching` page is a 1,168-line client component** with business rules embedded — moving rules server-side must be additive (feed it the new payload, delete client rules later) or the page breaks.
3. **Duplicate assignment paths** (`/v1/coach/assign` vs `/v1/assignments`) — new UI must use `/v1/assignments` only; `/calls/[id]` still reads the coach path (leave as-is this sprint).
4. **`dashboard.ts` endpoints vary in scoping rigour** (e.g. `flags/summary` and `company-weakness` are not hierarchy-filtered like `kpis`) — do not copy them blindly; the new aggregate must scope every sub-query.
5. **Stray empty dir** `src/app/crm/manager` exists in the **API** repo — ignore/remove, don't build into it.
6. **Large-file merge risk** — `calls.ts`, `assignments.ts`, `crm.ts` are big; add new code in a new `src/routes/manager.ts` rather than growing them.

## 11. Recommended architecture

Matches the suggested target; the audit confirms it fits the codebase:

- **Web route:** keep `/coaching` as the Manager Command Centre (already consolidated; nav already points there). No new top-level routes.
- **API:** new `src/routes/manager.ts` mounted at `/v1/manager`, gated by `requireManager`, scoped via `getUserContext`:
  - `GET /v1/manager/command-centre` — single aggregate in the agreed response shape, composed from existing query patterns (control-centre rep rows, assignments summary, flags/weakness aggregation) + rule-based health/risk logic server-side.
  - `GET /v1/manager/review-queue` — scored calls with `score_overall < 70` or any stage `< 50`, minus calls with a manager review record; includes `weakestSkill` derived from `analysis_json`.
  - `GET /v1/manager/roi` — reviewed-call counts × 20 min.
  - `POST /v1/calls/:id/manager-review` — added to `calls.ts` (it owns call access checks via `canAccessCall`).
- **DB (single additive migration):** `call_manager_reviews(id uuid pk, call_id uuid not null, manager_id uuid not null, company_id uuid, office_id uuid, status text default 'reviewed', note text, created_at timestamptz default now())` + indexes on `call_id`, `manager_id`, `created_at`. A table (not columns on `calls`) keeps `calls` untouched, preserves review history, and is trivially reversible.
- **Recommendations stay rule-based** server-side using the thresholds already agreed (red < 55, amber < 70, review < 70 or stage < 50, 20 min/review ROI). No new AI calls.
