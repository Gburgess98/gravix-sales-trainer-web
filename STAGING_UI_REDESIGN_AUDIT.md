# Staging UI Redesign — Phase 1 Audit & Information Architecture

Scope: WEB only, staging only. No production data or deployment is touched.
Status: DRAFT for product approval. Purpose/user columns marked *(inferred)* come from route names
and nav config only; the page was not opened. Verify before redesigning.

## 1. What already exists (do not rebuild)

| Brief item | Current state |
|---|---|
| Application shell | `src/components/shell/*` — sidebar (translucent, `backdrop-blur-xl`), topbar, mobile drawer, `SHELL_PATHS` gate |
| Role-aware navigation | `src/config/navigation.ts` + `nav-model.ts`; role gating via `hasAccess`; secondary items in labelled "More" |
| Page header | `layout/page-header.tsx` (title, subtitle, eyebrow, `actions` slot) |
| Buttons / badge / metric / panel / empty / skeleton / filter / disclosure | `components/ui/*` (`button`, `status-badge`, `stat-card`, `section-card`, `empty-state`, `loading-skeleton`, `filter-bar`, `disclosure`) |
| Colour roles | `globals.css` `@theme`: brand (indigo), accent (cyan), success, warning, danger; rules in `GRAVIX_DESIGN_SYSTEM.md` |
| Pilot screens | Home + Calls (Day 45, `d8fe745`), Call review (Day 46, `c62bc95`) — already simplified, with release-gate validators |

So Phases 2–3 are **partly delivered**. The remaining work is gap-filling plus Phase 4 screens.

## 2. Gaps against the brief

1. **Navigation model differs.** Brief: 5 items per role (Rep: Home, Calls, Practice, Coaching, Progress;
   Manager: Overview, Team, Reviews, Assignments, Insights). Current: sectioned list of ~7–10 items
   (Workspace / Coaching / Admin / Account) plus "More". CLAUDE.md "Current Navigation Direction" is a
   third variant. **Needs a product decision (§5-A).**
2. **No Progress destination.** `/rewards` is a redirect to `/dashboard` (Day 231). Rep "Progress"
   (trend, skills, badges) has no page; some content lives on `/dashboard` and `/reps/[id]`.
3. **No Reviews destination for managers.** Review queue is a tab inside `/coaching`; Reviews would be a new
   top-level route or a relabelled link — must not invent routes without approval.
4. **Tokens are colour-only.** No named type, spacing, radius, shadow, blur or motion tokens; surfaces use raw
   `neutral-*` utilities with ad-hoc opacity. Glass vs content-surface is not a named distinction, so
   transcripts/tables/forms are not guaranteed opaque.
5. **Missing components:** Tabs (only `workspace-tabs.tsx`, shell-specific), Drawer/Modal (page-local
   implementations on `/calls/[id]`, `CrmDrawer`, `QuickCreateModal`), Data row/table, Error-and-retry state
   (`ErrorBox.tsx` is unshared with `ui/`), Transcript turn, Coaching pin, Score breakdown, Trend chart.
6. **Contrast not verified.** `text-neutral-500` on near-black is used for eyebrow/secondary text; likely
   below AA 4.5:1 for small text. Needs a measured pass, not an assumption.
7. **Reduced motion:** sidebar honours `motion-reduce`; no global rule.
8. **Responsive:** sidebar becomes a drawer below `lg`; per-page tablet/small-laptop layouts not yet designed.

## 3. Route inventory (56 pages)

Legend — Primary action is the one dominant CTA we should end up with. "?" = unclear, flag before touching.

### Rep-facing
| Route | Purpose *(inferred)* | Primary action | Brief mapping | Notes |
|---|---|---|---|---|
| `/` | Landing/legacy header page | Sign in / enter app | — | Uses legacy header; `HomeLanding` |
| `/login`, `/auth/callback` | Auth | Sign in | Phase 4 (auth) | |
| `/dashboard` | Home (Day 45 pilot) | Recommended next action | **Rep Home / Manager Overview** | Serves both roles — confirm split |
| `/call-library` | Calls list (Day 45 pilot); also hosts `?tab=sparring` | Upload call | **Calls** | Sparring is a tab here — violates "tabs for related views" if kept |
| `/calls/[id]` | Call review (Day 46 pilot) | Role-based single action | **Call review** | Done; check against brief's 5-step flow |
| `/recent-calls` | ? likely duplicate of Calls | ? | ? | **Flag: purpose unclear** |
| `/upload` | Upload call | Upload | Shared utility | Has side-panel guidance (Day 161) |
| `/sparring`, `/sparring/[id]` | Practice list / session | Start practice | **Practice** | Feedback placement needs review |
| `/reps/[id]/sparring` | Rep's sparring history | ? | Practice | Overlaps `/sparring`? |
| `/assignments` | Assigned work | Open next task | **Coaching** (rep) / Assignments (mgr) | |
| `/coaching` | Command Centre (manager) | Upload Call | Manager Overview/Reviews | Hub of tabs: review queue, coaching queue, sparring, AI discovery |
| `/rewards` | Redirect → `/dashboard` | — | Progress | Dead end for Progress |
| `/settings/profile` | Profile | Save | Shared utility | |
| `/review/timeline`, `/review/[callId]/timeline` | Timeline review | ? | Call review | **Flag: overlaps `/calls/[id]`** |
| `/whisperer` | Live call assist | ? | out of 5-item nav | **Flag: user/role unclear** |

