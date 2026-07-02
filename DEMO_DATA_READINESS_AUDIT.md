# Demo Data Readiness Audit — Day 167

**Demo org/user used:** UFC Elite Sales Team (company `bfb9604e…`, org
`89f61a54…`), manager login **dana.white@ufcelite.demo** (role
`office_manager`, `office_id` null → company-scope fallback from Day 166).
Audited via read-only Supabase reads + live browser walkthrough of
`/coaching` → Review Queue → call detail → `/upload`.

Legend: ✅ Ready · 🟡 Weak / empty but acceptable · ❌ Demo blocker

## Checklist

### Manager / org

| Item | Status | Evidence |
| --- | --- | --- |
| Demo manager user exists | ✅ Ready | dana.white + hunter.campbell, tier Manager |
| Manager has company_id | ✅ Ready | `bfb9604e…` on `users` row |
| office_id or company-scope fallback | ✅ Ready | office null; Day 166 fallback verified live |
| Manager can access /coaching data | ✅ Ready | Command Centre loads, no 500/missing_user |

### Reps

| Item | Status | Evidence |
| --- | --- | --- |
| 2–3+ reps | ✅ Ready | 11 SalesReps in demo company |
| ≥1 rep needing attention | ✅ Ready | 6 flagged (Nate Diaz AT RISK avg 45) |

### Calls

| Item | Status | Evidence |
| --- | --- | --- |
| 3–5+ calls | ✅ Ready | 9 scored in last 30 days (95 older) |
| ≥1 low-score call | ✅ Ready | 8 below 70 (lowest 45) |
| ≥1 call in Review Queue | ✅ Ready | Review Queue shows 8 |
| Call detail with score/rubric | ✅ Ready | **fixed today** — was 403 for demo managers |
| Call detail pins/transcript | 🟡 Weak | pins endpoint "forbidden" (shows "No pins yet"); seeded calls have no transcript/audio; "Weakest: Unknown" labels |
| Uploaded call from proof path | 🟡 Weak | day166-test-call.m4a exists but in the gravixbots dev company, not the demo org |

### Assignments / sparring

| Item | Status | Evidence |
| --- | --- | --- |
| ≥1 open assignment | 🟡 Weak | 14 open in DB but Command Centre "Open coaching" shows 0 (created outside 30-day window / source shape) |
| Queue-assigned sparring drill | ❌ Demo blocker (gap) | 0 in demo org — the two `manager_review`-sourced drills belong to the dev company. Honest empty state shown ("No queue-assigned sparring drills yet.") |
| Completed sparring proof row | ❌ Demo blocker (gap) | 0 proof rows (`matched_sparring_session_id`) anywhere; demo reps have 3 sparring sessions, none matched |
| Sparring score trend | 🟡 Weak | Honest empty state: "No proof-backed sparring scores yet." + guidance line present |
| Score breakdown by rep/drill | 🟡 Weak | Honest empty states ("Trends need at least two proof-backed scores.") |

### Whisperer / AI Discovery

| Item | Status | Evidence |
| --- | --- | --- |
| ≥1 Whisperer session | ❌ Demo blocker (gap) | 0 in demo org (32 exist in dev company) |
| ≥1 trigger moment | ❌ Demo blocker (gap) | 0 in demo org (31 in dev company) |
| Call replay with Whisperer moments | ❌ Demo blocker (gap) | none in demo org; panel shows calm empty state |
| ≥1 AI trigger candidate | 🟡 Weak | 0 candidates; Command Centre shows "No new AI trigger candidates yet." — but the trigger-library + candidate-decisions endpoints 500 for demo managers (null-office uuid bug, deferred to Day 168) |
| ≥1 custom trigger | ❌ Demo blocker (gap) | `whisperer_trigger_library` has 0 rows total |

### Upload

| Item | Status | Evidence |
| --- | --- | --- |
| /upload in sidebar | ✅ Ready | "Upload Call" under Workspace |
| Account/rep/call type/upload controls | ✅ Ready | all present with fallbacks |
| Account/rep picker contents for demo manager | 🟡 Weak | 1 account ("Cage Warriors") / 1 rep ("George") — scoped to the wrong company; free-text rep + temporary label keep it usable |
| Open Review Queue CTA | ✅ Ready | Day 165 success-state deep link (code-verified) |
| Uploaded call traceable | ✅ Ready | Day 166 live proof (dev company) |

## Live walkthrough result

As dana.white: `/coaching` loads with workflow strip (Upload Call → Review
Calls → Coaching Queue → Sparring → AI Discovery), Overview 10 / Review Queue 8
tabs, Coaching Queue with HIGH/MEDIUM items and recommended drills, Reps
Needing Attention, team snapshot. Review Queue → "Review Call" →
**403/empty page (first confusing/dead point — fixed today)** → after fix:
full call detail (45/100, summary, Mark Reviewed, Assign Coaching) → back to
`/coaching` → Queue-assigned sparring / score trend / AI Discovery all show
calm honest empty states → `/upload` renders the compact card with guidance
panel. Flow feels calm and understandable end-to-end.

