# Route inventory — read-only audit at `b845dea`

**Status: audit at `b845dea`, updated to record what `35f1208` resolved.** The original findings are preserved; each affected cell says *Found at b845dea* and *Resolved at 35f1208*. The audit itself changed no code. Findings come from code inspection of every `src/app` route and the navigation config, plus a local crawl of a production build using a fake signed-in **rep** and **manager** (mocked `/api/proxy`). The crawl shows what renders and which requests fire; it is **not** proof of real-data behaviour. Hosted staging was only checked signed-out; no signed-in hosted behaviour is asserted here.

**Scope:** 60 page routes (59 `page.tsx` files + the pages-router `/probe`) and 3 API route handlers. At `b845dea` there was no `middleware`, no per-segment `layout.tsx` guard, and (until `2d9a5f5`) no `error.tsx`. **At `35f1208` there are 15 guard layouts** (see *Resolved at 35f1208*).

## 1. Inventory

Visual: **Redesigned** (shared glass primitives) · **Partially redesigned** · **Legacy** · **Redirect stub** · **Diagnostic**. “Direct URL” is what a rep sees when typing the URL (crawl, mocked). Dispositions: Must redesign before release · Minor shared-style cleanup · Keep as internal/admin · Merge or remove · Permission fix required · No action. Where a row needs both a guard and a redesign, the disposition shown is the more urgent one (permission fixes first) and the other is in *Issues*.


### Entry and auth

| Route | Name | Role | How users reach it | Purpose | Visual | Data (real / derived / local / demo) | Direct-URL / permission | Overlap | Issues | Needed? | Disposition |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` | Landing (HomeLanding) | shared (public) | Open the site; honours safe ?redirect= | Signed-out landing with test hooks and shortcut links | Legacy | Local state + admin-config probe (derived manager flag) | Public by design | Duplicates /dashboard as an entry point; login lands on /call-library, not /dashboard | Broken link to /proxy/health (404); manager shortcuts decided by a client probe | Partly (needs a real signed-out page) | Merge or remove |
| `/login` | Login | shared | Auth redirect, signed-out users | Supabase sign-in | Legacy | Supabase auth | Public | Post-login target is /call-library while nav "Home" is /dashboard; OAuth goes /auth/callback → /recent-calls → /call-library | None seen | Yes | Minor shared-style cleanup |
| `/auth/callback` | OAuth callback | shared | Google OAuth redirect | Completes sign-in | Legacy | Supabase auth | Public | — | Hops through the /recent-calls redirect stub | Yes | No action |

### Rep primary

| Route | Name | Role | How users reach it | Purpose | Visual | Data (real / derived / local / demo) | Direct-URL / permission | Overlap | Issues | Needed? | Disposition |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/dashboard` | Home / My Dashboard | rep (manager: More → My Dashboard) | Nav: Home | Next action, 3 metrics, recent calls | Redesigned | Live: /v1/assignments, /v1/calls/paged, voice-score-trend; XP via /v1/reps/me is always 0 (endpoint has no xp) | Any signed-in user | Overlaps /progress (shared model) — intentional | Points read from the wrong endpoint (shows 0) | Yes | No action |
| `/call-library` | Calls · Practice · Call Uploads | shared | Nav: Calls / Practice (?tab=sparring); login landing | Browse scored calls, practice sessions, uploads | Redesigned | Live: /v1/calls/paged, sparring sessions/personas, assignments by-target | Any signed-in user; Company toggle decided per caller by the API | ?tab=upload overlaps /upload (list vs create); ?tab=sparring overlaps /sparring | None seen | Yes | No action |
| `/calls/[id]` | Call review | shared | Rows in Calls, Reviews, assignments, replay links | Transcript, score, pins, whisperer, coaching, CRM link | Partially redesigned | Live: /v1/calls/:id, scores, pins, assignments; manager extras behind a manager check | Any signed-in user; API enforces ownership/scope | /review/[callId]/timeline redirects here | Remaining sections (transcript, score blocks) still legacy styled | Yes (core flow) | Must redesign before release |
| `/upload` | Upload a call | shared (utility) | Nav: Upload Call (all roles) + buttons everywhere | Signed-upload → finalize → job/call polling (contracts unchanged) | **Redesigned** (upload redesign) | Live: /v1/upload/signed, /finalize, jobs/:id, calls/:id | Any signed-in user; call is owned by the uploader (stated on the page); visibility per org setting, shown before submit | Only create-upload screen; `/call-library?tab=upload` is the history. Header "Upload" link in HeaderClient remains: it renders for signed-in users on non-shell routes (`/health`, `/dev/*`) so it could not be proven unused | Glass design system; single workflow, staged progress, resume after refresh | Yes (core flow) | Real staging verification outstanding (mocked Playwright only) |
| `/assignments` | Coaching / My Assignments | rep (manager: More → My Assignments) | Nav: Coaching (rep) | Own coaching queue, priority, completion | Redesigned | Live: /v1/assignments, daily-feed; local snooze | Any signed-in user (own rows only) | Manager equivalent is /coaching?tab=assignments (different workflow); /admin/assignments is the manager lane | Link /assignments/${id} on /crm/overview has no route (404) | Yes | No action |
| `/progress` | Progress | rep (manager: More → My Progress) | Nav: Progress | Trend, skills, completed, points/streak | Redesigned | Derived: weakness-trends (latest 100 calls), voice trend (repId=self); live: assignments, /assignments/me | Any signed-in user; own id only in UI; API scope gap (org-only) noted | Home shows the same model | — | Yes | No action |

### Manager primary

