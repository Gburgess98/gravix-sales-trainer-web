# Glass system pilot — Home, Calls, Call Review

Branch `claude/glass-system-pilot` (from `claude/sparring-arena`). Staging only. **Not pushed, not deployed.**
Nothing outside these three screens was restyled except the global tokens listed below.

Screenshots: `screenshots/before/*` and `screenshots/after/*` (desktop 1440×900, mobile 375×812, same staging data).

## 1. Foundation (additive)

| Piece | Where | Notes |
|---|---|---|
| Design tokens `--ds-*` | `src/app/globals.css` | Deep navy `#070b13` background, opaque panel `#0d1422`, 3 text tiers, one primary blue, cyan highlight, thin borders |
| `ds-app-bg` | `globals.css`, used by `app-shell.tsx` | Navy + two very faint ambient washes (cyan, violet). No imagery, no animation. Replaces the old near-black + indigo glow app-wide |
| `ds-glass` | `globals.css` | Translucent + 14px blur. **Chrome only:** page headers, filters, summary cards, nav aside. Falls back to a solid surface without `backdrop-filter` and under `prefers-reduced-transparency` |
| `ds-panel` | `globals.css` | Opaque. Transcripts, lists, tables, detail |
| Brand scale | `globals.css` | `--color-brand-*` now alias **blue** instead of indigo, so every existing primary button/link on every page moves to the one blue accent. Violet is no longer a UI colour outside Sparring |
| Primitives | `src/components/ds/primitives.tsx` | PageShell (responsive container), PageHead, GlassCard, Panel, SectionTitle, Metric, Badge (status tones), `dsButton` primary/secondary/quiet, TabLinks, Segmented (filter), SearchInput, DataList/DataRow, EmptyPanel, ErrorPanel, LoadingRows |
| Pure model | `src/lib/ds-model.ts` | `callState`, `scoreTone`, `formatCallDate`, `formatDuration`, `greetingFor`, `coachingPriorities` (unit-tested) |

Accessibility: every text token is contrast-tested on every surface (page, panel, raised, glass, glass over the ambient wash, glass fallback) in `tests/unit/design-system.test.mts` (AA 4.5:1; highlight 3:1). Focus ring is the cyan highlight (`ds-focus`). `motion-reduce` variants on every transition/pulse. Status colours (red/amber/green) appear only on badges and score tones, never in the background.

## 2. Rep Home (`/dashboard`)

Answers, in order: *how am I performing → what should I do next → what did I do lately*.

| Before | After |
|---|---|
| Header with rank chip + tier chip | **Removed** (greeting + date only) |
| "Next Best Action" card | **Kept, simplified** → "Recommended next": title, one sentence, impact/time line, one primary button |
| "Needs attention" list | **Removed as a block.** Overdue is now a red badge on the assignment row; weakest-area signal is already the recommendation's detail |
| "Continue" row of 4 tiles (Browse calls / Assignments / Sparring / Upload) | **Removed** (all four are one click in the sidebar) |
| 3 stat cards (Voice score, Trend, Open assignments) | **Kept** as 3 Metric cards, plain-language notes |
| "View full progress →" button | Now a text link at the bottom |
| "Coaching detail" disclosure: weakest/strongest area, motivation quote, AI feedback + regression warnings | **Removed from Home.** Weakest area still drives the recommendation; the rest stays available through `/progress` and call reviews |
| — | **Added:** "Recent calls" (4 rows, from the existing `/v1/calls/paged`) |
| — | **Added:** "Assigned to you" (up to 3 open assignments, de-duplicated against the recommendation) |
| First-run: 3 onboarding cards + AI card | One recommendation card: "Upload your first call" |

No new endpoint; one extra read of `GET /v1/calls/paged?limit=4&scope=mine`.

## 3. Calls list (`/call-library`, Live Calls tab)

