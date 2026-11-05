# /calls/[id] — call review

One screen answers, in reading order: what happened → how it scored → what matters most → where in the transcript → what to do next → what a manager can do.

## Section audit (before → after)
| Section (`id`) | Before | After | Who sees it | Data |
|---|---|---|---|---|
| Header + actions (`Call actions`) | Glass | unchanged (one primary per role, `planReviewActions`) | Manager: Mark Reviewed / Assign Coaching / Assign Drill. Everyone: Link CRM, Copy link. Rep: Practise | live |
| Processing banner | Glass, one line | + honest guidance (updates by itself; failed → upload again) | all | live (`status`) |
| Result (`summary`) | Glass | + "written when the call was scored", scoring history sparkline | all | live (`summary`, `score_overall`, `/scores`); history = this call's re-scores |
| Top coaching priorities (`priorities`) | Glass | + "Derived from stage scores" | all; "Assign drill" manager only | derived from stage scores |
| Stage breakdown (`review`) | Glass | unchanged | all | live / v2 optional |
| **Key moments (`moments`)** | Legacy cards inside Transcript | **new section**: top 5 by importance, rest on request, timestamps jump | all | derived — `analysis_json.moments` (scoring); unavailable → calm copy |
| Call recording (`player`) | Glass | status-aware empty copy | all | live (`signedAudioUrl`, `/signed-audio`) |
| **Transcript (`transcript`)** | Legacy (neutral cards, 420 px scroll box) | one reading column, speaker turns, timestamp buttons, playing line highlighted, pins/moments marked in place | all | live (`analysis_json.transcript.segments` or text); unavailable → status-aware copy |
| Pins (`pins`) | Glass | + "Show in transcript" | all (own pins) | live |
| Whisperer moments (`whisperer-moments`) | Glass | outcome buttons unchanged (visible to all; the API decides — see below) | all / session owner or in-hierarchy manager marks | live |
| Coach assignments (`coach`) | Glass | status badge (Open/Completed) for everyone; **Delete manager-only**; labels never raw ids | all / manager deletes | live |
| Linked records (`crm`) | Glass | never shows an id | all | live |
| Technical details | Legacy neutral inside | design-system tokens | all | live / derived provenance |
| CRM + Coach drawers | Legacy neutral | design-system tokens; focus moves in on open and returns on close | all (Coach assign form: manager) | live |
| Not found / could not load | Emoji card / empty shell + banner | calm glass states; **could not load** is now distinct (retry) | all | — |

## Unchanged on purpose
Every request the page makes (frozen by `validate-call-review-simplification-day-46`'s fixture), the scoring logic, `?panel=crm|coach`, `?assign=1`, `?crm=1`, `?assignmentId`, the `c` / `a` shortcuts, `#transcript-seg-N` anchors, and the manager gate (`managerCheckDone && isManager`, API still authoritative).

## Authorisation evidence (API repo, read-only)
* **Whisperer outcome** — `PATCH /v1/whisperer/triggers/:id/outcome` (`src/routes/whisperer.ts`) calls `canMarkSessionOutcome`: allowed for the session's own user/rep, a platform admin, an `office_manager` of the session's office or a `company_manager` of its company; otherwise 403. It is **not manager-only**, so hiding the buttons from reps would remove something the API permits. UI restored to visible-for-all.
* **Assignment delete** — the page calls `DELETE /v1/coach/assignments/:id`. At the time of the first review that endpoint only required an identity (any signed-in user could delete any assignment). That was an API flaw, not a policy, so the UI was not made to match it. The API now enforces manager tier + verified-tenant scope (API commit `e35fc63`, `COACH_ASSIGNMENT_AUTHZ.md`), and the page's Delete (list) and Remove (Coach drawer) are manager-only again. Reps see each assignment's status (Open / Completed). Completion actions are not on this page; they live in the assignments list, whose `PATCH` is now assignee-or-in-scope-manager.
* **Deploy order:** API first (it only tightens), then this web change. A web build without the API fix would hide the button but leave the endpoint open.

## Judgement calls to confirm
* The side card repeating the overall score/status/duration was removed (the summary already leads with it); the section nav stays.
* Scoring v2 objections moved from collapsed Technical details into Stage breakdown (they are a finding, not metadata). Same data, same condition (`objections.length > 0`); provenance stays in Technical details.
* Two duplicated strings are not repeated: an objection's evidence quote when it is identical to the detected text, and "Not observed" as both a chip and a score.

## Scoring v2
Restyled with `Badge`, `dsButton` and `--ds-*` tokens (no `neutral-*`/`indigo-*`/`success-*`/`warning-*`/`danger-*` classes, no all-caps micro labels). Content, calculations, conditions, props, exports and handlers unchanged; no request added. Labelled: confidence pill (tooltip "Reported by criteria-level (v2) scoring"), "Objections detected — From criteria-level (v2) scoring", "Scoring detail · v2 provenance".

## Verification status
Mocked Playwright (`tests/e2e/glass-call-review.spec.ts`) and unit tests (`tests/unit/call-moments-model.test.mts`) only. Not verified against real staging calls, real audio, or real scoring output.
