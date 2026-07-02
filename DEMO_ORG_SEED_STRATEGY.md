# Demo Org Seed Strategy — UFC Elite (Day 167)

**Decision: seed the UFC Elite demo org so the entire lighthouse demo runs from
one login (dana.white@ufcelite.demo). Do not switch logins mid-demo.**

## Recommended single-org demo target

- **Org:** UFC Elite Sales Team (company `bfb9604e…`, org `89f61a54…`)
- **Manager login:** dana.white@ufcelite.demo (office_manager, `office_id`
  null → company-scope fallback, verified Day 166/167)
- Core manager path is already Ready in this org: Command Centre, Review Queue
  (8 calls), Coaching Queue (15 flags), reps needing attention, call detail.

## Current gaps in the UFC org (from the Day 167 audit)

| Chapter | UFC Elite org | gravixbots dev company |
| --- | --- | --- |
| Whisperer sessions | 0 | 32 |
| Whisperer trigger moments | 0 | 31 |
| Call replay with Whisperer moments | 0 | present |
| AI trigger candidates | 0 | mined from dev data |
| Custom triggers (`whisperer_trigger_library`) | 0 (table has 0 rows total) | 0 |
| Queue-assigned sparring drills | 0 | 2 (`manager_review`-sourced) |
| Completed sparring proof rows | 0 | 0 matched anywhere |
| Sparring score trend rows | 0 | 0 |
| Uploaded call via Day 166 path | 0 | 1 (day166-test-call.m4a) |

All live Whisperer/proof data currently exists **only in the dev company** —
none of it is visible to dana.white.

## What to seed into the UFC org

1. **1 Whisperer session** (status `ended`, started within the last 30 days,
   stamped with UFC company/office scope).
2. **2–3 trigger moments** (`whisperer_triggers` rows with `segment_text`
   linked to that session — e.g. pricing objection, competitor mention).
3. **1 call replay with Whisperer moments** — link the session to an existing
   scored demo call so the replay panel has content.
4. **1 AI trigger candidate** — seed enough recurring segment text (≥2
   occurrences of a phrase pattern) so discovery mines a candidate naturally;
   do NOT insert decisions on its behalf.
5. **1 custom trigger** — one `whisperer_trigger_library` row created through
   the manager flow (or stamped with Dana's company scope), `enabled` set by
   the manager action, never auto-enabled by seed.
6. **1 queue-assigned sparring drill** — assignment with `manager_review`
   source for a UFC rep (e.g. Nate Diaz, the AT RISK rep).
7. **1 completed sparring proof row** — assignment completed with
   `matched_sparring_session_id` proof in `assignments.meta` (Day 155 shape).
8. **1 sparring score trend row** — a second proof-backed score so the trend
   panel has ≥2 points (trend needs at least two).
9. **Optional: 1 fresh uploaded call** as dana.white via the Day 166 upload
   path, proving upload → Review Queue live inside the demo org.

## Copy vs seed script

**Recommendation: extend the existing seed script (`npm run seed:demo`) with a
Whisperer/sparring-proof section** rather than hand-copying rows from the dev
company:

- Manual copy is fragile: session/trigger/segment rows carry tenant stamps
  (org/company/office) and FK chains (session → triggers → segments → call)
  that must all be rewritten to UFC ids.
- Seeded demo calls already age out ~8 July; a repeatable script re-seeds
  everything fresh (dates relative to run time) in one command.
- A script keeps the manager-approval gates intact: seed raw material
  (sessions, moments, segments), let discovery mine candidates live, and keep
  trigger creation/enabling as a scripted "manager action" clearly marked.

## Risk of using two demo logins

- Switching from dana.white to a gravixbots dev login mid-demo breaks the
  single-org story, shows internal dev data (real test artefacts, inconsistent
  naming), and undermines the multi-tenant isolation message.
- Two logins double the preflight surface (two orgs to audit before demo day).
- The dev company data was never curated for demo (32 ad-hoc sessions).

**Recommendation: seed the UFC Elite org and run the entire demo as
dana.white. Use the dev company only as an internal fallback, never live.**

## Day 168 update — visibility/scoping blockers fixed before seeding

The data-visibility blockers are fixed ahead of the seed build, so the UFC
seed script can now rely on scoped assignments and team pickers:

- Assignment queries use `applyOrgScope` (office → company fallback) and
  assignment creation stamps tenancy via the reps identity bridge — seeded
  assignments will be visible to Dana as long as reps carry UFC
  company/office stamps (they do).
- `/v1/team/users` is company-scoped — the upload rep picker shows only UFC
  members for Dana (15 live-proofed), so seeded reps appear correctly.
- One-off repair for the existing null-stamped rows:
  `npx tsx scripts/backfill-assignment-tenant-stamps.ts` (idempotent,
  dry-run verified; run before the demo so the 14 open assignments surface).

## Next action

Day 169: run the assignment-stamp backfill, then build the seed extension
(Whisperer session + moments + sparring proof for UFC Elite) and re-run the
Day 167 audit checklist.