| Before | After |
|---|---|
| Header with search + Upload call | Title + subtitle + **one** primary (`Upload call`) |
| 3 filter-pill groups, "View" scope pills, "Filters" disclosure | One glass filter bar: search, status segmented (All/Scored/Processing/Failed), sort, scope (only when the server allows company calls). Reps/score/tags/score-band **collapsed** under "More filters" (state and handlers unchanged) |
| Card with 2-line AI summary, "Show more", tag chips, type chip, status dot, score pill, Open button | **Rows**: title, `date · duration` (rep name only in company scope), a badge only when it means something (Processing, Failed, Assigned, Needs review), score badge, chevron. Whole row opens the review |
| Plain-text loading / error | Skeleton rows; error panel with "Try again"; empty states for no calls vs no matches (with Upload call) |

Removed from rows: summary snippet + Show more, tags, call-type chip, status dot text for scored calls. Practice and Call Uploads tabs are untouched.

## 4. Call Review (`/calls/[id]`)

Reading order is now: result → three priorities → stage breakdown → transcript (+ pins) → linked records → technical details.

| Before | After |
|---|---|
| Header with score chip in the title; 6-pill sticky nav + keyboard hint | Clean header (title, rep · date · duration, actions). Pill nav replaced by a **desktop-only sticky aside** (score, status, duration, focus stage, trend, section links); stacks away below `lg` |
| "Call hero": ring + status + duration + model + file + summary + flags + "Why this scored" chips (strongest/weakest/fillers/voice) | **Result card**: score ring, verdict, summary, flags, manager note. Model, file, status/duration detail → Technical details. Strongest/weakest/filler/voice chips removed from the top |
| "Review audit": 4 stages each showing evidence + implication + criteria at once; separate "Where this call lost points"; "What to practise next" box | **Top coaching priorities** (3 lowest stages with their own coaching note, Practise / Assign drill per row, one "Practise this next" button) then **Stage breakdown**: score bar + verdict per stage with *Evidence and coaching* collapsed per stage. The duplicate "what to practise next" box is gone |
| Transcript card (grey) | Opaque `ds-panel`; key moments, segments and empty states unchanged |
| Player, Pins, Whisperer moments, Coach, CRM cards | Unchanged panels, kept after the transcript |
| Voice Personality Score, Scoring transparency (two disclosures), objection matches, v2 provenance | Moved inside one collapsed **Technical details** at the bottom |

Unchanged: every request (the Day 46 request fixture still matches), manager gating, drawers, `c`/`a` shortcuts, panel URL state, processing/failed banners.

## 5. Deliberate pin changes

Legacy validators pinned the old markup. Updated on purpose (each still has non-vacuous mutation proofs): Day 45 shell-navigation (Home no longer has a disclosure/attention block; one more allowed read), Day 46 call-review guard (new wrapper/header/aside, 5-item nav), Days 195 and 203 (shell background / brand token now navy + blue).

## 6. Design debt — visual identity NOT approved

Hosted review verdict: the structure is approved for continued staging work, **the visual direction is not**. It is calmer and easier to scan, but still reads as a generic dark SaaS dashboard: glass, depth and the premium/futuristic Gravix identity are not coming through strongly enough, and some large empty areas feel unfinished rather than intentional. A dedicated visual-identity refinement pass is scheduled for later. Continued rollout (sections 7–9) is **not** approval of the current aesthetic; every screen below uses the same tokens and primitives, so that pass can restyle them in one place.

## 7. Call Review + Calls tabs (seams closed)

| Before | After |
|---|---|
| Player, Pins, Whisperer moments, Coach assignments, Linked records on legacy `SectionCard` (neutral-950, uppercase eyebrow, indigo accents) | Opaque `Panel` + `PanelHeader` (new primitive) with ds tokens; Whisperer type/urgency now `Badge`; inputs use shared `dsField`; every handler, request, id and gate unchanged |
| Practice tab: old header with its own search + ghost button, `SectionCard`, pill selects, pill chips | One `PageHead` for all three tabs (one action each), a single search bar, `Panel` with `DataList`/`DataRow`, score/XP as `Badge` |
| Call Uploads tab: bordered card per upload | Same `DataRow` list as Calls; "Open + link CRM" kept |

## 8. Manager Overview (`/coaching`, Overview tab)

Order now answers: how is my team → who needs me → what coaching is open → what is waiting → which way are skills moving.

