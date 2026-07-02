# Lighthouse Demo Rehearsal — Day 170

**Date:** 2 July 2026 (Day 170)
**Demo org:** UFC Elite (Gravix Demo Company, `bfb9604e`)
**Login:** dana.white@ufcelite.demo (single login, office_manager, null office)
**Total demo time:** ~6 minutes walkthrough (comfortably inside the 7–10 minute target with live narration)

The rehearsal followed the lighthouse script: Manager Command Centre → Review Queue → assign coaching → sparring proof → Whisperer Insights → AI Discovery → Upload Call → close.

## Step-by-step results

| Step | Status | Notes |
|---|---|---|
| 1. Manager Command Centre (/coaching) | Ready | Workflow strip, Review Queue tab (8), Coaching Queue, reps needing attention (6), team snapshot all populated. No console errors. |
| 2. Review Queue | Ready (after patch) | Nate Diaz 45/100 top of queue, lowest-first. Call page opens with score, summary, Whisperer moments and Mark Reviewed / Assign Coaching. **Found:** `GET/POST /v1/calls/:id/manager-review` returned 403 for Dana (null-office manager) — patched (see below). Pins card still shows a raw "forbidden" string from an owner-only 403 (separate root cause, not patched today). |
| 3. Assign coaching / sparring | Ready | Coaching Queue prioritised (overdue first), recommended drills per rep, queue-assigned sparring card shows 1 open / 2 completed / 2 proof stored. |
| 4. Sparring proof / score trend | Ready | Proof-backed completions 2, avg 70%, best 78%, latest 78%. By-rep and by-drill breakdown render. Most improved rep: Nate Diaz (62 → 78). |
| 5. Whisperer Insights | Ready | 1 session / 3 triggers / 347ms avg latency, used rate 100%, usefulness by objection, top objection Price. No endpoint errors. |
| 6. AI Discovery | Ready | Send-me-info brush-off candidate (blind spot, confidence 84, 3 examples), "Manager approval required" gate clear, Partner approval custom trigger visible and enabled. |
| 7. Upload Call | Ready | One compact card: ownership (account + rep), context (call type/tag), recording. "What happens next" panel and demo tip visible. Calm and clear. |
| 8. Close | Ready | The loop story (review → assign → prove → discover) is fully demonstrable from one login. |

## First friction point

**Manager review 403 on the hero call (patched).** Opening the Nate Diaz 45/100 call as Dana, `GET /v1/calls/:id/manager-review` returned 403 `forbidden_out_of_scope`, and clicking **Mark Reviewed** (`POST`, same scope check) would have failed live in front of the client — a priority-1 broken action on the primary demo path.

Root cause: both manager-review handlers in `calls.ts` compared `String(call.office_id || "")` against `String(ctx.office_id || "x")`. For a null-office manager reviewing a null-office call (`""` vs `"x"`) this always 403s, even inside the manager's own company. This is the same null-office manager class fixed in `applyHierarchyFilters` (Day 166) and `applyLibraryScope` (Day 167), which is why the Review Queue *listed* the call but the review actions rejected it.

## Biggest visual/copy issue

Call identity on the call page: the header renders the raw UUID as a title ("3d26a918 D9a4 48c6 …") and queue rows show raw filenames (`demo-call-9.mp3`) repeated across different reps. Review Queue rows also all show "Weakest: Unknown". Not blocking, but weakens the "premium" feel — presenter should lead with the rep name and score, not the file name.

## Broken routes / console errors

- `GET/POST /v1/calls/:id/manager-review` → 403 for Dana. **Fixed today** (API patch, see below). Verified 200 in browser after patch.
- `GET /v1/pins?callId=…` → 403 for any manager (pins route is call-owner-only by design); the Pins card renders the literal string "forbidden". Separate root cause — recommended Day 171 fix.
- `GET /v1/calls/:id/signed-audio` → 500 for seeded calls (no audio object exists). UI degrades gracefully ("No audio available for this call"), so not demo-visible, but it is repeated network noise.
- Console: no errors. Only dev-mode warnings (Next.js sync `searchParams` warning on `/`, Supabase GoTrueClient multiple-instance notice).

## Patch made (single friction point)

API `src/routes/calls.ts`: added `managerReviewScopeAllows(ctx, call)` — a single-call mirror of `applyHierarchyFilters` (office manager → office scope, falling back to company scope when no office is assigned; company manager → company scope) — and used it in both the GET and POST manager-review handlers (same root cause, two call sites). Browser-verified as Dana: manager-review now 200, review state loads on the hero call.

## What not to show yet

- **Pins card** on the call page (renders "forbidden" for managers) — avoid pointing at it.
- **Review Bot / Voice Personality** panel — "No Review Bot breakdown has been generated" on seeded calls.
- **Transcript / Player tabs** on seeded calls — no transcript or audio artefacts exist.
- **Weakest Skills card** ("No skill data available yet") and **Estimated Manager Time Saved** (0s until calls are marked reviewed) — will populate live if Mark Reviewed is clicked during the demo.
- **Assignee dropdowns** include legacy dev users (`manager@gravix.com`, `rep1@gravix.com`, "George (Rep)") that carry the UFC company_id in the dev DB — data noise, not a scoping leak; consider re-homing before the real demo.

## Demo verdict

**Almost ready.** Every chapter of the story renders from one login and the walkthrough fits the time box. With the manager-review 403 patched, the primary flow (Command Centre → Review Queue → review → assign → proof → Whisperer → Discovery → Upload) is clean; remaining issues are presentational (pins "forbidden" text, filename/UUID call titles) and avoidable by the presenter.

## Day 171 update — pins "forbidden" fixed

The raw "forbidden" string on the call detail Pins card is gone. Two-part fix:

- **API:** pin *reads* now use the same org-scoped call visibility rule as
  signed-audio/transcript (`canAccessCall`, extracted to `lib/callAccess.ts`),
  so managers who can open a call can read its pins. Pin create/delete stay
  strictly owner-only. Out-of-org access still 403s (proofed with a random
  user id).
- **WEB:** the Pins card never renders raw API error strings — load failures
  fall back to the calm empty state "No pinned coaching notes yet.", and
  create/delete failures show fixed human copy.

Browser-proofed as Dana via Review Queue → Nate Diaz 45/100: no "forbidden"
text anywhere, pins request 200, score/summary/Mark Reviewed/Assign Coaching
and Whisperer Moments unchanged, console clean.

**Remaining caveats:** call title still shows the raw filename/UUID header;
"Weakest: Unknown" on queue rows; legacy `gravix.com` dev users in UFC
dropdowns; signed-audio 500 network noise on seeded calls (UI degrades
gracefully). None render error text on the demo path.

## Recommended Day 171 action

Fix the Pins card 403 for managers (either grant hierarchy-scoped manager read access on `/v1/pins` mirroring the review-queue rules, or hide the Pins card gracefully when the response is 403) — it is the last visible error string on the demo path. Secondary (if time): human-friendly call titles in the seed (rep + topic instead of `demo-call-9.mp3`) and re-home the legacy `gravix.com` dev users out of the UFC company.