## Blocker priority applied

1. Demo route / upload broken — none
2. Review Queue empty/broken — no (8 items)
3. **Call detail broken — YES → fixed (API `getRequesterOrgId` reps fallback)**
4. Coaching Queue empty/broken — no (15 flags)
5. Sparring proof empty — gap documented (honest empty states in place)
6. AI Discovery empty — gap documented (empty-state copy already matches plan)
7. Copy/UX confusion — minor items documented

## Recommended seed data needed

- Queue-assigned sparring drill + 1 completed drill with completion proof for a
  demo rep (unlocks trend + breakdown panels).
- 1 Whisperer session with 2–3 trigger moments linked to a demo call (unlocks
  replay + AI Discovery evidence).
- 1 custom trigger in `whisperer_trigger_library` (manager-approved, not
  auto-enabled).
- 1 fresh upload as dana.white so an uploaded call lives in the demo org.
- Re-run `npm run seed:demo` if demoing after ~8 July (seeded calls age out of
  the 30-day Review Queue window).

## Ready to demo?

**Yes for the core manager path** (Command Centre → Review Queue → call review
→ coaching actions) after today's fix. **Not yet** for the Whisperer / AI
Discovery / sparring-proof chapters of the story — demo those from the
gravixbots dev login or seed the demo org first.

## Day 167 — Official build day results

The sections above are the preflight checkpoint. This section records the
official Day 167 build work.

### Null-office endpoint patch (API) — FIXED

`applyLibraryScope` in `src/routes/manager.ts` filtered office managers with
`.eq("office_id", ctx.office_id)` with no null guard — for demo managers with
`office_id` null this emitted `.eq("office_id", null)`, a Postgres uuid error
(`invalid input syntax for type uuid: "null"`), 500-ing:

- `GET /v1/manager/whisperer-trigger-library`
- `GET /v1/manager/whisperer-trigger-candidate-decisions`
- `PATCH`/`DELETE /v1/manager/whisperer-trigger-library/:id`
- (silently skipping candidate suppression inside
  `GET /v1/manager/whisperer-trigger-candidates`, which is fail-soft)

Patched with the same rule as Day 166's `applyHierarchyFilters` fix: office
scope if `office_id` present, else company scope, else unscoped. The decision
POST/DELETE handlers already null-guarded correctly (`.is("office_id", null)`)
and were untouched. Tenant isolation preserved — the fallback never crosses
the company boundary for a manager who has a company.

**Related finding (deferred to Day 168):** `src/routes/assignments.ts` has the
same unguarded `.eq("office_id", managerContext.office_id)` in five places —
the most likely cause of "14 open assignments in DB but Command Centre shows
0" for demo managers.

### Pins audit — deferred, not needed for demo

`src/routes/pins.ts` enforces strict call *ownership* on GET/POST/DELETE
(`call.user_id !== requester` → 403), so a manager can never list or add pins
on a rep's call — this is why call detail shows "No pins yet" via the UI's
fail-soft. **Mark Reviewed + Assign Coaching are sufficient for the demo
path; pins are not required for the lighthouse demo.** A safe manager-pin fix
would replace the ownership check with the org-visibility rule used by
`canAccessCall` in `src/routes/calls.ts` (Day 167 reps fallback included) —
a behaviour change, not a tiny patch, so deferred.

### Upload picker audit — root cause found, deferred

- **Rep picker** (`GET /v1/team/users`, `src/routes/team.ts`): queries the
  `profiles` table with **no tenant scoping at all** — every profile in the
  DB is returned to any caller. This is the wrong-company rep leak, and it is
  also a tenant-isolation gap beyond the demo. Fix needs requester-derived
  company scoping on a schema-agnostic legacy endpoint → **Day 168**, not
  tiny.
- **Account picker** (`GET /v1/accounts`): code-side it IS company-scoped
  (`org_id = requester.company_id`, users → reps fallback). The wrong-company
  "Cage Warriors" result needs a live DB check of that account's `org_id`
  stamp — likely stamped to the dev company during earlier testing.
- Free-text rep + temporary account label fallbacks keep `/upload` usable for
  the demo today, so this is acceptable to defer.

### Seed strategy decision

**Seed the UFC Elite org; run the whole demo as dana.white.** Full strategy,
gap table and seed list in `DEMO_ORG_SEED_STRATEGY.md`. Key points: extend
`npm run seed:demo` (repeatable, fresh dates) rather than hand-copying
dev-company rows; keep manager approval gates intact (seed raw Whisperer
material, let discovery mine candidates; never auto-enable triggers or
auto-complete assignments).

### Next action

Day 168: seed-script extension for UFC Whisperer/sparring-proof data, fix the
five unguarded office filters in `assignments.ts`, and scope
`/v1/team/users`.