| Removed / moved / collapsed | Why |
|---|---|
| Action row (Upload / Review Queue / Coaching Queue / Assign Sparring / AI Discovery + hint) → **removed**; Upload call + Review queue are two buttons in the health card | 5 jump links duplicated the tabs |
| 6 StatCards (Team Health, Average, Reviewed, Needing Review, Open, Overdue) → **one health card**: R/A/G badge, one plain sentence, 4 inline numbers | "Needing review" lives in the sentence/button, not a 5th box |
| "Today's priorities" block → **removed**; its three rows are now the first three panels | duplicated reps / overdue / reviews |
| **New:** Reps requiring attention (top 4, R/A/G badge, recommended action, row → `/crm/reps/:id`), Outstanding coaching (overdue first), Recent reviews, Skill trend | all from the existing command-centre payload |
| Everything else (coaching queue, skills + ROI, sparring, Whisperer, AI discovery, manager briefing, KPI row, rep breakdown, all-reps table) → **collapsed, unchanged** behind "Detailed queues and insights" | progressive disclosure; still legacy-styled inside, restyle in the visual pass |

Status language everywhere: green **On track**, amber **Needs attention**, red **At risk** (`src/lib/manager-model.ts`, unit-tested; thresholds <55 red, <70 amber, as before).

Honest limits: "Recent reviews" lists calls **waiting** for review (the only call list the command-centre returns; reviewed calls are a count). The one trend is the skill with the largest movement vs the previous 30 days (`weakestSkills[].delta`); there is no team-score time series in the existing API.

## 9. Team (`/team`)

| Before | After |
|---|---|
| 4 stat cards (members, seats allocated, seats available, scope setup) | One subtitle line (`5 members · 2 need attention · 5 of 8 seats in use`); over-allocation/setup shown only when true |
| Table: member / role / office / scope badge | Searchable list sorted needs-attention first: name + role · office, 30-day score, trend, coaching status, R/A/G badge, whole row → `/crm/reps/:id` ("View"). Mobile: two-line rows |
| No performance | Joined client-side from `GET /v1/manager/command-centre?days=30` and `GET /v1/dashboard/leaderboard` (30d and 90d), fail-soft |

Trend = 30-day average vs 90-day average (±3 pts), labelled in the footnote — it is a proxy, not a period-over-period series. Members with no scored calls show "No calls / No data". Still read-only; no new endpoints, no new fields.

## 10. Verification

Playwright (plugin tools + `tests/e2e/glass-manager.spec.ts`, fully mocked, fake local session): desktop 1440 and mobile 375, manager navigation, keyboard, overflow (incl. panels wider than viewport), console. Screenshots: `screenshots/manager/*`.

## 11. Manager Assignments (`/coaching?tab=assignments`)

