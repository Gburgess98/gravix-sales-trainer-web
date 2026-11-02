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