### Manager-facing
| Route | Purpose *(inferred)* | Brief mapping |
|---|---|---|
| `/team` | People/team management (read-only MVP) | **Team** |
| `/reps/[id]` | Rep detail | Team |
| `/crm/reps/[id]` | Rep detail (CRM variant) | **Flag: duplicate of `/reps/[id]`?** |
| `/crm/manager`, `/crm/manager/control-centre`, `/nudges`, `/contacts`, `/auto-assign*` | Coaching-workload / manager tools | Overview / Assignments; six routes — consolidate under pages, not nav |
| `/crm/analytics` | Observe team activity | **Insights** |
| `/crm/overview` | Intelligence Cockpit | Overview or Insights — overlaps `/dashboard` |
| `/crm/Leaderboard` | Leaderboard (capitalised route) | Insights / Progress |
| `/intelligence` | Context Engine + Scorecard Studio + Objections | Insights/Settings area |
| `/admin/assignments`, `/create`, `/queue` | Manager assignment CRUD | **Assignments** (overlaps `/assignments`) |

### CRM (secondary to brief; kept under "More")
`/crm/accounts`, `/crm/accounts/[id]`, `/crm/contacts/[id]`, `/crm/contacts/import`, `/crm/import`,
`/crm/pipeline`, `/crm/tasks`, `/crm/actions`. The brief's navs have no CRM slot. **Do not remove**; per
guardrails, relocate (e.g. account links from call review, a "More" entry) after approval.

### Admin / platform / dev (out of redesign nav)
`/admin/{companies,companies/[id],partners,personas,reps,score,settings,status,users,users/[id]}`,
`/health`, `/dev/audio-test`, `/dev/scoring-v2-preview`, `/_not-found`. Admin keeps current gating; `/dev/*`
must stay unlinked.

## 4. Duplicates and misplaced content to resolve (proposals, none actioned)

1. Calls: `/call-library`, `/recent-calls`, `/review/timeline` — one canonical list.
2. Assignments: `/assignments` vs `/admin/assignments*` — rep and manager views of one job.
3. Rep detail: `/reps/[id]` vs `/crm/reps/[id]`.
4. Home/Overview: `/dashboard` vs `/crm/overview` vs `/coaching` — three "start here" pages for managers.
5. Sparring reached from `/call-library?tab=sparring`, `/sparring`, `/reps/[id]/sparring`.

## 5. Decisions needed from product (blocking Phase 2/4 work)

**A. Navigation.** Adopt the brief's two 5-item role navs, or keep the current sectioned nav with relabelling?
Adopting means mapping: Practice → `/sparring`; Coaching → `/assignments`; Progress → *new page or
`/dashboard` section*; Reviews → `/coaching?tab=review` (or new route). Recommendation: adopt the brief's
labels via `navigation.ts` only (additive, no route changes), keep CRM/Admin under "More", defer a Progress
page until you approve a route.

**B. Most important three journeys** (brief lists them as an input but none supplied). Assumed:
(1) rep finds and understands latest call review; (2) manager spots who needs coaching and assigns;
(3) upload a call and track processing.

**C. Duplicate pages in §4:** redirect, merge, or leave.

**D. Inputs not yet provided:** staging URL, rep and manager test logins, brand assets/typefaces to
preserve (currently Geist + indigo), areas not to change. Test logins must be provided via the existing
staging QA tooling; I will not handle passwords in chat.

## 6. Proposed delivery order (small, reversible commits)

1. **Foundation** — add named tokens (type/space/radius/shadow/blur/motion, `glass` vs `content` surface
   classes) to `globals.css` `@theme`, aliasing current values so output is unchanged; global
   `prefers-reduced-motion` rule; contrast measurement script/report for text tokens.
2. **Shared components** — Tabs, Drawer, DataRow/Table, ErrorState (promote `ErrorBox`), TranscriptTurn,
   CoachingPin, ScoreBreakdown, TrendChart, each adopted by one existing page before generalising.
3. **Nav relabel** per decision A (+ `validate:shell-navigation` update).
4. **Pilot audit** — check Home, Calls, Call review against the brief's acceptance criteria; list deltas only.
5. Phase 4, one route group per commit: Manager overview/Team → Practice → Coaching/Assignments →
   Progress/Insights → Upload/Settings/Auth. Each with desktop+mobile before/after screenshots and
   `npm run check:release` (never `npm run build` while the dev preview is running).