`/assignments` (the signed-in user's own queue) is untouched.

| Before | After |
|---|---|
| Filter pills (Open/Overdue/Completed/All) + flat rows with two tiny text buttons ("From call →", "Rep →") + two buttons under the list | **Summary** (Open / Overdue / Completed), **one primary** "Create assignment" (→ existing `/admin/assignments/create`), quiet "Assignment manager" and Refresh |
| No search; status only | Search (rep, title, notes) + status segmented + **rep, type, due-date** selects, "Clear filters", "Showing x of y" |
| Rep shown only if the control-centre list happened to contain them | Rep names resolved from the roster (shared resolver); unmatched = "Team member", never an id |
| Origin/priority/notes inline on every row | Row = title, rep · type · due, evidence badge, status badge. **Details** disclosure holds created/due/completed, notes, evidence text, "Open call", "Open rep", "Open in assignment manager" |
| No in-list actions | **Mark complete** (two-step confirm) on open/overdue rows, via the *existing* `PATCH /v1/assignments/manager/:id` (`{status:'completed'}`); the API's ownership rule is unchanged and a refusal shows a clear message |
| Silent empty list on failure | Loading rows, empty state (with Create), no-match state, error state with retry |

**Not built, deliberately:** *reassign*. The manager PATCH accepts status, due date, title and completion proof only — not a new assignee — and adding that would be a new API capability. The Assignment manager link is the escape hatch. Evidence is shown only when the record carries it (persisted sparring completion proof, or a source call); otherwise "No proof attached yet."
The list is the latest 100 (API `limit=100`); the page says so when it is full. Legacy helpers (`ASSIGNMENT_FILTERS`, `assignmentOriginLabel`, …) remain in `coaching/page.tsx` because older validators pin their strings; they are now unused (lint warnings only).

## 12. Insights (`/crm/analytics`)

`/intelligence` is untouched.

| Before | After |
|---|---|
| Hero band + 5 KPI cards + a 4-signal band + 3 charts + 3 action cards (+ 6 export buttons) | Filter bar, **one lead card** (average score, labelled change, the one chart, latest/high/low), two panels (Coaching follow-through, Pipeline movement), one collapsed "Exports, definitions and next steps" |
| "Conversion by stage" bar chart | "Pipeline movement": ranked CSS bars; labelled a **count of stage transitions, not a conversion rate** |
| "Activity by rep" bar chart | "By rep": top 5 with completed/created bars, the rest behind a disclosure |
| — | **Coaching impact** sentence from the existing manager command-centre (team-wide; ignores the rep filter, and says so) |
| Failed fetch looked like "no data" | A non-OK analytics response is now an error state with retry; empty and loading states per section |

Labels: *average of daily review scores* (not call-weighted); *second half vs first half of range*; coaching follow-through counts CRM coaching tasks. **Sparring is not shown**: none of the analytics endpoints return it. Realtime refresh, the cache, rep/range filters, CSV exports and the PNG export of the score chart are preserved; PNG export of the two retired charts is gone.

## 13. Visual identity debt (still open)

Both screens deliberately reuse the provisional system, so the same notes apply: still a generic calm dark dashboard; glass is faint (the lead cards read almost like panels); bars and the area chart are default-looking; the Overview/Assignments tab strip and the `Manager Command Centre` header above Assignments are legacy-styled; Insights tick labels are raw ISO dates; many selects stack on mobile. Restyle in the dedicated identity pass via tokens/primitives.

## 14. Verification (Assignments + Insights)

**Mocked** (fake local session, mocked `/api/proxy`, Supabase hosts/sockets blocked): `tests/e2e/glass-assignments-insights.spec.ts` (16 checks: desktop + mobile, summary/list/filters/search, keyboard Details, two-step complete + 403 message, loading/empty/error, Insights sections/disclosure/range filter/empty/error, back/forward), plus the earlier manager and rep-identity specs (33 total), plus the Playwright plugin tools on a production build. **Real data:** none — nothing here was run against hosted staging or production.


## 15. Reviews (`/coaching?tab=review`)

Only the Review Queue tab body changed (`ReviewsPanel`, `reviews-model.ts`); the call-review screen, API calls and handlers (`GET /v1/manager/review-queue`, `POST /v1/calls/:id/manager-review`, the Assign coaching modal) are unchanged. `markReviewed` now returns success/failure so the panel can react; behaviour is otherwise identical.

| Before | After |
|---|---|
| One list titled "Calls Awaiting Manager Review"; rep names straight from the API ("Unknown rep"); reason chips; three equal-weight buttons | Summary (waiting, waiting 3+ days, score below 55, reviewed in 30 days) → search + score band / rep / age / sort → one queue. **Review call** is the only primary button; Mark reviewed and Assign coaching are quiet |
| Names from the API | Roster name > API name (never "Unknown rep") > "Team member"; UUIDs never shown, including while the roster loads |
| No reviewed view | Separate **Recently reviewed** panel: the 30-day count from the command centre, plus calls marked reviewed in this view ("Reviewed just now") |
| Raw error text | Loading rows, compact empty line, no-match with clear, full error with retry, partial error (queue works, totals show "—") |

**Honest limits.** The API has no due dates, SLAs, customer names or reviewed-call list. So: *age* is derived from the call date and "Waiting 3+ days" is a labelled heuristic, not an overdue state; the call title is the filename/title as stored; "Recently reviewed" cannot list earlier reviews (count only). The queue is capped at 25 lowest-scoring calls and says so. The Review Queue tab badge and Overview summary are unchanged.

**Debt.** Same provisional identity as §13; the `Manager Command Centre` header and tab strip above are legacy-styled; rows wrap to three stacked lines on mobile; Overview's collapsed legacy "Detailed queues" still has an older review list. A reviewed-call list needs an API addition (out of scope). `tsconfig` gained `allowImportingTsExtensions` (noEmit already on) so a model can import another with `.ts` and still run under `node --test`.

**Verification.** *Mocked:* `tests/e2e/glass-reviews.spec.ts` (16 checks: desktop + 375px, summary/rows/no UUIDs, filters/search/sort, empty/loading/full+partial error, open call → back → forward, keyboard Enter, mark reviewed + focus, assign modal, UUID-flash observer), 94 unit tests, plus Playwright plugin tools on a production build. *Real data:* none.

## 16. Rep Coaching + My Assignments (`/assignments`)

### Route map (audited from `src/config/navigation.ts`, `next.config.ts`, `src/app`)
| Rep-facing | Route | Notes |
|---|---|---|
| **Coaching** (primary nav) | `/assignments` | The only rep Coaching destination. Page H1 stays "My Assignments" (pinned by an e2e test); the shell breadcrumb says "Coaching". |
| My Assignments | `/assignments` | Same route and component — for a rep these are one workflow. |
| Home, Calls, Practice, Progress | `/dashboard`, `/call-library`, `/call-library?tab=sparring`, `/progress` | Untouched. Progress is the next phase and was not started. |
| Opened from a row | `/sparring/[persona]?assignmentId=`, `/calls/[id]?assignment=…&assignmentId=…`, `/call-library?assignment=…` | Link contracts unchanged. |

Not the same workflow: the manager's **Assignments** is `/coaching?tab=assignments` (team list, `GET /v1/assignments/manager`). A manager reaches their *own* queue at `/assignments` as "My Assignments" under More. There are no redirects in `next.config.ts` (headers only); `/rewards` → `/dashboard` is the only page-level redirect, and `/review` has no page.

**Boundary finding — fixed (follow-up commit):** a rep could open `/coaching` (More → "Command Centre") and saw the manager shell with `forbidden_not_manager`. The rep nav item is removed (every `/coaching` destination is now `roles: ['manager']`; managers still see Overview/Reviews/Assignments), and `/coaching` is gated: it asks `GET /v1/admin/config` (manager-only on the API) before rendering anything. 200 → Command Centre; 401/403 → `router.replace('/assignments')` (no history entry, so Back/Forward cannot loop); any other failure → a calm "Couldn’t check your access" retry, never a redirect and never manager UI. The gate is client-side because the role lives in the API, not in the session token; until it answers, only a neutral "Loading…" renders. Other manager-only pages (`/team`, `/crm/analytics`, …) were not changed.

### What changed
| Before | After |
|---|---|
| Streak/XP chips, progress bar, "Next Best Action" card, "Today's Focus" card, 5 StatCards, Open/Completed card walls | Summary (To do, Overdue, Completed 7 days) → **Do this first** (the top to-do or, if nothing is assigned, the feed's suggested drill) → one list with **To do / Completed** switch and type + due filters |
| Title/type/origin pill/`Band: …` line | Title, type · source · due state, why it was assigned, the manager's own note, status badge, **one primary action**: Start sparring / Review call / Pick a call / Mark complete (done rows: Review result when a real call is linked) |
| Raw `by rep`, raw errors (`request_failed_500`) | "by you", calm full/partial error states; a failed refresh keeps the list |
| View state lost on return | `?view=completed&type=…&due=…` via `replaceState` (no extra history entries), so back/forward and reload keep the view |

**Honest sourcing.** The rep API has no manager name and no feedback field. "From your manager" appears only when a manager id is present; "Created automatically" for auto-created rows; the manager's words appear only as the creation note (`meta.coaching_notes`); "Reviewed by your manager" only when status is literally `reviewed`; evidence only when the row carries sparring-session proof. Nothing says "feedback". The due state is calendar-day based (due earlier today = Due today; the old code could show a past date as "Due tomorrow"). "Weakest area", the suggested drill and the suggested call come from the rep's own `GET /v1/reps/:id/daily-feed` (repId taken from the assignments response); `/v1/reps/me` is no longer called here.

**Preserved:** `GET /v1/assignments`, `PATCH /v1/assignments/:id/complete` (optimistic, rollback, cross-tab refresh, local completed-days write), snooze (custom tasks, 24h), href contracts. Unknown assignment types: the API only creates `custom`, `sparring` and `call_review` (validated on create and by a DB check constraint), and `PATCH …/complete` does not check type, so completing any other type is not a documented contract. Mark complete is therefore offered for `custom` only; any other type gets a read-only **View assignment** disclosure (no request).
**Removed from this page (for the Progress phase):** streak chips/warnings, "Progress today" points, completion-rate and progress bar. `gst:completedDays` is still written on completion.

### Debt
Same provisional identity as §13. The priority card repeats the first list row (kept so the reason and action sit above the list); completed rows are text-only; no way to open a sparring result (no route); mobile stacks the quiet links; "Do this first" is a plain label, not designed. Legacy `Today's Focus`/streak copy is gone, so Day 202 pins were deliberately rewritten (mutation-checked).

### Verification
**Mocked:** `tests/e2e/glass-rep-assignments.spec.ts` (17 checks; rep session where the manager probe and all manager endpoints return 403): desktop + 375px, ordering, priority reason, one action per row, no manager controls/requests, no UUIDs (incl. a load-time DOM observer), To do/Completed, filters + URL state, Mark complete PATCH + rollback, snooze, open → back → forward, keyboard Enter, loading/empty/full/partial error. 105 unit tests. Playwright plugin on a production build. **Real data:** none — nothing was run against hosted staging or production. Legacy `tests/e2e/assignments.spec.ts` fails identically before and after (no auth session in that spec).

## 17. Rep Progress (`/progress`)

Route and nav are unchanged: rep **Progress** → `/progress` (a manager reaches the same page as "My Progress" under More). No other route was touched except one quiet **Your progress** link added to My Assignments' header (the streak/points that used to live there are now here).

### Audit — what each value is
| Value | Source | Status |
|---|---|---|
| Identity (id) | `GET /v1/reps/me` | live |
| Overall call score per call (summary, chart, period comparison) | `GET /v1/reps/:id/weakness-trends` → `trends.overall`, latest **100** calls | derived on request; no cache; `score_overall \|\| 0` on the API, so an unscored call arrives as `0` — the UI ignores 0s |
| Skill scores (Intro, Discovery, Objection handling, Closing) | same endpoint, per-stage series (unscored stages are omitted by the API) | derived on request |
| Current vs previous period | computed in the browser from those series (30 or 90 days; `±3` = steady) | derived, labelled with dates and call counts |
| Voice score | `GET /v1/dashboard/voice-score-trend?days=…&repId=<self>` (daily average from `call_scores.rubric`) | derived; direction via the existing `trendDirection` |
| Recently completed, completion counts, open count | `GET /v1/assignments` | live |
| Streak | `computeStreak` over `completed_at` (consecutive local days with a completed assignment) | derived client-side from live rows; not the old localStorage streak |
| Points | `GET /v1/reps/:id/xp` → `{ ok, repId, total_xp, last_event_at, warning? }` (sum of `xp_events`), parsed by the shared `xpFromResponse` | live; a `warning` (API could not read the table) or a non-finite total shows "unavailable", never 0 |
| Points today | **none** — no live endpoint returns it | not shown |
| Level name | `xpLevel` (100 points per level; names are cosmetic) | derived; labelled "calculated from points" |
| Suggested call / drill | `GET /v1/reps/:id/daily-feed` (`recommended_replay`, `recommended_drill`) | derived from the **latest call only**, rule-based text (not an LLM); the drill is shown only when its weakest area agrees with the period view |
| `gst:completedDays`, `gst:streakState`, snoozes | browser localStorage | local only — **not used** on this screen |
| Strongest area | **not returned by the API** (`daily-feed` never sends `strongest_area`) | unavailable from the feed, so computed from the stage series instead |
| Demo/cached flags, team rankings | none exist | not shown |

### Findings (not all fixed)
1. **Points were wrong on the web, and this document had the contract wrong.** `/v1/reps/me` is identity only (`{id,name,tier,company_id,office_id,partner_id}`), so any read of `.xp_total` from it is always empty. An earlier version of this section said XP lives at `/v1/assignments/me`; that is **false**: the handler is in `repsRoutes()` (assignments.ts), which the API never mounts, so the live answer is 404, and the mocked tests copied the same wrong contract. The real endpoint is `GET /v1/reps/:id/xp` (`total_xp`, `last_event_at`, tolerant `warning`). Progress uses it through the shared `xpFromResponse`/`xpPath` helpers (`src/lib/progress-model.ts`). **Home (`/dashboard`) does not show points** (verified: it reads `/v1/reps/me` for identity only); if a points tile is added it must use the same helpers. There is no points-today value anywhere, so none is shown.
2. **Voice trend was team-scoped for managers.** Without `repId` the endpoint returns the whole tenant for manager tiers; for a rep it is self only. Progress now always passes `repId=<self>`.
3. **API: `weakness-trends` and `daily-feed` authorise by organisation only** (`assertOrgScopeOr403` checks the requester and the target are in the same org, not that the requester is that rep or their manager), so a rep could request a colleague's series by id. The UI only ever requests the signed-in rep's id. Needs an API fix (self-or-manager); not changed here.
4. The old "Confidence" skill row was never a scored stage and is gone; stage slugs (`objection_handling`) are now mapped to labels everywhere, including the My Assignments weakest-area line (a real-data bug from the previous commit: the mock used display names).
5. History is the latest 100 calls; the page says "older calls are not included" when the API returns 100.
6. "Operating level: SalesRep" (the backend tier) was a role, not progress, and is no longer shown.

### What changed
| Before | After |
|---|---|
| Voice-score line chart, trend/level stat cards, a four-row "Skill Momentum" list driven by one call's weakest area, completed list, development panel with a progress bar | **Am I improving?** (one honest sentence, delta badge, a labelled current-vs-previous comparison, one chart only with ≥2 scored calls) → **Strongest and weakest skills** with a real per-skill period comparison and **What to work on next** (suggested call, Sparring, open assignments) → **Recently completed** (evidence only when the row carries sparring proof) → quiet **Practice and consistency** (completed 7/30 days, streak, points, level — each labelled) |
| No period control | 30 / 90 days, kept in `?range=`; the comparison is withheld when the previous period has no scored calls |

Empty/partial/error states: new user ("No scored calls yet" + Upload/Practise), older-history-only ("No scored calls in the last 30 days"), each section fails alone with a retry (score history, assignments, points, voice), and a full error only when identity cannot be loaded.

### Debt
Same provisional identity as §13. The chart is the generic blue area; skill rows are text with badges (no sparkline); the level/points block is plain text; strongest/weakest are recomputed in the browser and will differ from the feed's single-call "weakest area" (the drill is hidden when they disagree); no per-skill call links (the series carry no call ids); "Do this first" on Assignments and this page's next-action both exist (kept separate on purpose).

### Recorded, deliberately not fixed: shared manager-route guard
`/coaching` now has a client-side gate (§16), but `/team`, `/crm/analytics`, `/crm/manager`, `/crm/manager/contacts`, `/intelligence`, `/admin/settings` and the manager tabs have none: a rep who types the URL gets the manager chrome with 403s. A single shared guard (one hook/wrapper around the role check, used by every manager-only layout or route segment, rendering nothing until the API answers) is needed rather than per-page copies. The API still enforces every request.

### Verification
**Mocked:** `tests/e2e/glass-rep-progress.spec.ts` (17 checks; rep session, manager endpoints 403): desktop + 375px, improving / declining / new-user / older-history-only / partial / full-error states, 30↔90 day range + URL, next-action links, keyboard focus ring + Enter, back/forward, loading, truncation note, no UUIDs, no other-id requests, voice request scoped to self, no rankings; 117 unit tests; Playwright plugin on a production build. **Real data:** none — nothing was run against hosted staging or production, and none of the API findings above were reproduced against a live API.
