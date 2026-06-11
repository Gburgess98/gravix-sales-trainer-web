# Sprint 4 — Manager Demo Checklist

Quick pre-demo checks for the manager value loop (Command Centre → Review Queue → Call Detail → Mark Reviewed → Assign Coaching → back to Command Centre).

## Demo identities
- Manager (full visibility): `93023940-4d80-4229-b529-4b17ac04e2c7`
- Office manager (scoped, DEV_TEST_UID): `b817133a-44f1-4be3-89a1-6e6f6159c018`

## Lighting up trend chips (Weakest Skills ↑/↓)
Trends compare the current N-day window against the previous N days. Dev
stage-scored calls currently cluster around March–April 2026, so most windows
show "New this period". To show real ↑/↓ movement:

1. Upload and score 3–5 fresh calls (any rep in the dev office) via `/upload`,
   or re-score existing calls with `POST /v1/calls/:id/score`.
2. Once the current window has stage scores AND the previous window has
   matching data, chips switch to "↑ from N" / "↓ from N" automatically
   (threshold: ±3 points).
3. Quick check: `GET /v1/manager/command-centre?days=30` → `weakestSkills[].trend`.

## Pre-demo smoke (2 minutes)
- `/coaching` overview: Team Health populated, no error banners.
- Review Queue tab: items present; "Mark Reviewed" removes the call.
- Open a queue call → call detail shows score, Mark Reviewed, Assign Coaching.
- Mark Reviewed → "Reviewed ✓" with date; refresh the page — state persists.
- Assign Coaching → "Coaching assigned ✓"; assignment appears in the
  Assignments tab with "Assigned via review" and a "From call" link.
- ROI card: Calls Reviewed counts the reviews you just made (20 min each).

## Useful commands
- `npm run validate-sprint-4-day-96` (web) — workflow regression checks.
- `npm run db:backfill-calls` (api) — re-run if new dev calls lack office/company.