| Route | Name | Role | How users reach it | Purpose | Visual | Data (real / derived / local / demo) | Direct-URL / permission | Overlap | Issues | Needed? | Disposition |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/coaching` | Manager Overview / Reviews / Assignments (Command Centre) | manager | Nav: Overview, Reviews, Assignments (?tab=) | Team health, review queue, team assignments, interventions, replay, whisperer admin | Partially redesigned | Live: command-centre, review-queue, assignments/manager, whisperer-trigger-* | ManagerGate (API decides); reps → /assignments, no flash | Rep "Command Centre" entry removed; /crm/manager/control-centre redirects here | Overview/Reviews/Assignments redesigned; Interventions, Replay and whisperer-admin sections and the page header are legacy | Yes | Must redesign before release |
| `/team` | Team | manager | Nav: Team | Roster, performance, coaching status | Redesigned | Live+derived: /v1/team/members, command-centre, leaderboard (30d vs 90d) | Found at b845dea: self-handled (a rep fired 1 manager request before the panel). **Resolved at 35f1208:** `RoleGate` manager in `team/layout.tsx`; no request before the decision. Original: Self-handled: reps get an "available to managers" panel (still issue 1 manager request); no shared guard | Overlaps Settings → People & access (read-only roster summary); overlaps /crm/manager title "Team" | Request fired by a rep before the 403 is shown | Yes | No action *(was: Permission fix required at b845dea; guard resolved at 35f1208)* |
| `/crm/analytics` | Insights | manager | Nav: Insights | Score trend, coaching impact, pipeline movement | Redesigned | Live+derived: /v1/crm/analytics/*, command-centre | Found at b845dea: NO guard: a rep gets the full page chrome and 2 manager requests (403s) **Resolved at 35f1208:** `RoleGate` manager via segment layout. | — | Rep sees manager-only page shell | Yes | No action *(was: Permission fix required at b845dea; guard resolved at 35f1208)* |
| `/crm/manager` | Manager Centre (page title "Team") | manager | Nav: More → Manager Centre; Settings → People & Coaching links | Rep overview, auto-assign run/preview, team settings | Legacy | Live: /v1/crm/manager/overview, auto-assign, settings (per-org team_settings) | ManagerGate (fixed in 2d9a5f5) | Name mismatch: nav "Manager Centre" vs page "Team" vs nav "Team" (/team); second settings store overlaps admin_config | Hosted crash fixed; legacy styling; hosted x-org-id errors likely on its calls | Yes | Minor shared-style cleanup |
| `/crm/manager/contacts` | Contacts (manager) | manager | Nav: More → Contacts | Contact triage: overdue actions, health, ownership | Legacy | Live: /v1/crm/contacts* (needs valid x-org-id) | Found at b845dea: NO guard: reps see the page and raw `forbidden_not_manager` text **Resolved at 35f1208:** `RoleGate` manager via segment layout. | Overlaps /crm/accounts (contacts inside accounts) | Raw backend error text; disabled "Backend endpoint not yet available" button; x-org-id failures on staging | Yes | Must redesign before release *(was: Permission fix required at b845dea; guard resolved at 35f1208)* |
| `/crm/manager/nudges` | Manager Nudges | manager | Linked from /crm/overview and /crm/reps/[id] only | Urgency-sorted nudges | Legacy | BROKEN: server component fetches /api/proxy without auth (raw `missing_user` for everyone locally); hosted falls back to localhost:3000 | Found at b845dea: NO guard **Resolved at 35f1208:** `RoleGate` manager via segment layout. | Overlaps /crm/manager nudge data and Team | Always fails: "Failed to load nudges — missing_user" | No | Merge or remove |
| `/crm/manager/auto-assign` | Auto-assign (redirect) | manager | Old links | Redirect → /crm/manager | Redirect stub | — | — | Folded into Manager Centre | — | No (keep redirect until links cleaned) | No action |
| `/crm/manager/auto-assign/runs` | Auto-assign runs (redirect) | manager | Old links | Redirect → /crm/manager | Redirect stub | — | — | Folded into Manager Centre | — | No | Merge or remove |
| `/crm/manager/auto-assign/runs/[run_id]` | Auto-assign run (redirect) | manager | Old links | Redirect → /crm/manager | Redirect stub | — | — | Folded into Manager Centre | — | No | Merge or remove |
| `/crm/manager/control-centre` | Control Centre (redirect) | manager | Link on /crm/manager | Redirect → /coaching | Redirect stub | — | — | Duplicate of /coaching | Dead-end "Open Control Centre" button on /crm/manager | No | Merge or remove |
| `/crm/reps/[id]` | Rep detail | manager | Team rows, links from assignments/calls | 90-day snapshot, activity, coaching, nudges | Partially redesigned | Live+derived: /v1/crm/reps/:id, actions, nudges; name from roster | Found at b845dea: NO guard: rep can open; shows "Team member" heading and fires manager requests **Resolved at 35f1208:** `RoleGate` manager via segment layout. | /reps/[id] redirects here | Heading/identity fixed; body still legacy; non-managers hit 403s | Yes | Must redesign before release *(was: Permission fix required at b845dea; guard resolved at 35f1208)* |
| `/intelligence` | Intelligence | manager | Nav: More → Intelligence; Settings → AI & Intelligence cards | Context Engine, Scorecard Studio, Objection library | Legacy | Live: /v1/intelligence/* (manager-gated, company-scoped) | Found at b845dea: NO page guard: reps see the shell; tabs show calm gate states **Resolved at 35f1208:** `RoleGate` manager via segment layout. | Now also reachable from Settings; two entry points (More + Settings) for one workspace | "← Settings" link added; legacy header | Yes | Minor shared-style cleanup *(was: Permission fix required at b845dea; guard resolved at 35f1208)* |
| `/admin/settings` | Settings hub | manager | Nav: More → Settings | General, People, AI, Calls & privacy, Coaching & scoring, Gamification, System | Redesigned | Live: org-settings, admin/config, users/me, team/members, version/health | ManagerGate; reps redirected (verified locally) | Replaces the old two-card page; links to /team, /intelligence, /admin/personas, /crm/manager | admin_config is platform-wide (labelled) | Yes | No action |

### CRM

| Route | Name | Role | How users reach it | Purpose | Visual | Data (real / derived / local / demo) | Direct-URL / permission | Overlap | Issues | Needed? | Disposition |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/crm/overview` | CRM Overview | manager (renders for all) | No nav item; redirect target of /crm/Leaderboard and /crm/actions; many "Back" links | Legacy team snapshot, actions, nudges, assignment trust | Legacy | Live: control-centre, nudges, assignments/manager/trust, analytics | Found at b845dea: NO guard: a rep sees "Manager workspace" and 4 manager requests **Resolved at 35f1208:** `RoleGate` manager via segment layout. | Overlaps /coaching Overview + /crm/analytics + /dashboard | Link /assignments/${id} → 404; hub of legacy back-links | Questionable | Merge or remove |
| `/crm/accounts` | Accounts | shared (rep: My Accounts) | Nav: More → Accounts | Account list, activity, call history | Legacy | Live: /v1/accounts, /v1/crm/contacts | Any signed-in user; API scopes | Overlaps /crm/manager/contacts | Legacy PageHeader/cards | Yes (CLAUDE.md workspace nav) | Must redesign before release |
| `/crm/accounts/[id]` | Account detail | shared | Account rows | Account timeline, contacts, tasks, escalation, owner | Legacy | Live: /v1/accounts/*, crm contacts | Any signed-in user; calm "Couldn’t load this account" state | — | 2,188-line legacy page | Yes | Must redesign before release |
| `/crm/contacts/[id]` | Contact detail | shared | Contact rows, nudges | Contact health, actions, notes | Legacy | Server-side fetches to ${INTERNAL_API_BASE_URL ?? localhost:3000}; try/catch hides failure | Any signed-in user | — | Hosted: every fetch silently fails (ECONNREFUSED swallowed) → empty "(Unnamed)" contact; forwards a legacy x-user-id header | Yes | Must redesign before release |
| `/crm/pipeline` | Pipeline | shared (Mine/Team toggle) | No nav; links from /crm/tasks and /crm/overview | Opportunity board | Legacy | Live: /v1/crm/*, and /v1/admin/reps (unscoped, cross-tenant list) | NO guard; Team toggle visible to reps **Unchanged at 35f1208:** intentionally left open pending the CRM decision. | Overlaps Accounts; sibling of /crm/tasks | Calls the unscoped /v1/admin/reps; not in nav | Decision | Merge or remove |
| `/crm/tasks` | Tasks | shared | No nav; link from /crm/pipeline | Follow-ups | Legacy | Live: /v1/crm/activities | Any signed-in user | Sibling of /crm/pipeline; assignments overlap | Orphan-ish | Decision | Merge or remove |
| `/crm/import` | Import Contacts (CSV) | manager | No inbound links at all | CSV import with preview | Legacy | Live: crm contacts import | Found at b845dea: NO guard **Resolved at 35f1208:** `RoleGate` manager via segment layout. | Duplicate of /crm/contacts/import (the linked one is a stub) | Light-theme classes (bg-white) inside the dark app; orphaned | Yes (data entry) | Minor shared-style cleanup |
| `/crm/contacts/import` | Bulk Import (placeholder) | manager | Linked from /crm/overview | Placeholder: "Route fixed. Now wire your existing Bulk Upload UI" | Legacy | None | Found at b845dea: NO guard **Resolved at 35f1208:** `RoleGate` manager via segment layout. | Duplicate of /crm/import | Linked page is an unfinished stub with a ✅ dev message | No | Merge or remove |
| `/crm/Leaderboard` | Leaderboard (redirect) | shared | Old links | Redirect → /crm/overview (capital-L route) | Redirect stub | — | — | — | Redirects to a legacy page | No | Merge or remove |
| `/crm/actions` | Actions (redirect) | shared | Old links | Redirect → /crm/overview | Redirect stub | — | — | — | Same | No | Merge or remove |

### Sparring and live

| Route | Name | Role | How users reach it | Purpose | Visual | Data (real / derived / local / demo) | Direct-URL / permission | Overlap | Issues | Needed? | Disposition |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/sparring` | Sparring Arena | shared | Calls → Practice "Open Sparring Arena"; Practice tab | Pick a buyer persona | Partially redesigned | Mixed: real personas/leaderboard + "Preview with demo data" | Any signed-in user | Overlaps ?tab=sparring in /call-library | Labelled "SPARRING ARENA PROTOTYPE … demo data" in the product UI | Yes (core) | Must redesign before release |
| `/sparring/[id]` | Sparring session | shared | Arena, assignments (assignmentId=) | Live buyer conversation, scoring | Legacy | Live: /v1/sparring/*, /v1/personas | Any signed-in user; "Sparring session not found" calm state | — | 2,992-line legacy page; core practice flow | Yes (core) | Must redesign before release |
| `/sparring/personas/new` | Create persona | shared | Arena | Persona wizard | Legacy | Live: personas API (private personas; manager approval) | Any signed-in user | Overlaps /admin/personas (company tuning) | "PROTOTYPE" label in UI | Yes | Minor shared-style cleanup |
| `/whisperer` | Live Whisperer | shared | No nav item; links from /coaching, /calls/[id], /sparring/[id] | Live buyer-objection suggestions (Deepgram) | Legacy | Live: /v1/whisperer/*, /v1/listen | Any signed-in user | Listed in CLAUDE.md nav but absent from navigation.ts | Not discoverable | Release decision | Must redesign before release |

### Settings and admin

| Route | Name | Role | How users reach it | Purpose | Visual | Data (real / derived / local / demo) | Direct-URL / permission | Overlap | Issues | Needed? | Disposition |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/settings/profile` | My Profile | shared | Nav: More → My Profile; Settings → General | Own name, phone, time zone | Legacy | Live: /v1/users/me | Any signed-in user | Overlaps Settings → General (read-only) | Shows raw JS error text if the response shape is unexpected | Yes | Minor shared-style cleanup |
| `/admin/assignments` | Assignment manager (overview) | manager | "Assignment manager" button on manager Assignments | Create/queue/overview for assignments you created | Legacy | Live: /v1/assignments, /manager/* | Found at b845dea: Self-handled: rep sees an "You don’t have…" message **Resolved at 35f1208:** `RoleGate` manager in `admin/layout.tsx`. | Overlaps /coaching?tab=assignments (read) — this is the only create flow | 2,290-line legacy client | Yes | Must redesign before release |
| `/admin/assignments/create` | Create assignment | manager | Primary "Create assignment" button | Create flow | Legacy | Live | Found at b845dea: Self-handled **Resolved at 35f1208:** `RoleGate` manager in `admin/layout.tsx`. | Same client as above | Primary manager action is legacy | Yes | Must redesign before release |
| `/admin/assignments/queue` | Assignment queue | manager | Tab inside the manager lane | Queue view | Legacy | Live | Found at b845dea: Self-handled **Resolved at 35f1208:** `RoleGate` manager in `admin/layout.tsx`. | Duplicates assignments overview | — | Yes | Merge or remove |
| `/admin/personas` | Persona tuning | manager | Settings → Sparring card; Arena link | Company buyer config (style, objections, emotional tuning) | Legacy | Live: GET/PATCH /v1/admin/persona-config | Found at b845dea: NO guard: rep sees the editor + raw `forbidden_not_manager` **Resolved at 35f1208:** `RoleGate` manager via segment layout. | Overlaps /sparring/personas/new | Raw backend text for reps | Yes | Minor shared-style cleanup *(was: Permission fix required at b845dea; guard resolved at 35f1208)* |
| `/admin/reps` | User Management | manager | Linked from HomeLanding and the Pipeline owner picker only | List/create users, change tier | Legacy | Live but UNSCOPED: GET /v1/admin/reps (all tenants), PATCH /v1/admin/reps/:id, POST /v1/admin/users | Found at b845dea: NO guard: a rep sees the full create-user/tier UI (writes would 403 for non-managers; for managers they are cross-tenant) **Resolved at 35f1208:** `RoleGate` manager via segment layout. | Overlaps Settings → People & access and /team | Highest-risk page: UI over unscoped admin endpoints | Not until backend is tenant-scoped | Merge or remove *(was: Permission fix required at b845dea; guard resolved at 35f1208)* |
| `/admin/users` | Users (control plane) | admin (Partner/Super) | Nav: More → Users (PartnerAdmin+) | Partner-scope user list, impersonation | Legacy | Live: /v1/admin/partner/users, super/impersonate | Found at b845dea: NO guard: reps see the page + raw `forbidden_not_manager` **Resolved at 35f1208:** `RoleGate` partner via segment layout. | — | Raw backend text; nav hides it but URL works | Internal | Keep as internal/admin |
| `/admin/users/[id]` | User detail (control plane) | admin | Users rows | Edit user | Legacy | Live: /v1/admin/users/:id | Found at b845dea: NO guard: page body is just the raw string `forbidden_not_manager` **Resolved at 35f1208:** `RoleGate` partner via segment layout. | — | Raw backend text | Internal | Keep as internal/admin |
| `/admin/companies` | Companies | admin (Partner/Super) | Nav: More → Companies | Partner companies | Legacy | Live: /v1/admin/partner/companies | Found at b845dea: NO guard: raw `forbidden_not_manager` **Resolved at 35f1208:** `RoleGate` partner via segment layout. | — | Raw backend text | Internal | Keep as internal/admin |
| `/admin/companies/[id]` | Company detail | admin | Companies rows | Edit company | Legacy | Live: /v1/admin/companies/:id | Found at b845dea: NO guard: renders an editable-looking form with raw `forbidden` **Resolved at 35f1208:** `RoleGate` partner via segment layout. | — | Raw backend text | Internal | Keep as internal/admin |
| `/admin/partners` | Partners | admin (SuperAdmin) | Nav: More → Partners | All partners | Legacy | Live: /v1/admin/super/partners | Found at b845dea: NO guard: raw `forbidden_not_manager` **Resolved at 35f1208:** `RoleGate` super via segment layout. | — | Raw backend text | Internal | Keep as internal/admin |
| `/admin/score` | AI Scores / force-score | admin (SuperAdmin) | No inbound links (orphan) | Force-score a call | Legacy | Live: /v1/admin/scores, force-score (SuperAdmin) | Found at b845dea: NO guard: rep sees the tool + raw error **Resolved at 35f1208:** `RoleGate` super via segment layout. | — | Orphaned; uses raw `fetch("/api/proxy/…")` with no Bearer | Internal | Keep as internal/admin |
| `/admin/status` | Admin system status | admin | Linked from AdminStatusCard only | Two raw proxy links | Legacy | Diagnostic: /v1/admin/status (SuperAdmin), /v1/health | Found at b845dea: NO guard: any user sees links to SuperAdmin endpoints **Resolved at 35f1208:** `RoleGate` super via segment layout. | Overlaps Settings → System and /health | Light-theme link styling; overlaps System section | Internal | Merge or remove |

### Diagnostics, dev and redirect stubs

| Route | Name | Role | How users reach it | Purpose | Visual | Data (real / derived / local / demo) | Direct-URL / permission | Overlap | Issues | Needed? | Disposition |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/health` | Proxy Health | diagnostic | HomeLanding "Proxy Health" points at /proxy/health (404) | Raw proxy probe | Diagnostic | Diagnostic: /v1/health?debug=1 | Any signed-in user; prints raw body | Overlaps Settings → System | Broken inbound link; raw JSON body shown | No | Merge or remove |
| `/dev/scoring-v2-preview` | Scoring v2 preview (dev) | diagnostic | Typed URL only | Fixture-only call review preview | Diagnostic | Demo: bundled fixtures, "NOT A REAL CALL" | Any signed-in user in production | — | Dev page shipped to production | No | Merge or remove |
| `/dev/audio-test` | Audio test (redirect) | diagnostic | Typed URL | Redirect → /dashboard | Redirect stub | — | — | — | Leftover | No | Merge or remove |
| `/probe` | Pages-router probe (src/pages/probe.tsx) | diagnostic | Typed URL | "PROBE: pages router is live" | Diagnostic | None | PUBLIC (200 without a session) | Also src/app/page/probe.tsx (dead file) | Diagnostic left in the app; a second router in the project | No | Merge or remove |
| `/recent-calls` | Recent calls (redirect) | shared | OAuth callback, login, HomeLanding | Redirect → /call-library | Redirect stub | — | — | Extra hop | Fine, but three code paths depend on it | No | No action |
| `/rewards` | Rewards (redirect) | shared | Old links | Redirect → /dashboard | Redirect stub | — | — | Old arcade page | Day 231 removal | No | Merge or remove |
| `/reps/[id]` | Rep (redirect) | manager | Old links | Redirect → /crm/reps/:id | Redirect stub | — | — | — | — | No | No action |
| `/reps/[id]/sparring` | Rep sparring (redirect) | manager | Old links | Redirect → /crm/reps/:id | Redirect stub | — | — | — | — | No | Merge or remove |
| `/review/timeline` | Review timeline (redirect) | manager | Old links | Redirect → /coaching?tab=review | Redirect stub | — | — | — | — | No | No action |
| `/review/[callId]/timeline` | Review call timeline (redirect) | shared | Old links | Redirect → /calls/:id | Redirect stub | — | — | — | — | No | No action |
| `/_not-found` | 404 page | shared | Unknown URLs | Inline-styled 404 | Legacy | None | Public | — | Unbranded inline-styled 404 with no way back | Yes | Minor shared-style cleanup |

### API route handlers

| Route | Purpose | Disposition |
|---|---|---|
| `/api/proxy/[[...path]]` | Authenticated proxy to the API | Keep |
| `/api/ping` | Liveness ping | Keep |
| `/api/env` | Returns OPEN_ROUTES and NODE_ENV to anyone (no auth) | Remove or protect |

## Resolved at 35f1208 (shared `RoleGate`)
`35f1208` generalised the page-level `ManagerGate` into `RoleGate` (manager / partner / super; probes `/v1/admin/config`, `/v1/admin/partner/health`, `/v1/admin/super/health`) and applied it from segment `layout.tsx` files. Coverage: `admin/` (manager: settings, personas, reps, assignments*), `admin/users` + `admin/companies` (partner), `admin/partners` + `admin/score` + `admin/status` (super), `coaching`, `team`, `intelligence`, `crm/analytics`, `crm/manager`, `crm/overview`, `crm/reps`, `crm/import`, `crm/contacts/import`. Enforced by `tests/unit/route-guards.test.mts` (file-tree vs `navigation.ts`) and `tests/e2e/route-guards.spec.ts` (mocked roles). Mocked verification only; no signed-in hosted check yet. Details: `ROLE_GUARD.md`.

**Resolved:** all 18 unguarded manager/admin routes in section 3 (the four self-handling ones now also guard before any request). Raw `forbidden_not_manager`/`forbidden`/`missing_user` text no longer appears on guarded routes for a rep, because those pages no longer render for a rep.
**Not resolved by it** (still open in this inventory): the broken pages (nudges, contact detail), diagnostics, stub links, legacy redesigns, `/crm/pipeline` + `/crm/tasks` (deliberately open), `/admin/reps`’ unscoped endpoints (guarded, but hide it), the staging UUIDs, the proxy org lookup, and raw backend strings that can still appear on routes a *manager* may open (e.g. `/crm/manager/nudges` `missing_user`, `/settings/profile` JS error text).

## Resolved by the release-hygiene batch (after 35f1208)
Separate commit; no UUID migration, proxy change, redesign or CRM decision included.
- **Removed:** `/probe` (`src/pages/`), `src/app/page/probe.tsx`, stray `src/login/page.tsx`, `/api/env`, `/dev/audio-test`, and the unused `crm/import/ContactsImportClient.tsx`.
- **Gated:** `/dev/*` returns 404 in production unless `ENABLE_DEV_ROUTES=1` (the scoring-v2 preview spec runs with the flag); `/health` is a super-admin diagnostic (`RoleGate super`); `/admin/status` was already super-guarded.
- **Links fixed:** HomeLanding no longer links the 404 `/proxy/health`; the dead `/assignments/${id}` "Open" link on `/crm/overview` is removed; the overview now links `/crm/import`; `/crm/contacts/import` is a redirect to `/crm/import`.
- **Raw errors:** new `src/lib/friendly-error.ts`, applied to ~60 sites (call review, CRM pages, pipeline, tasks, manager centre, coaching, sparring, call library, whisperer, profile, OAuth callback, admin clients, nudges); raw tooltips removed. Guarded by `scripts/validate-no-raw-errors.mts` (non-vacuous) and a unit test.
- **Kept on purpose:** `/recent-calls` and `/crm/manager/control-centre` (still linked), and the other compatibility redirects (some are pinned by validators).
- Verification is mocked/local only; nothing here has been checked on hosted staging.

## 2. Answers to the specific questions

**Everything under More.** Rep: *Accounts* (`/crm/accounts`, legacy), *My Profile* (`/settings/profile`, legacy). Manager: *My Dashboard*, *Calls*, *Practice*, *My Assignments*, *My Progress* (all redesigned) plus *Accounts*, *Contacts* (`/crm/manager/contacts`), *Manager Centre* (`/crm/manager`), *Intelligence*, *Settings*, *My Profile*. PartnerAdmin/SuperAdmin additionally *Companies*, *Users*, *Partners* (control plane). Every nav `href` resolves to a real page; none is a redirect or 404. The problems are not broken nav links but (a) **who can open the URL** and (b) **legacy surfaces behind real nav entries** (Accounts, Contacts, Manager Centre, Intelligence, Profile, control plane).

**`/intelligence` and Settings.** Same route, now doubly reachable (More → Intelligence, Settings → AI & Intelligence cards, plus a “← Settings” link on the page). It is a manager workspace with **no page guard** (reps see the shell; the tabs show calm gate states because the API is manager-gated) and a legacy header. Recommendation: keep the route and one nav entry; treat it as part of administration (guard it, give it the admin header, keep the Settings cards as the discoverable entry), and drop the duplicate More entry once Settings is the agreed home.

**Team vs People & access.** `/team` is the operational roster (performance, coaching status; links to `/crm/reps/[id]`). Settings → People & access is a read-only *summary* of the same `/v1/team/members` (counts, seats) with a link back to Team. They do not conflict, but Team has no guard (a rep triggers a manager request before seeing the “available to managers” panel). Role changes/invitations must not be built until the admin endpoints are tenant-scoped (below). A third name collides: `/crm/manager` is titled “Team” while the nav calls it Manager Centre.

**Manager Centre vs `/coaching`.** Different jobs, confusing names. `/coaching` is the Command Centre (overview, review queue, team assignments). `/crm/manager` holds auto-assign controls and per-organisation team settings (a *second* store for streak/points that overlaps platform-wide `admin_config`). `/crm/manager/control-centre` redirects to `/coaching`, so the “Open Control Centre” button on Manager Centre is a redundant hop. Suggest renaming Manager Centre (e.g. “Auto-assign”) and eventually moving its settings under Settings → Coaching, but only after the settings-store question is decided.

**CRM Contacts and `x-org-id`.** `/crm/manager/contacts` and the CRM pages call `/v1/crm/*`, which require a valid org header. The cause is the staging organisation id (section 6). Separately, **contact detail and nudges are server components that self-fetch**: nudges *always* fails (`missing_user`, no auth is forwarded — verified locally) and shows that raw string; contact detail swallows every failure, so hosted it renders an empty “(Unnamed)” contact with no error. These need converting to client `proxyFetch` pages (the same fix as Manager Centre).

**Upload routes.** One create-upload screen: `/upload` (redesigned: one workflow, real limits — 50 MB, the API's documented maximum — staged progress, duplicate-safe retry). `/call-library?tab=upload` is the *list* of uploads, not a second uploader. A third entry is the legacy `HeaderClient` “Upload” link. Contact import has two routes: `/crm/import` (the real CSV tool, **no inbound links**, light-theme classes in a dark app) and `/crm/contacts/import` (the linked page, an unfinished placeholder: “Route fixed. Now wire your existing Bulk Upload UI”). The linked one is the stub.

**Settings sub-sections and linked destinations.** Settings links to `/team`, `/crm/manager`, `/intelligence?tab=…`, `/admin/personas`, `/settings/profile`, `/coaching?tab=review`; all exist. `/admin/personas` has **no guard** (a rep sees the full editor plus raw `forbidden_not_manager`). The hub itself is guarded and verified (mocked) for reps.

**Rep and manager assignments/coaching.** Rep: `/assignments` (nav “Coaching”). Manager: `/coaching?tab=assignments` (read/track, redesigned) + `/admin/assignments{,/create,/queue}` (the only *create* flow; legacy, 2,290 lines, self-gating for reps). Different workflows; the manager’s primary action (“Create assignment”) lands on a legacy page. `/crm/overview` links `/assignments/${id}`, which has no route (404).

**Old rewards, gamification, admin and diagnostics.** `/rewards` → `/dashboard` (fine). Still live: `/health` (raw proxy probe), `/dev/scoring-v2-preview` (fixture page reachable in production), `/probe` (a **pages-router** diagnostic, publicly reachable without a session; the project also carries a dead `src/app/page/probe.tsx` and a stray `src/login/page.tsx` outside `app/`), `/admin/status`, `/admin/score`, and the public `/api/env` which returns `OPEN_ROUTES` and `NODE_ENV` to anyone.

**Dynamic routes.** `/calls/[id]` (redesigned in part), `/crm/reps/[id]`, `/crm/accounts/[id]`, `/crm/contacts/[id]`, `/admin/users/[id]`, `/admin/companies/[id]`, `/sparring/[id]`, `/reps/[id]` and `/review/[callId]/timeline` (redirects). Rep and sparring ids are validated by the API; the pages show calm not-found/“couldn’t load” states except `/admin/users/[id]`, whose entire body for a rep is the raw string `forbidden_not_manager`.

**Filesystem routes absent from navigation (reachable only by link or URL):** `/crm/overview`, `/crm/pipeline`, `/crm/tasks`, `/crm/import`, `/crm/manager/nudges`, `/whisperer` (listed in the product nav in CLAUDE.md but not in `navigation.ts`), `/sparring`, `/admin/reps`, `/admin/personas`, `/admin/score`, `/admin/status`, `/admin/assignments*`, `/health`, `/dev/*`, `/probe`, all redirect stubs.

**Inappropriate nav/redirect targets.** `/crm/Leaderboard` and `/crm/actions` redirect to the legacy `/crm/overview`; login and OAuth land on `/call-library` (via `/recent-calls`), not Home; `HomeLanding` links `/proxy/health` (404, should be `/health`); “Open Control Centre” is a redirect to `/coaching`.

## 3. Manager-only routes and the direct-access weakness
> **Status: found at `b845dea`, resolved at `35f1208`.** The text below is the original finding, kept as evidence.

`/coaching`, `/admin/settings` and `/crm/manager` are guarded (`ManagerGate`). **At least 18 other manager/admin routes are not:** `/crm/analytics`, `/crm/manager/contacts`, `/crm/manager/nudges`, `/crm/reps/[id]`, `/crm/overview`, `/crm/pipeline`, `/crm/import`, `/crm/contacts/import`, `/intelligence`, `/admin/personas`, `/admin/reps`, `/admin/users`, `/admin/users/[id]`, `/admin/companies`, `/admin/companies/[id]`, `/admin/partners`, `/admin/score`, `/admin/status`. Four others self-handle (`/team`, `/admin/assignments*`). Effects seen in the crawl (mocked rep): manager chrome renders, 1–4 manager requests fire and are refused, and raw `forbidden_not_manager` / `forbidden` / `missing_user` strings appear on seven pages. The API refuses the data, so this is exposure of UI and error text, **except** `/admin/reps`, which presents a create-user / change-tier UI over endpoints that are not tenant-scoped.

**Recommendation: centralise it.** Page-by-page guards are exactly how `/coaching` was missed. Do it once:
1. A `RoleGate` (generalising `ManagerGate`) with a level: `manager` (probe `GET /v1/admin/config`), `partner` (`GET /v1/admin/partner/health`) and `super` (`GET /v1/admin/super/health`) — three existing endpoints that already return 200/403 by role, so no new API.
2. Apply it in **segment `layout.tsx` files** (`admin/`, `crm/manager/`, `crm/analytics/`, `team/`, `intelligence/`, `coaching/`, plus per-page for the individual `crm/*` manager pages), so a new page inside a guarded segment is protected by default. No URL changes; no route-group moves needed.
3. A unit test that reads `navigation.ts` and fails if any `roles: ['manager'|'partneradmin'|'superadmin']` href is not under a guarded segment (non-vacuous: plant an unguarded href).
4. Keep the API as the authority; the guard is for UI, redirects and error hygiene.

## 4. Counts by category
**Current (after `35f1208`):**

| Disposition | Routes | At b845dea |
|---|---|---|
| Must redesign before release | 13 | 11 |
| Permission fix required | 0 | 7 |
| Minor shared-style cleanup | 8 | 6 |
| Keep as internal/admin | 6 | 6 |
| Merge or remove | 20 | 19 |
| No action | 13 | 11 |
| **Total page routes** | **60** | 60 |

Reclassified because their only open problem was the missing guard: `/team` and `/crm/analytics` → No action; `/crm/manager/contacts` and `/crm/reps/[id]` → Must redesign (legacy core CRM); `/intelligence` and `/admin/personas` → Minor shared-style cleanup; `/admin/reps` → Merge or remove (hide until its endpoints are tenant-scoped).

| Visual system | Routes |
|---|---|
| Redesigned | 7 (`/dashboard`, `/call-library`, `/assignments`, `/progress`, `/team`, `/crm/analytics`, `/admin/settings`) |
| Partially redesigned | 4 (`/coaching`, `/calls/[id]`, `/crm/reps/[id]`, `/sparring`) |
| Legacy | 33 |
| Redirect stub | 13 |
| Diagnostic | 3 (`/health`, `/dev/scoring-v2-preview`, `/probe`) |

Guard status: **0 of the 18 manager/admin routes unguarded** (was 18). `/crm/pipeline`, `/crm/tasks`, `/crm/accounts*`, `/crm/contacts/[id]` and the other shared routes are intentionally open. Routes that are not themselves a navigation destination: 43 of 60. Public routes with no session: `/`, `/login`, `/auth/callback`, `/probe`, `/api/env`, `/api/ping`, `/_not-found`.

## 5. Smallest release-critical rollout
Release-blocking (item 1 is done; the rest remain), in this order:
1. ~~One shared role guard on the 18 unguarded manager/admin routes~~ — **done at `35f1208`** (mocked verification; `/admin/reps` is guarded but should still be hidden until its endpoints are tenant-scoped).
2. **Remove or protect the diagnostics:** delete `/probe` (and the pages-router/`src/login` strays), env-gate or delete `/dev/scoring-v2-preview`, protect or delete `/api/env`, hide `/admin/status`/`/health`.
3. **Fix the broken pages:** nudges (always fails) and contact detail (silent failure hosted) → client `proxyFetch`; `/proxy/health` and `/assignments/${id}` links; replace the `/crm/contacts/import` stub with the real importer (or remove the link).
4. **Staging organisation UUIDs** (section 6) so CRM/Contacts work on staging at all.
5. **The core call-to-coaching path still on legacy:** `/upload`, the remainder of `/calls/[id]`, `/sparring` + `/sparring/[id]` (and remove the “PROTOTYPE/demo data” labels), the manager **Create assignment** flow (`/admin/assignments/create`), and the rest of `/coaching`.
Everything else (CRM suite, Accounts, Manager Centre styling, Profile, control plane, redirects) can follow the final visual pass.

## 6. Recommended implementation order
1. ~~Shared `RoleGate` + segment layouts + the nav-coverage test~~ — done at `35f1208`.
2. Diagnostic/stray-file cleanup and redirect-target fixes (`/crm/Leaderboard`, `/crm/actions` → `/coaching` for managers or `/dashboard`; login landing → Home).
3. Convert nudges and contact detail from server self-fetch to client `proxyFetch`; remove the `x-user-id` header forwarding.
4. Staging data fix (parallel, not UI).
5. Core legacy flows: `/upload`, `/calls/[id]` remainder, `/sparring[/id]`, `/admin/assignments/create`, `/coaching` remaining tabs.
6. CRM: Accounts + detail, manager Contacts, rep detail body, then decide Pipeline/Tasks/Overview (see below).
7. Admin/control-plane and profile cleanup (shared styles only, raw errors replaced).
8. The dedicated visual-identity pass, last, on a settled route list.

## 7. Routes to remove or hide
- **Remove:** `/probe`, `src/app/page/probe.tsx`, `src/login/page.tsx` (stray, not a route), `/dev/audio-test`, `/dev/scoring-v2-preview` (or env-gate), `/crm/contacts/import` (placeholder), `/crm/manager/nudges` (or rebuild client-side), `/api/env`, `/rewards`, the three `/crm/manager/auto-assign*` stubs and `/crm/manager/control-centre` once their inbound links are removed.
- **Hide from non-admins / the product:** `/health`, `/admin/status`, `/admin/score`, `/admin/reps` (until tenant-scoped), `/crm/pipeline` and `/crm/tasks` unless CRM ships in this release, `/crm/overview` (fold into Overview/Insights; point its redirect sources elsewhere).
- **Keep redirect stubs** (`/recent-calls`, `/reps/[id]`, `/review/*`) until nothing links to them; they are harmless.
- **Decide:** `/whisperer` (core feature, undiscoverable) and the two sparring “prototype” screens.

## 8. Backend / configuration blockers (not UI work)
- Staging org/company/TMC ids are not RFC-4122 UUIDs, and `DEFAULT_ORG_ID` on the staging API is one of them (section 9).
- `admin_config` is a **platform-wide singleton**; any manager’s PATCH changes values for every tenant (UI now says “Platform-wide”). Needs a product decision (SuperAdmin-only, or per-organisation).
- Unscoped admin endpoints: `GET /v1/admin/reps` (all tenants), `PATCH /v1/admin/reps/:id`, `GET/POST /v1/admin/users`, `/usage` (org from first call row).
- `weakness-trends` / `daily-feed` authorise by organisation only, not self-or-manager.
- `/v1/reps/me` returns no points; Home still reads them from it (shows 0). XP lives at `/v1/assignments/me`.
- The proxy’s per-user org lookup is cookie-only while the browser authenticates with a Bearer token, so the org header is usually absent and the API falls back to `DEFAULT_ORG_ID`.
- Day 297 threshold columns missing in production (hub hides the control).
- `/v1/crm/manager/contacts` create path: the UI button says “Backend endpoint not yet available”.
- Deployment protection / hosted verification needs a staging QA login (operator step).

## 9. Fixing the staging organisation UUID problem without weakening validation
**Cause.** The API validates ids with the strict RFC-4122 pattern (`[1-5]` version nibble, `[89ab]` variant nibble) in `crm.ts`, `reps.ts`, `calls.ts`, `accounts.ts`, `pins.ts`, `users.ts`, `auth.ts`, `sparring.ts`, `tokenVerification.ts`. The staging fixtures created tenant ids as `00000000-2711-0000-0000-00000000000{1,2,3}` (TMC, org, company, and the synthetic rep `…0c`), whose nibbles are `0`/`0`, and Railway’s `DEFAULT_ORG_ID` has the same shape. So `getOrgIdHeader` rejects both the supplied header and the fallback: `Missing or invalid x-org-id`. This has **already happened once**: the Day 276 call ids were `…2722-0000-…` and were fixed by re-seeding as `…2722-4000-8000-…` with an idempotent cleanup of the invalid twins.

**Do not** relax the regex, accept the nil/zero-nibble forms, or lean on `ALLOW_ORG_BYPASS` / the all-zero UUID (that is a deliberate bypass, not a fix).

**Proposal (data + config, staging only):**
1. **New deterministic *valid* ids** in the same readable family, version 4 / variant 8: `00000000-2711-4000-8000-000000000001` (TMC), `…000002` (org), `…000003` (company), `…00000c` (synthetic rep). Still recognisable, now RFC-valid.
2. **Idempotent migration** in `sql/seed/staging-day272-fixtures.sql` (same pattern as the Day 276 call-id cleanup): insert the new tenant rows; repoint every reference (`reps.org_id/company_id/tmc`, `calls.org_id/company_id`, any `office`, `crm_*`, `admin`/audit rows carrying the org id) from the old ids to the new ones inside one transaction (deferred FKs); then delete the old malformed tenant rows. Because staging is disposable, the simpler equivalent is “re-run the seed against the new ids, repoint QA logins, delete the old tenant”.
3. **Update `scripts/provision-staging-qa.ts` and `prove-account-ai-actor-fk-day-283.mjs`** to the new ids, and re-run `staging:qa` so the QA reps’ `reps.org_id/company_id` use them.
4. **Set Railway staging `DEFAULT_ORG_ID`** to the new org id (config change, no code); redeploy not required beyond the env change.
5. **Guard against regression:** extend `validate-staging-fixtures-day-276.ts` to assert every id in the seed (and the QA constants) passes the API’s own predicate, with a non-vacuous case that plants a `…-0000-0000-…` id and proves it is rejected.
6. **Verify** (read-only first): count staging rows whose `org_id`/`company_id` fail the predicate (expect 0 after), then signed-in as the QA manager: CRM → Contacts loads without the error; the proxy forwards the real org (once the proxy looks it up from the Bearer identity, `DEFAULT_ORG_ID` stops mattering).
7. **Separately, harden the proxy** (code, not data): resolve the user’s `org_id` from the verified Bearer identity instead of the cookie-only session, so the correct org is forwarded and the env default is only a last resort.

Production tenants should already have real v4 ids; confirm with a read-only predicate query before any release rather than assuming.
