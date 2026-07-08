# PREMIUM UX AUDIT — Day 177

Whole-app UX/design audit of the WEB app at `158c11a`. Goal posture: **premium, calm,
simple, easy to navigate** — an enterprise coaching platform, not an arcade. Audit only:
no redesign shipped today; Day 178 carries the first implementation slice.

Method: code-level review of the app shell (`src/components/shell/*`, `src/config/navigation.ts`)
and the main routes — `/coaching`, `/upload`, `/call-library`, `/calls/[id]`, `/dashboard`,
`/assignments`, `/sparring/[id]`, `/crm/accounts`, `/crm/manager/contacts`, `/settings/profile` —
plus palette/emoji/animation scans across `src/app` and `src/components`.

---

## 1. Executive summary

The bones are good: a real app shell exists (sidebar + topbar + workspace tabs), the dark
neutral base is consistent, and the newest pages (`/upload`, the Day 161 coaching header)
show exactly the calm direction we want. But the app as a whole does not yet feel premium,
for four structural reasons:

1. **One page carries the whole product.** `/coaching` is a 4,100-line file whose Overview
   tab alone stacks 10+ modules (workflow strip, four priority cards, team snapshot,
   sparring snapshot, coaching queue, sparring queue, score trend, rep/drill breakdown,
   AI discovery, whisperer sessions). It is the single most overwhelming screen in the app.
2. **No colour system.** Raw Tailwind hues are used ad hoc: ~490 `red-*` usages, ~490
   `emerald-*`, ~390 `amber-*`, ~170 `cyan-*`, plus indigo, fuchsia, sky, violet. The
   primary CTA alone is rendered four different ways (indigo on `/upload` and `/coaching`,
   cyan on `/crm/accounts` and `/settings/profile`, white-on-black on `/assignments` and
   `/sparring/[id]`, emerald for active tabs). Premium products have one accent and a
   small semantic set; we currently have eight.
3. **Arcade energy in an enterprise product.** Emoji in product copy (🔥 🎯 ✨ 🎉 ⚔️ 🎧 🏆),
   a confetti toast on assignment completion, "Hard mode smashed." score toasts, an XP rank
   ladder from "Novice" to "Legend", streak flames on the dashboard. Individually small;
   together they read as a game, not a coaching platform a VP of Sales pays for.
4. **Navigation doesn't match the product.** Two sidebar items point at the same route,
   three links point at routes that don't exist, and a large part of the app (rewards,
   whisperer, recent-calls, the whole `/crm` sub-app: overview, pipeline, tasks,
   Leaderboard, control-centre) is reachable only by URL — exactly the
   "isolated/disconnected pages" CLAUDE.md says to reduce.

None of this needs a rewrite. The fixes are mostly deletions, consolidations and
convention adoption — small reversible patches, which is the house style.

---

## 2. Top 10 UX problems (ranked)

1. **`/coaching` Overview overload** — ~1,900 lines of modules on one scroll; every manager
   concern rendered at once. Needs an editorial diet: priority cards + coaching queue on
   Overview, everything else behind its existing tab or a dedicated sub-view.
2. **No unified colour/accent system** — four different primary-CTA treatments; eight accent
   hues; heavy red/amber alarm density on manager pages ("Rescue Queue", "Needs
   Intervention") makes the default state feel like an incident. Pick one accent + a
   restrained semantic set (success / warning / danger) and demote everything else to neutral.
3. **Gamification clashes with the premium brief** — emoji copy, confetti (`✨ 🎉 ✨` in
   `AssignmentsClient.tsx:977`), "smashed" toasts (`sparring/[id]/page.tsx:1188`), the
   Novice→Legend rank ladder and streak flames (`dashboard/page.tsx`). Keep the underlying
   XP/streak data; present it as quiet progress metrics, not fireworks.
4. **Dead and broken links in core flows** — `href="/sparring"` (no such route → 404) from
   the dashboard onboarding card, dashboard quick links, and `AssignmentsClient`;
   `/sparring/new` from `calls/[id]` (only `/sparring/default` is the supported shortcut).
   Broken links from the *first-run onboarding cards* is the fastest way to lose trust.
5. **Sidebar items that lie** — "Sparring" and "Calls" both link to `/call-library`, both
   highlight together, and "Sparring" lands on the *Live Calls* tab. "Settings" (Admin) and
   "My Profile" split settings across two places. The nav also diverges heavily from the
   target IA in CLAUDE.md (no Live section, no Replay Centre, no AI Feedback entry).
6. **Orphaned surface area** — `/rewards`, `/whisperer`, `/recent-calls`, `/review/timeline`,
   `/reps/[id]`, and ~15 `/crm/*` pages (overview, pipeline, tasks, actions, `Leaderboard`
   — note the capitalised route segment) are absent from navigation. Either promote,
   consolidate, or retire them; invisible pages still cost maintenance and confuse deep links.
7. **Layout inconsistency** — `PageContainer`/`PageHeader` exist but only `/dashboard` uses
   them. Everything else hand-rolls containers: full-width (`/coaching`, `/call-library`,
   `/calls/[id]`), `max-w-5xl` (`/upload`), `max-w-7xl` (`/crm/accounts`, `/sparring/[id]`),
   `max-w-2xl` (`/settings/profile`). Header scale drifts too (`text-2xl` on `/calls/[id]`
   vs `text-xl` elsewhere; kicker-label pattern on some pages, absent on others).
8. **Fake or dead UI erodes trust** — Skill Momentum bars render hard-coded widths
   (82/32/58% in `dashboard/page.tsx:170`), "updated just now" is static text, the topbar
   bell button does nothing, and `app-shell.tsx` ships `console.log` debug output on every
   page load. Premium means every rendered signal is real.
9. **Empty states are inconsistent and dead-endy** — the shared `EmptyState` is used in only
   7 files; `/call-library`, `/coaching`, `/assignments`, `/sparring` roll their own plain
   text. `/crm/accounts` shows "No accounts found." with no create action even though the
   page has a New Account button. A brand-new user's dashboard renders six placeholder
   modules in a row — calm would be one welcome module and three actions.
10. **Redundant CTAs create choice overload** — on `/coaching` Overview, Upload Call appears
    three times (header, workflow strip, sidebar makes four) and the Review Queue is
    reachable four ways from the same screen. One primary action per screen; the rest
    becomes quiet links.

---

## 3. Page-by-page notes

### App shell — sidebar / topbar (`src/components/shell/*`)
- Solid foundation: collapsible sidebar with hover-expand, mobile drawer, role-filtered
  sections. The 56px collapsed rail + 220px expanded width feel right.
- **Topbar bell is a placeholder** (no handler, no badge) — remove until notifications exist.
- Breadcrumb is a single label; on detail pages (`/calls/[id]`) it just says "Calls" with no
  back affordance or context. Acceptable for now, but detail pages should carry their own
  back link consistently (assignments' "← Back" currently goes to `/crm/overview`, a page
  not even in the nav).
- `app-shell.tsx:68-70` logs `reps/me response` + `userTier state` to the console in
  production — remove.
- Impersonation banner (fuchsia) is fine — a loud colour is *correct* for an unusual state.

### Navigation config (`src/config/navigation.ts`)
- "Sparring" → `/call-library` duplicates "Calls"; both active states light up together.
  Should deep-link a sparring tab (`/call-library?tab=sparring`) or get its own route.
- Section naming: sidebar says "Command Centre" under *Coaching*, the page calls itself
  "Command Centre", success screens call it "Manager Command Centre", and CLAUDE.md calls
  the same concept "AI Feedback"/"Replay Centre" territory. Pick one name.
- Target IA in CLAUDE.md (Workspace / Coaching / Live / Admin) is a good calm structure —
  current nav is partway there; Live (Whisperer) is entirely missing while the whisperer
  page exists as an orphan.

### `/coaching` (4,100 lines)
- Header (Day 161) is the best pattern in the app: kicker, title, one sentence, one primary
  CTA + one secondary. Keep exactly this.
- Overview tab stacks: manager-workflow strip, 4 priority cards, team snapshot, sparring
  snapshot, coaching queue, sparring assignments + completion proof + score trend + rep/drill
  breakdown, AI discovery, whisperer sessions, custom trigger library. Nobody can hold this
  in their head; the page scrolls for many screens and every module competes with amber/red
  badges.
- Tab labels "Replay Queue" vs "Review Queue" differ by one word and confuse — rename one.
- The workflow strip explains the product in dev-diary voice ("nothing is auto-created,
  auto-activated, or auto-completed") — reads as a changelog reassurance, not product copy.

### `/upload`
- **Best page in the app.** Single card, three labelled groups, calm right-rail explaining
  what happens next, honest processing states. This is the reference for premium-calm.
- Issues: the "Demo tip" panel leaks internal demo language to real users — remove or gate.
  Rep field shows both a picker *and* a free-text input simultaneously (pick one, reveal the
  other on demand). Primary CTA is indigo here vs cyan elsewhere.

### `/call-library`
- Hand-rolled tabs instead of `WorkspaceTabs`; hand-rolled search input style; no shared
  container. Three tabs (Live Calls / AI Sparring / Call Uploads) are fine, but there is no
  URL state — the sidebar cannot deep-link the sparring tab, which is the root cause of the
  duplicate nav item.
- Filter row on Live Calls (scope, status, score, rep, sort) is dense but functional; the
  ad-hoc empty copy ("No calls found yet.") should move to `EmptyState` with an Upload CTA.

### `/calls/[id]` (2,652 lines)
- Sticky section nav with score pill is genuinely good IA for a long document page.
- Noise: `text-2xl` title breaks the type scale; `zinc-*` classes mixed into a `neutral-*`
  app; keyboard-shortcut `<kbd>` hints in the section bar are power-user clutter; 🎧 emoji
  status banners; the post-action summary uses 🎯/⚠️/🔥 cards and "+XP gained"; "Preview
  Slack" dev tool renders whenever `NEXT_PUBLIC_SHOW_ADMIN=true`.
- Links to `/sparring/new` (unsupported — only `/sparring/default` special-cases).

### `/dashboard`
- Good: uses `PageContainer`, `StatCard`, `AiInsightCard`, real chart, structured briefing
  grid. The layout discipline is the best of the data-heavy pages.
- The fuchsia "AI Daily Briefing" block uses a fifth accent for the most prominent module;
  within one viewport the page shows fuchsia, amber, emerald, indigo, cyan and red.
- Arcade elements: rank ladder (Novice→Legend), streak 🔥 next to a number, XP gradient
  bar, italic "motivation message". Skill Momentum bars are hard-coded percentages — render
  real data or drop the bars and keep the ↑/→/↓ status only.
- Onboarding cards use emoji tiles (🎙️ ⚔️ 📋) and one of the three links 404s (`/sparring`).

### `/assignments`
- Functional and information-rich, but the most gamified page: streak pills (🔥), focus
  target (🎯), completion confetti (✨ 🎉 ✨), and a white-on-black CTA style unique to this
  page + sparring. "← Back" goes to `/crm/overview` (orphan page). No shared container or
  header pattern; page carries its own toast system instead of the global `ToastProvider`.

### `/sparring/[id]` (2,990 lines)
- The live drill loop itself is strong (turns, whisper hits, scoring, replay).
- Score toast copy "🔥 78/100 — Hard mode smashed." and win/lose framing is the arcade tone
  in its purest form; a rep's manager reads these scores. Calm alternative: "Scored 78/100 —
  strongest area: discovery."
- `max-w-7xl` container + own header style; ends of sessions push "Restart drill" in three
  different phrasings.

### `/crm/accounts`
- Dense but coherent. Cyan CTA + cyan search focus + red "Needs Intervention" chip — accent
  soup again. StatCards named "Rescue Queue" / "Unassigned" / danger variants make the
  default view feel alarmed; premium tone states facts ("3 accounts unassigned") without
  sirens. `EmptyState` used, but without a "+ New Account" action.
- Detail pages link onward into `/crm/*` orphan pages, so users fall off the navigable map.

### `/crm/manager/contacts`
- Uses the shared kit properly (`StatCard`, `FilterBar`, `EntitySearch`, `EmptyState`,
  `ScorePill`) — second-best pattern citizen after `/dashboard`. Main issue is reachability:
  manager-only nav item, and rep-facing contacts don't exist, so "Contacts" disappears
  entirely for reps.

### `/settings/profile`
- Simple and calm. Issues: section label "Editable" is developer-speak (say "Preferences");
  cyan CTA (fourth primary style); `/settings` has no index — the sidebar splits "Settings"
  (→ `/admin/settings`, managers only) from "My Profile", so reps have no Settings home.

---

## 4. Navigation issues (consolidated)

- Dead links: `href="/sparring"` ×3 (dashboard ×2, assignments), `/sparring/new` (calls).
- Duplicate destination: sidebar "Sparring" ≡ "Calls" → `/call-library`, wrong landing tab.
- Orphan routes (no nav entry): `/rewards`, `/whisperer`, `/recent-calls`, `/review/*`,
  `/reps/[id]`, `/crm/{overview,pipeline,tasks,actions,import,analytics*,Leaderboard,manager/*}`
  (*analytics is nav-linked for managers only*). `/crm/Leaderboard` is a capitalised route.
- Cross-links to orphans: assignments → `/crm/overview`; account detail → deeper CRM pages.
- Settings split across `/admin/settings` (manager) and `/settings/profile` (all); no
  `/settings` index.
- Topbar breadcrumb gives no hierarchy on detail pages; back-links are inconsistent
  (some pages none, assignments points at an orphan).
- Naming: Command Centre / Manager Command Centre / Coaching; Review Queue vs Replay Queue;
  Calls vs Call Library vs Live Calls vs Call Uploads. Each pair costs the user a decision.

## 5. Visual noise issues (consolidated)

- Emoji in product copy across dashboard, assignments, calls, sparring, rewards,
  ActivityFeed (🔥 🎯 ✨ 🎉 ⚔️ 🎧 📋 🏆 ⚠️).
- Confetti toast on completion; "smashed" score toasts; XP rank ladder + streak flames.
- Six accent hues in a single dashboard viewport; amber/red badge density on `/coaching`
  makes the resting state read as an emergency.
- Hard-coded skill bars, static "updated just now", dead bell button, console.log noise —
  fake signals are noise of the worst kind.
- `animate-pulse` used decoratively (10× on `/crm/overview`) rather than only for loading.
- Internal voice leaking into UI: "Demo tip" panel, "nothing is auto-created…" reassurance,
  "Free text still works for quick demos.", "Editable" section label.
- Three-plus entry points to the same action on one screen (upload, review).

## 6. Empty-state issues (consolidated)

- Shared `EmptyState` adopted in only 7 files; big pages (`/call-library`, `/coaching` tabs,
  `/assignments`, sparring) use bare text with no next action.
- Empty states rarely offer the one obvious CTA (accounts: no "New Account"; call-library:
  no "Upload"). Rule: every empty state names the one action that fills it.
- New-user `/dashboard` renders six placeholder modules ("Awaiting data" ×n) below the
  onboarding cards — placeholder-mode should collapse, not enumerate.
- Sparring/whisperer empty flows fall back to raw error-ish copy ("No response from server
  when loading sparring sessions.") where a calm "Nothing here yet" belongs.

## 7. Colour / theme issues (consolidated)

- No token layer; raw Tailwind hues everywhere (approx. usages: red 493, emerald 492,
  amber 389, cyan 167, indigo 77, fuchsia 55, sky 50, green 44, blue 20, rose 19…).
- Primary CTA appears as indigo, cyan, white-on-black, and emerald depending on page.
- Neutrals mix `neutral-*`, `zinc-*`, `black/40`, `bg-black` backgrounds inside cards.
- Radius scale drifts (`rounded-md`→`rounded-2xl` mixed within single pages); border
  opacities vary (`neutral-800` vs `neutral-800/80` vs `neutral-700`).
- Semantic colours are used decoratively (cyan = "info"? "brand"? "focus ring"?), so real
  warnings no longer stand out.

## 8. Recommended design principles

1. **Calm by default.** The resting state of every screen is neutral; colour appears only
   when something needs attention. If everything is amber, nothing is.
2. **One accent, three semantics.** Single brand accent (recommend standardising on indigo,
   already used by the newest pages) + emerald/amber/red reserved strictly for
   success/warning/danger. Everything else neutral.
3. **One primary action per screen.** Every page answers "what should I do here?" with
   exactly one prominent CTA; alternatives are quiet.
4. **Real data or nothing.** No hard-coded bars, no static "just now", no dead buttons.
   A premium UI never decorates with fake signals.
5. **Professional voice, no emoji.** Progress and scores stated plainly; celebration is a
   quiet check, not confetti. Keep the XP/streak *data*, drop the fireworks.
6. **Shared layout primitives everywhere.** `PageContainer` + `PageHeader` + `WorkspaceTabs`
   + `EmptyState` on every page; one container width policy (full-bleed workspaces, `5xl`
   forms, `2xl` settings).
7. **Navigation is the product map.** Every page is reachable from the sidebar or clearly
   nested under something that is; no dead links, no duplicate destinations, no orphans.
8. **Empty states teach.** Each names what will appear and offers the one action that
   creates it.
9. **Editorial density.** Each screen earns each module; anything that duplicates another
   screen gets a link, not a copy.
10. **Internal voice stays internal.** No demo tips, sprint references, or reassurance-about-
    our-own-code in user-facing copy.

## 9. Day 178 implementation plan

Small reversible patches, in priority order — each independently shippable:

1. **Fix dead links (tiny, high trust-impact).** Point `href="/sparring"` and
   `/sparring/new` at working destinations (`/call-library?tab=sparring` and
   `/sparring/default`). Add `?tab=` query support to `/call-library` and make the sidebar
   "Sparring" item use it (kills the duplicate-destination problem too).
2. **De-arcade pass (copy/classes only).** Remove emoji from product copy in dashboard,
   assignments, calls, sparring; replace the confetti toast and "smashed" toast copy with
   plain statements; drop the rank-ladder/streak-flame presentation to plain numbers.
3. **Kill fake/dead UI.** Remove hard-coded Skill Momentum bar widths (keep status arrows),
   static "updated just now", the topbar bell placeholder, the `/upload` "Demo tip" panel,
   and the `console.log`s in `app-shell.tsx`.
4. **One CTA colour.** Standardise primary buttons on the indigo treatment used by
   `/upload`/`/coaching`; convert cyan and white-on-black primaries to it (mechanical class
   swap; no layout change).
5. **Container adoption.** Wrap `/call-library`, `/assignments`, `/settings/profile`,
   `/crm/accounts` in `PageContainer` + `PageHeader` (visual no-op where padding already
   matches; brings headers onto one type scale).
6. **Empty-state pass.** Swap bare empty text on `/call-library` and `/coaching` tabs for
   `EmptyState` with a single CTA; add "+ New Account" action to the accounts empty state.
7. **(Stretch) Coaching Overview diet — plan only.** Draft the module→tab mapping for
   slimming the Overview tab (priority cards + coaching queue stay; sparring analytics →
   Assignments tab; AI discovery + whisperer → their own tab). Implementation is its own
   day; do not start it inside Day 178.

Validation: keep `validate-premium-ux-day-177` green, run `validate-tier-2b-smoke` after
each patch, and `npm run build` before commit.

---

## 10. Day 178 — implemented (navigation + trust cleanup)

First implementation slice, patch mode, WEB-only. Details in
`PREMIUM_NAVIGATION_CLEANUP.md`; validator `scripts/validate-premium-ux-day-178.sh`.

**Links fixed**
- New tiny index route `/sparring` → redirects to `/call-library?tab=sparring`
  (same pattern as `/recent-calls`), so every historical `/sparring` link now works.
- `/call-library` accepts `?tab=live|sparring|upload` deep links (read on mount).
- Sidebar "Sparring" now points at `/call-library?tab=sparring` — no longer the same
  unqualified destination as "Calls".
- The two `/sparring/new` launches (call detail + sparring post-action) now use the
  supported `/sparring/default` shortcut.
- Dashboard onboarding card + quick link point directly at the sparring tab.

**Trust cleanup done**
- Removed `console.log` debug output from the app shell.
- Removed the dead notifications bell from the topbar.
- Removed the static "updated just now" label from the AI Daily Briefing.
- Removed the internal "Demo tip" panel from `/upload`.
- Removed the completion confetti on `/assignments` and the broken
  `triggerConfetti` import on sparring (it referenced a non-existent export and
  would have thrown on scores ≥ 80 — latent bug, now gone).
- Calmed score toast copy ("Hard mode smashed." → "strong round. Keep this
  standard.") and de-emojied the post-action summaries, streak pill and dashboard
  streak/onboarding tiles.
- Onboarding card hover accents standardised to the indigo primary.

**What remains (unchanged today, by design)**
- `/coaching` Overview diet — planned separately (§9.7).
- Global CTA colour unification beyond touched surfaces (assignments/sparring
  white-on-black, accounts/profile cyan).
- `PageContainer`/`PageHeader` adoption beyond `/dashboard`.
- Orphan routes (`/rewards`, `/whisperer`, `/crm/*` sub-app, `/crm/Leaderboard`).
- Remaining emoji in secondary surfaces (assignments pills, call status banners,
  rewards page); hard-coded Skill Momentum bar widths; empty-state pass.
- Sidebar "Sparring" doesn't show an active state (query-string hrefs aren't
  matched by the pathname-only active check) — cosmetic, revisit with the nav pass.

**Day 179 recommendation**
Trust pass part 2 + layout consistency: remove the hard-coded Skill Momentum bar
widths (keep the status arrows), adopt `PageContainer`/`PageHeader` on
`/call-library`, `/assignments` and `/settings/profile`, and convert the cyan and
white-on-black primary CTAs on those touched pages to the indigo standard.
Still no coaching-overview redesign.

---

## 11. Day 179 — implemented (layout consistency + trust pass 2)

Second implementation slice, patch mode, WEB-only. Validator
`scripts/validate-premium-ux-day-179.sh`.

**Pages touched**
`/call-library`, `/assignments`, `/settings/profile`, `/dashboard` (Skill Momentum
section only), shared `SparringStartButton`.

**Layout consistency**
- `/call-library` now uses `PageContainer` + `PageHeader` (search input moved into
  the header `actions` slot) instead of a hand-rolled `p-6` wrapper.
- `/assignments` (`AssignmentsClient`) outer wrapper is now `PageContainer`, and
  the hand-rolled `h1`/subtitle became `PageHeader`. Streak chips, momentum bar
  and Daily Win panel are unchanged.
- `/settings/profile` (incl. loading state) now uses `PageContainer` (with its
  `max-w-2xl` centring preserved) + `PageHeader`; the redundant "Settings"
  eyebrow was dropped (the sidebar already provides that context).
- No behaviour changes; cards and content untouched beyond the wrappers.

**Trust cleanup**
- Dashboard Skill Momentum: removed the fake progress bars whose widths were
  hard-coded per status (82/32/58 via `skillBarPct`, now deleted). Each skill row
  now shows only the honest status arrow + label (↑ Improving / → Stable /
  ↓ Needs attention / — Awaiting data), separated by hairline dividers.
- No-data copy is now "Trend data appears after more scored calls."
- The `/assignments` momentum bar was left in place — it is real data
  (completed today / open count), not a fake width.

**CTA consistency (touched pages only)**
- `/settings/profile` Save Profile button: cyan → calm indigo
  (`border-indigo-500/20 bg-indigo-600/20 text-indigo-200`); input focus borders
  cyan → indigo to match.
- `SparringStartButton` (only rendered on `/call-library`): solid emerald →
  calm indigo, matching the dashboard mission CTA.
- Filter chips on `/call-library` (white-on-black active state) left alone —
  they are filters, not primary CTAs.

**What remains**
- `/coaching` Overview diet — still planned separately (§9.7).
- Global CTA/button system unification (accounts cyan CTAs, assignments
  white-on-black buttons, sparring surfaces).
- `PageContainer`/`PageHeader` adoption on the remaining pages (`/coaching`,
  `/upload`, `/review`, `/crm/*`, call detail).
- Orphan routes (`/rewards`, `/whisperer`, `/crm/*` sub-app, `/crm/Leaderboard`).
- Remaining emoji in secondary surfaces; empty-state pass.
- Sidebar "Sparring" active-state mismatch on query-string hrefs (cosmetic).

**Day 180 recommendation**
Either (a) the `/coaching` Overview diet (§9.7) as its own carefully-scoped day —
it is the largest remaining premium-feel gap — or (b) a lighter CTA/empty-state
sweep extending the indigo standard to `/crm/accounts` and `/upload`.
Recommend (a): coaching Overview diet.

---

## 12. Day 180 — implemented (coaching Overview diet)

Third implementation slice, patch mode, WEB-only, `/coaching` Overview tab only.
Validator `scripts/validate-premium-ux-day-180.sh`. Companion doc:
`COACHING_OVERVIEW_SIMPLIFICATION.md` (full before/after structure).

**What changed**
- Header simplified to title-only: eyebrow + "Manager Command Centre" + one calm
  subtitle. The competing header CTAs moved into the primary actions row.
- New **primary actions row** at the top of Overview: Upload Call (indigo solid),
  Review Queue, Coaching Queue, Assign Sparring, AI Discovery — one row, five
  calm buttons, replacing the old "Manager workflow" strip (its "Start here"
  badge and two explanatory paragraphs removed).
- The large Command Centre panel (duplicate heading + four priority cards +
  four-box "Team coaching snapshot" + sparring progress row) became one compact
  **"Today's priorities"** list — only rows that actually need attention render
  (calls waiting for review, reps needing attention, overdue assignments or a
  suggested next drill, AI Discovery suggestions), each with a count and one
  indigo action. "All clear" empty state when nothing is urgent.
- A calm "More insights below" divider separates primary actions from
  supporting evidence.
- **Sparring follow-through group**: "Queue-assigned sparring", "Sparring score
  trend" and the sparring progress line moved below the team grids and grouped
  behind one collapsible summary (content unchanged; `#queue-sparring` anchor
  preserved outside the collapse).
- **Rep coaching breakdown group**: the 3-column intelligence grid ("Who needs
  help" / "Team weakness patterns" / "Coaching plans" — numbered arcade headings
  renamed) plus the Coaching Health timeline collapsed behind one summary. The
  full rep table stays visible.
- **KPI diet**: the 8-card KPI grid reduced to 4 (At Risk, Critical Today,
  Flagged This Week, Reps Tracked); Watch / Overdue Actions / Open Actions /
  Auto Assignments were duplicates of Team Health or Today's priorities.
- **Trust/premium pass**: fake `mockTrend` weakness arrows removed (bars now show
  honest share-of-signals); fuchsia "AI Manager Briefing" calmed to a neutral
  "Manager briefing" card; "Suggested Trigger Candidates" retitled **AI
  Discovery** with approval copy folded into the subtitle (repeated "Manager
  approval required" lines reduced to one); raw candidate-id dev string removed
  from Custom Triggers; solid emerald CTAs (Use this candidate, Save trigger,
  Assign Coaching modal) switched to calm indigo.

**How Overview was simplified**
Above the fold is now: primary actions row → Today's priorities → Coaching
Queue. Everything else (team health stats, reps/calls/assignments grids, weakest
skills, AI area, sparring group, briefing, KPIs, rep breakdown, rep table) reads
as supporting evidence below the divider. No tabs, data loading, anchors or
features were removed.

**What remains**
- Emerald-outline secondary buttons (Assign sparring / Mark complete) kept — a
  full button-system unification is still pending.
- `PageContainer`/`PageHeader` adoption on `/coaching` itself.
- Right-column AI stack (Whisperer Insights detail, reviewed-candidate history)
  is still dense; candidates for a future collapse pass.
- Orphan routes, remaining emoji in secondary surfaces, empty-state pass.

**Day 181 recommendation**
Either (a) coaching Overview diet pass 2 — collapse the Whisperer Insights
detail + reviewed-candidate history and adopt `PageContainer`/`PageHeader` on
`/coaching`, or (b) extend the indigo CTA standard to `/crm/accounts` and
`/upload`. Recommend (a) to finish the coaching calm-down while context is
fresh.

---

## 13. Day 181 — implemented (coaching Overview final cleanup)

Final polish pass on `/coaching` only, patch mode, WEB-only. Validator
`scripts/validate-premium-ux-day-181.sh`.

**What changed**
- `PageContainer`/`PageHeader` adopted on `/coaching` (Day 179 §11 pattern);
  the redundant "Coaching" eyebrow dropped — the sidebar already provides that
  context. Tabs + tab content grouped in one wrapper so container spacing
  applies once; the Assign Coaching modal stays a direct child.
- Today's priorities: count badge moved into its own column so the detail line
  aligns with the label text (the Day 180 first-remaining-issue).
- Whisperer Insights: the "Usefulness by objection" and "Needs editing"
  sub-boxes grouped behind one "Suggestion quality detail" collapsible line —
  content unchanged, one click away. Top stats, summary lines and the session
  list stay visible (demo path untouched).
- Reviewed candidates: the latest five render; older history sits behind a
  "Show N more" collapsible. Raw candidate id now only shows when a row has no
  readable title; the metadata line joins its parts cleanly.

**What remains**
- Button-system unification (emerald-outline secondary buttons).
- Orphan routes, remaining emoji in secondary surfaces, empty-state pass.
- `PageContainer`/`PageHeader` on `/upload`, `/review`, `/crm/*`, call detail.

**Day 182 recommendation**
Extend the indigo CTA standard + `PageContainer`/`PageHeader` to
`/crm/accounts` and `/upload` (option (b) from Day 181), closing out the
platform-consistency thread.

---

## 14. Day 182 — implemented (CRM + Upload consistency pass)

Platform-consistency pass on `/crm/accounts` and `/upload` only, patch mode,
WEB-only. No API changes, no migrations, no new features. Validator
`scripts/validate-premium-ux-day-182.sh`.

**What changed**
- `/crm/accounts`: adopted shared `PageContainer`/`PageHeader` (Day 179 §11 /
  Day 181 §13 pattern); dropped the redundant "CRM" eyebrow — the sidebar
  already provides that context. The KPI cards + New Account/New Contact action
  stack moved into the `PageHeader` `actions` slot unchanged.
- `/crm/accounts` primary CTAs standardised toward calm indigo: the header
  "+ New Account" button and both modal submit buttons ("Create Account",
  "Create Contact") moved off cyan onto the indigo standard
  (`border-indigo-500/20 bg-indigo-600/20 text-indigo-200 hover:bg-indigo-600/30`).
  Secondary "+ New Contact" stays neutral; sort toggles and the search field
  keep their existing accents (state, not CTAs).
- `/crm/accounts` trust copy: the Escalation card's raw internal fallback token
  `manager_queue` softened to a readable "Manager queue". Real escalation
  values still render as returned.
- `/upload`: adopted the shared `PageHeader` for the title/subtitle (dropped the
  "Calls" eyebrow, consistent with the above). `PageContainer` was deliberately
  **not** applied here — the `max-w-5xl` wrapper keeps the two-column
  form/guidance layout centred as intended (Day 164). Upload CTAs were already
  on the indigo standard and were left unchanged.

**Preserved (behaviour untouched)**
- Create new client link, account picker, rep picker, call type, tag/campaign,
  the full signed-upload flow and all post-upload actions (Open Review Queue,
  Command Centre, View call, Upload another).

**What remains**
- Button-system unification (emerald-outline secondary buttons).
- `PageContainer`/`PageHeader` on `/review`, call detail, remaining `/crm/*`.
- Orphan routes, remaining emoji in secondary surfaces, empty-state pass.

**Day 183 recommendation**
Extend the same `PageHeader` + indigo-CTA standard to `/review` and the call
detail page, and start the emerald-outline secondary-button unification called
out since Day 181.

---

## 15. Day 183 — implemented (call detail premium pass)

Polish pass on the call detail page `/calls/[id]` only, patch mode, WEB-only.
No API changes, no migrations, no new features. Validator
`scripts/validate-premium-ux-day-183.sh`.

**Audit (call detail + review surfaces)**
- `/calls/[id]` — active, bespoke `<main>` layout with a sticky in-page section
  nav (`-mx-6 px-6`) and the score rendered inline inside the `<h1>` title.
- `/review/timeline` and `/review/[callId]/timeline` — orphaned legacy/demo
  transcript-player scaffolding (mock data; the `[callId]` variant even fetches
  `NEXT_PUBLIC_API_URL` directly, bypassing the proxy). Neither is linked from
  the app — the live Review Queue is `/coaching?tab=review`. Left untouched to
  stay controlled (flagged below as cleanup candidates).

**What changed (`/calls/[id]`)**
- Header title `<h1>` aligned to the shell typography: `text-2xl` → `text-xl`
  (matches `PageHeader` used on every other page) and `break-all` →
  `break-words` so friendly titles wrap on words, not mid-character. The score
  `ScorePill` stays inline; the human-friendly `formatCallDisplayTitle` output
  and the subtle `File: …` raw-filename line (`text-xs text-neutral-600
  truncate`) are unchanged — no UUID-looking header.
- Primary CTA standardised to calm indigo: the Coach panel's "Save Assignment"
  button moved off solid emerald (`bg-emerald-600`) onto `bg-indigo-600
  hover:bg-indigo-500 text-white`.
- Emerald-outline secondary cleanup begun on this surface: the "Assign
  Coaching" action button moved off emerald-outline onto the neutral secondary
  style (`border-neutral-700 bg-neutral-900 …`). Emerald is now reserved for
  *status* here — the "Reviewed ✓" and "Coaching assigned ✓" confirmation pills
  keep their emerald treatment.
- Processing-status banner de-arcaded: the 🎧/📝/🤖/⚠️/⏳ emoji dropped, leaving
  calm status text ("Transcribing call…", "Processing transcript…", etc.); the
  failed state keeps its red text.

**Deliberately not done**
- `PageContainer`/`PageHeader` were **not** forced onto `/calls/[id]`: the
  inline-score `<h1>` and the sticky `-mx-6` section nav don't fit those
  primitives cleanly, so a swap is not low-risk. The bespoke `<main>` wrapper is
  kept (same call made for `/upload` in Day 182 §14).

**Preserved (behaviour untouched)**
- Mark Reviewed, Assign Coaching, Assign Drill / Save Assignment, the pins calm
  empty state ("No pinned coaching notes yet.") and graceful `pinsErr` handling
  (Day 171), Whisperer Moments + its calm empty/error states, the audio player,
  signed-URL handling and manager-only access gating.

**What remains**
- Full button-system unification across untouched surfaces (remaining
  emerald-outline actions elsewhere).
- Orphan-route cleanup: retire or proxy-fix `/review/timeline` +
  `/review/[callId]/timeline`.
- Pins section still uses raw `border rounded` styling — a later cosmetic pass.

**Day 184 recommendation**
Either (a) retire/consolidate the orphaned `/review/*` demo routes (they bypass
the proxy and are unlinked), or (b) continue the emerald-outline secondary
cleanup + indigo-CTA standard across the remaining CRM/contact detail surfaces.

---

## 16. Day 184 — implemented (orphaned review route cleanup)

Cleanup of the two orphaned `/review/*` demo routes flagged on Day 183, so the
app has one clear review path. WEB-only. No API changes, no migrations, no new
features. Validator `scripts/validate-premium-ux-day-184.sh`.

**Audit**
- `src/app/review/timeline` — a self-contained demo page rendering an inline
  mock transcript player backed by a hardcoded `DEMO_TRANSCRIPT` and an external
  `cdn.pixabay.com` audio placeholder. Pure mock; trust/UX confusion.
- `src/app/review/[callId]/timeline` — a server component fetching
  `NEXT_PUBLIC_API_URL/v1/calls/:id` **directly, bypassing the `/api/proxy`
  boundary**, and passing props (`audioSrc`/`transcript`/`title`, plus a `Turn`
  import) the shared `@/components/TranscriptPlayer` does not accept — already
  broken.
- Inbound links: **none**. No source references to either route anywhere; the
  only `/review` mention is the `SHELL_PATHS` prefix in `src/config/navigation.ts`.
- Real review path confirmed intact: the Review Queue is `/coaching?tab=review`
  and the real call review page is `/calls/[id]`.

**Cleanup decision**
Both routes are truly unused, so the mock/proxy-bypass surface must go. Rather
than delete (which would 404 any stray/bookmarked link), each page was replaced
with a clean **server-side redirect** to the real path — the simplest change
that removes the mock data and the direct `NEXT_PUBLIC_API_URL` fetch while
funnelling traffic to the supported flow.

**What changed**
- `review/timeline/page.tsx` → `redirect("/coaching?tab=review")` (13 lines,
  server component; all mock data + the inline demo player removed).
- `review/[callId]/timeline/page.tsx` → `redirect(\`/calls/${params.callId}\`)`
  (server component; the direct proxy-bypassing fetch + broken imports removed,
  callId preserved).
- `/review` left in `SHELL_PATHS` — harmless, and the redirects fire server-side
  before the shell renders.

**Preserved (behaviour untouched)**
- `/coaching?tab=review` (Review Queue) and `/calls/[id]` (call detail) — no
  changes. The shared `@/components/TranscriptPlayer` is now unused by any route
  but left in place (out of scope; no broken imports remain).

**What remains**
- Full button-system unification across untouched surfaces.
- Pins section cosmetic pass on `/calls/[id]`.
- Optional: drop the now-vestigial `TranscriptPlayer` component and the
  `/review` `SHELL_PATHS` entry in a later tidy.

**Day 185 recommendation**
Continue the emerald-outline secondary cleanup + indigo-CTA standard across the
remaining CRM/contact detail surfaces, or do the small dead-code tidy
(`TranscriptPlayer` + `/review` shell-path entry).

---

## 17. Day 185 — implemented (dead-code + shell-path cleanup)

Tidy of the scaffolding left behind after Day 184's review-route redirects.
WEB-only, patch mode. No API changes, no migrations, no new features.
Validator `scripts/validate-premium-ux-day-185.sh`.

**Audit**
- `/review/timeline` and `/review/[callId]/timeline` — both are now the tiny
  Day 184 server-side redirect stubs (→ `/coaching?tab=review` and
  → `/calls/[callId]`). Intact and useful for old/bookmarked links.
- `TranscriptPlayer` (`src/components/TranscriptPlayer.tsx`, 52 lines) — zero
  importers anywhere after Day 184; the only references were self-references
  inside the file. Truly unused.
- `/review` was still listed in `SHELL_PATHS` (`src/config/navigation.ts`), whose
  only consumer is `shell-gate.tsx` via `isShellPath`. The redirect pages fire
  server-side before shell chrome renders, so the entry is vestigial.
- No remaining mock references (`cdn.pixabay.com`, `DEMO_TRANSCRIPT`,
  `DEMO_AUDIO`) and no stray links into `/review/*/timeline`.

**Cleanup decision**
- Keep both redirect stubs (tiny, graceful for bookmarks — per the Day 184
  rationale).
- Remove `/review` from `SHELL_PATHS` (no longer needed).
- Delete the unused `TranscriptPlayer` component.

**What changed**
- `src/config/navigation.ts` — dropped the `'/review'` `SHELL_PATHS` entry.
- `src/components/TranscriptPlayer.tsx` — deleted (unused).

**Preserved (behaviour untouched)**
- The two `/review/*` redirects, the real Review Queue `/coaching?tab=review`,
  and the call detail page `/calls/[id]`. No proxy-bypass or mock surface
  reintroduced.

**What remains**
- Button-system unification across untouched surfaces.
- Pins section cosmetic pass on `/calls/[id]`.

**Day 186 recommendation**
Return to the premium-consistency thread: continue the emerald-outline secondary
cleanup + indigo-CTA standard across the remaining CRM / contact detail
surfaces.

---

## 18. Day 186 — implemented (CRM detail + secondary CTA cleanup)

Premium-consistency pass on the CRM detail surfaces, patch mode, WEB-only. No
API changes, no migrations, no new features, no deep table/card redesign.
Validator `scripts/validate-premium-ux-day-186.sh`.

**Audit**
- `/crm/accounts/[id]` — active. Header already premium (`text-xl` title, domain
  subtitle, a back-link eyebrow + health status badge). Action buttons were a
  mix of cyan primaries and cyan/emerald-outline secondaries; the many other
  emerald/amber/red usages are health *status* cards/pills (correct semantics).
- `/crm/contacts/[id]` — active server page composing client sub-components.
  Header was a bespoke title/subtitle/back-link block ("CRM · Contact"). Its
  only emerald usages are hot/warm health *status* pills (correct).
- `/crm/contacts` (index) — does not exist as a route; contacts are managed via
  the `/crm/accounts` New Contact modal. Nothing to touch.

**What changed**
- `/crm/accounts/[id]` primary CTAs standardised to the page's existing calm
  indigo (`border-indigo-500/30 bg-indigo-500/10 …`, matching the "Assign Owner"
  button): "+ Add Contact" and the Add-Contact modal submit moved off cyan.
- `/crm/accounts/[id]` secondary CTA cleanup — the emerald/cyan-outline *action*
  buttons moved onto the neutral secondary style (`border-neutral-700
  bg-neutral-900 …`): "Complete" (rescue task), "Assign Replay", "Assign
  Sparring", "Complete" (coaching action). Emerald is now reserved for *status*
  here — the "Done"/"done" pills and health cards keep their green.
- `/crm/contacts/[id]` adopted the shared `PageHeader` for its header block
  (title/subtitle + back-link in `actions`); the redundant "CRM ·" eyebrow
  prefix dropped (the sidebar already provides that context, per Day 181/182).
  The `max-w-6xl` centred wrapper is preserved.

**Deliberately not done**
- `PageContainer`/`PageHeader` were **not** forced onto `/crm/accounts/[id]`:
  its header carries a back-link eyebrow *above* the title plus a right-side
  status badge, which `PageHeader` can't host cleanly, and its wrapper spacing
  differs. Header is already on-standard, so CTA cleanup was the higher-value
  win (same judgement as `/upload` §14 and `/calls/[id]` §15).
- Tables/cards not redesigned.

**Preserved (behaviour untouched)**
- Account/contact creation, the Add-Contact modal + link-existing-contact flow,
  owner assign/remove, task/coaching completion, account↔contact links, all data
  loading and empty states.

**What remains**
- Button-system unification across the wider CRM manager surfaces.
- Optional cosmetic pass on the pins section of `/calls/[id]`.

**Day 187 recommendation**
Continue the secondary-CTA cleanup + indigo-CTA standard into the CRM manager
surfaces (`/crm/overview`, `/crm/pipeline`, `/crm/manager/*`) — the next cluster
of mixed cyan/emerald action buttons.

---

## §17 — CRM manager surfaces (Day 187)

WEB-only, patch mode. No API, no migrations, no new features. UK spelling.

**Route audit (active vs orphaned)**
- **Active** (reachable via sidebar or in-app links): `/crm/manager` (Team,
  sidebar), `/crm/manager/contacts` (Contacts, sidebar), `/crm/analytics`
  (Analytics, sidebar), `/crm/overview` (from Team), `/crm/manager/nudges`
  (from Overview/Team), `/crm/pipeline` (from `/crm/tasks`).
- **Redirect** (kept): `/crm/manager/control-centre` → `/coaching` (already
  consolidated Day-157-era). Left as-is.
- **Orphaned / legacy** (no inbound links — left untouched):
  `/crm/Leaderboard` (capitalised route, 0 inbound refs),
  `/crm/manager/auto-assign` (+`/runs`) — light-themed legacy page that bypasses
  `/api/proxy` (uses `NEXT_PUBLIC_API_URL` directly); the live auto-assign UI is
  embedded in `ManagerClient` via `RunHistoryTable`. Deliberately not touched:
  re-theming/re-wiring it is a redesign, out of scope for a consistency patch.
- `/crm/pipeline/PipelineClient.tsx` is dead (not imported); the active Pipeline
  is the self-contained `page.tsx`.

**Changes made**
- `/crm/manager` (Team): adopted shared `PageContainer` + `PageHeader`
  (title/subtitle + the two nav links in `actions`). Was already visually
  on-standard; this makes it structurally consistent. Indigo/neutral CTAs kept.
- `/crm/manager/ManagerClient.tsx`: "Run batch assign" solid **emerald** action
  button → solid **indigo** (matches the sibling primary in the same panel).
  Emerald/blue *status pills* left alone.
- `/crm/manager/contacts`: "+ New Contact" **cyan**-outline primary action →
  calm **indigo** outline. Softened raw modal copy
  ("Contact creation requires backend endpoint." → "…isn't available yet.").
  Input focus-rings and the account table link kept (cosmetic accents, not
  action buttons — table not redesigned).
- `/crm/pipeline`: header `text-2xl` → `text-xl` to match the PageHeader scale.
- `/crm/overview`: header `text-2xl "CRM · Overview"` → `text-xl "Overview"`
  (drops redundant eyebrow prefix; centred `max-w-5xl` wrapper preserved).
- `/crm/manager/nudges`: header `"CRM · Manager Nudges"` → `"Manager Nudges"`.

**Deliberately not done**
- `/crm/analytics` — audited, already premium (dark theme, `text-xl` header,
  neutral export buttons, no stray emerald/cyan actions). No change.
- `/crm/overview` not forced onto `PageContainer`: it uses a bespoke centred
  `max-w-5xl` layout; swapping in the full-width container would restyle the
  whole page (out of scope). Header normalised only.
- Tables/cards not redesigned; pipeline/nudges/auto-assign data untouched.

**Preserved (behaviour untouched)**
- Manager overview + auto-assign run/preview/execute, batch-assign flow, contacts
  triage + create modal, pipeline drag/scope, analytics loaders + realtime, all
  cross-links and empty states.

**Day 188 recommendation**
Two candidates: (a) modernise the orphaned `/crm/manager/auto-assign` runs page
(dark theme + route it through `/api/proxy`) *or retire it* if the embedded
`RunHistoryTable` fully covers it; (b) continue the button-system unification into
`/crm/tasks` and `/crm/actions`. Prefer (a) — it removes a proxy-bypass and a
light-theme outlier in one move.

---

## §18 — CRM auto-assign legacy route cleanup (Day 188)

WEB-only, patch mode. No API, no migrations, no new features. UK spelling.
Chose option (a)-retire from §17's Day 188 recommendation.

**Re-audit (all three orphaned):**
- `/crm/manager/auto-assign/page.tsx` — light-themed outlier, **bypassed
  `/api/proxy`** by fetching `${NEXT_PUBLIC_API_URL}${path}` directly with
  hand-forwarded `x-user-id`/`x-org-id` headers.
- `/crm/manager/auto-assign/runs/page.tsx` — dark table, went through
  `/api/proxy` (via an `absoluteUrl()` helper); still orphaned.
- `/crm/manager/auto-assign/runs/[run_id]/page.tsx` — run detail, relative
  `/api/proxy` fetch; still orphaned.
- **Inbound navigation: none.** The only references to `crm/manager/auto-assign`
  elsewhere are the functional `/api/proxy/v1/crm/manager/auto-assign/*` endpoint
  strings in `ManagerClient` + `RunHistoryTable` (the *live* auto-assign UI that
  actually renders on the Team page `/crm/manager`). No links reach the pages.

**Decision — retire (redirect), not redesign.** Per the "prefer redirect/removal
over redesign if orphaned" rule and the Day 184 (`/review/*`) + Day 187
(`control-centre`) precedents, all three page files were replaced with tiny
server redirects (`redirect('/crm/manager')`). This removes the proxy-bypass, the
light-theme outlier, and ~700 lines of dead UI in one move, while keeping the live
auto-assign surface (Team page) untouched.

**Changes made**
- `auto-assign/page.tsx`, `auto-assign/runs/page.tsx`,
  `auto-assign/runs/[run_id]/page.tsx` → server-redirect stubs → `/crm/manager`.

**Preserved (behaviour untouched)**
- The live auto-assign run history / preview / execute UI on `/crm/manager`
  (`ManagerClient` + `RunHistoryTable`) and all its `/api/proxy` calls. No
  assignment-completion logic changed. Nothing auto-created/auto-enabled.

**Day 189 recommendation**
Continue the button-system unification into `/crm/tasks` and `/crm/actions` (the
remaining CRM surfaces with mixed CTA colours), or sweep for any *other*
`NEXT_PUBLIC_API_URL`/direct-backend fetches outside `/api/proxy` across the app
and neutralise them the same way.

---

## §19 — Direct backend fetch / proxy-bypass sweep (Day 189)

WEB-only, patch mode. No API, no migrations, no new features. UK spelling.
Followed §18's Day 189 recommendation (app-wide bypass sweep).

**Patterns audited:** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_API_BASE`, `API_BASE`,
`apiBase`, `BACKEND_BASE`, `getBackendBase`, `fetch("http…`, `fetch(\`http…`,
`` fetch(`${…}/v1…` ``, and direct backend-host calls from `app/components/lib`.

**Findings classified**
- **Orphaned bypass — removed (3 files, all from the `0a37da5 init web` scaffold,
  zero callers repo-wide):**
  - `src/app/calls/[id]/Player.tsx` — dead client component (never imported; the
    live `/calls/[id]` page plays audio via its own `/api/proxy`-bound `audioUrl`).
    Fetched `${NEXT_PUBLIC_API_BASE || "http://localhost:4000"}/v1/calls/…/audio-url`
    **from the browser** — a real client-side bypass.
  - `src/app/calls/route.ts` — orphaned `POST /calls` handler that fetched
    `${BACKEND_BASE}/v1/calls` directly (unauthenticated, service-role write).
  - `src/app/api/calls/route.ts` — duplicate orphaned `POST /api/calls` handler,
    same direct `${BACKEND_BASE}/v1/calls` bypass.
- **Safe (through the proxy) — left untouched:**
  - `src/lib/Admin/adminConfig.ts` — `API_URL = "/api/proxy"`; the
    `` `${API_URL}/v1/admin/config` `` template resolves to `/api/proxy/…`.
  - `src/app/crm/contacts/[id]/page.tsx` + `src/app/crm/manager/nudges/page.tsx` —
    server components hitting `` `${INTERNAL_API_BASE_URL ?? "http://localhost:3000"}/api/proxy/…` ``
    (an absolute URL to the WEB app's *own* proxy, not the backend).
  - `src/app/api/proxy/[[...path]]/route.ts` — the proxy itself (`getBackendBase`).
- **Debug-only, no fetch — left untouched (documented):**
  - `src/lib/config.ts` `getBackendBase()` + its single consumer at
    `src/app/crm/overview/page.tsx:363` (`console.debug(…)`). No request is made
    through it; the overview's real calls all use `/api/proxy`.
- **Comment-only / false positive:** the Day 188 note in
  `auto-assign/page.tsx` and the `// …avoid any direct API_BASE usage…` note at
  `calls/[id]/page.tsx:101`.

**Changes made**
- Deleted the three orphaned bypass files above. No redirect stubs needed —
  nothing links to or POSTs at these paths, and they carry no active behaviour
  (audio playback and call ingestion both run through `/api/proxy`).

**Preserved (behaviour untouched)**
- `/calls/[id]` audio playback (own `/api/proxy` `audioUrl` flow), the upload /
  call-ingestion flow (already `/api/proxy`), admin config, CRM contact/nudges
  server fetches. No auth/session semantics changed beyond removing bypasses.

**Day 190 recommendation**
Resume the CTA/button-system unification into `/crm/tasks` and `/crm/actions`
(the last mixed-colour CRM surfaces). Optionally, a follow-up hardening tick could
drop the now-vestigial `lib/config.ts` `getBackendBase()` + the overview
`console.debug` that reference a hardcoded backend host, since nothing else uses
them.

---

## §20 — CRM tasks / actions button-system pass (Day 190)

WEB-only, patch mode. No API, no migrations, no new features. UK spelling.

**Route audit (active vs orphaned)**
- **Active:** `/crm/tasks` (linked from `/crm/pipeline`), `/crm/actions`
  (linked from `/crm/reps/[id]` ×4 and `/coaching` ×3). No sidebar entries; both
  reached via in-app links. Both fetch through `/api/proxy`.
- **Orphaned (left untouched, documented):** `src/app/crm/actions/ActionsClient.tsx`
  — never imported (the active `/crm/actions` is a self-contained `page.tsx`
  rewrite). Uses `/api/proxy` (no bypass), so no security reason to remove now;
  flagged as a future dead-code tidy alongside the dead
  `pipeline/PipelineClient.tsx` (§17).

**Changes made**
- `/crm/tasks`: header `text-2xl` → `text-xl` (PageHeader scale; kept the "CRM"
  eyebrow to match `/crm/actions` + `/crm/manager/contacts`). The loud **white**
  "Refresh" primary (`bg-white text-neutral-950`) → calm neutral bordered button,
  matching the sibling "← Pipeline" and the app's utility-button convention. The
  "Complete" button was already neutral; the emerald "done" pill is status only.
- `/crm/actions`: filter **active-tab** accent **cyan** → calm **indigo**
  (`border-indigo-500/30 bg-indigo-500/10 text-indigo-200`), matching the app
  accent. The "Complete" **action** button **emerald** → neutral bordered
  (green reserved for the "Done" status pill only). Cyan contact table-link left
  as-is (accent, not an action — table not redesigned), same call as §16/§17.
- Hardening tick (per §19's Day 190 note): deleted the vestigial
  `src/lib/config.ts` (`getBackendBase()`, hardcoded backend host) and removed its
  only consumer — the `console.debug(...)` + import on `/crm/overview`. Nothing
  else referenced it; the proxy has its own private `getBackendBase`.

**Deliberately not done**
- No `PageContainer`/`PageHeader` forced onto `/crm/tasks` (bespoke
  `min-h-screen … max-w-7xl` wrapper) or `/crm/actions` (`max-w-7xl` wrapper) —
  header scale normalised instead, same judgement as `/crm/overview` (§17).
- Tables/cards not redesigned; filters, completion/update flows, empty states,
  realtime subscription, and rep gating all preserved. Task/action completion
  logic untouched (styling-only changes).

**Day 191 recommendation**
Dead-code tidy: remove the two confirmed orphaned client components
(`crm/actions/ActionsClient.tsx`, `crm/pipeline/PipelineClient.tsx`) — both
never-imported duplicates of live self-contained pages. Otherwise, extend the
button-system/header pass to `/crm/reps/[id]` (rep profile) if any mixed-colour
CTAs remain there.

---

## §21 — CRM dead client component cleanup (Day 191)

WEB-only, patch mode. No API, no migrations, no new features, no behaviour change.
Followed §20's Day 191 recommendation (dead-code tidy).

**Re-audit (zero imports/callers proven repo-wide):**
- `src/app/crm/actions/ActionsClient.tsx` — never imported. Its default export
  is `ActionsClient`; the only occurrence of that name anywhere was its own
  definition line. The live `/crm/actions` route is the self-contained
  `actions/page.tsx` (§20).
- `src/app/crm/pipeline/PipelineClient.tsx` — never imported. Its default export
  is actually named `CrmPipelinePage` (a legacy duplicate of the live page), so
  the string `PipelineClient` appeared *nowhere* in the repo — not even inside
  its own file. The live `/crm/pipeline` route is the self-contained
  `pipeline/page.tsx` (§17).
- A repo-wide grep for both basenames (import paths, `import()` dynamic imports,
  path strings) across `*.ts/tsx/js/json` returned no external references.

**Changes made**
- Deleted both files. Post-deletion each directory contains only its live
  `page.tsx`; a follow-up grep confirms zero stale references remain.

**Preserved (behaviour untouched)**
- Active `/crm/actions` and `/crm/pipeline` pages and all their behaviour
  (filters, completion/update flows, drag/scope, empty states, `/api/proxy`
  data loading). No task/action completion logic touched.

**Day 192 recommendation**
Extend the button-system/header consistency pass to `/crm/reps/[id]` (rep
profile) — the last un-swept CRM surface — checking for `text-2xl` headers,
white/emerald/cyan action buttons, and any remaining "CRM ·" eyebrow prefixes.

---

## §22 — CRM rep detail button-system pass (Day 192)

WEB-only, patch mode. No API, no migrations, no new features, no behaviour
change. UK spelling. Followed §21's Day 192 recommendation.

**Route audit (active vs orphaned)**
- **Active:** `/crm/reps/[id]` (rep profile). Heavily linked inbound — from
  `/coaching` (×7), `/crm/overview`, `/crm/actions`, `/crm/accounts/[id]`, and
  `/crm/Leaderboard`. All data loads through `/api/proxy` (rep-summary,
  manager/nudges, reps/…/intelligence, crm/actions). No direct-backend fetches.
- **Orphaned (out of scope, left untouched):** `src/app/reps/[id]/page.tsx` and
  `src/app/admin/reps/page.tsx` — the non-CRM rep routes have no inbound page
  links (only `/v1/reps/*` API calls share the string). Not part of the CRM
  sweep; deliberately not touched.

**Header decision (deliberately not forced)**
- The rep header already matches the intentional CRM *detail* pattern used by
  `/crm/accounts/[id]` (§16): a `← CRM` back link above a `text-xl` title with a
  `text-xs` subtitle. `PageHeader` was **not** forced here — it renders no
  back-link slot and would move the RiskBadge + primary CTA, diverging from the
  sibling detail page. Header left as-is (already premium-calm, `text-xl`).
- The only `text-2xl` in the file is the **risk-score metric value** inside the
  risk card — a data figure, not a page heading — so it was left unchanged
  (same call as prior metric-value cases).
- No "CRM ·" eyebrow prefix present; the `← CRM` breadcrumb mirrors
  `← Accounts` on `/crm/accounts/[id]` and was kept.

**Changes made (CTA colour calm only)**
- Header **AI Sparring →** CTA: **emerald** → calm **indigo**
  (`border-indigo-500/30 bg-indigo-500/10 text-indigo-200`), matching the app
  accent for the primary page action.
- Overview **Top Account → Open** link: **cyan** → neutral bordered (secondary
  navigation, not a status).
- Overview quick-actions row: **Open CRM Actions →** (**amber** action) → neutral
  bordered; **AI Sparring →** (**emerald**) → indigo, matching the header CTA.
- Coaching tab **+ Follow-up** create button: **emerald** → indigo (green
  reserved for success/status only, not a create action). Completion logic and
  the `createFollowUp`/`completeAction` handlers untouched.
- Activity tab **Account** inline link: **cyan** text → neutral (calmer, still an
  underlined link).

**Green kept for status/success only (unchanged)**
- Risk-band card border/text (`healthy`→emerald, `watch`→amber, `at_risk`→red),
  the **Completed** action count (`text-emerald-400`), and **Due Soon**
  (`text-amber-300`) are all status indicators — left as-is. RiskBadge / ScorePill
  / StatCard success-warning-danger variants preserved.

**Preserved (behaviour untouched)**
- Rep profile data, KPI strip, CRM risk card, top account, linked actions,
  coaching intelligence, filters/cards/tables, empty states, and navigation
  between CRM surfaces. No task/action completion logic changed, no
  auto-complete, no approval gates touched, no new API calls.

**Day 193 recommendation**
CRM rep-detail surface is now consistent. Next: sweep the non-CRM rep routes
(`/reps/[id]`, `/reps/[id]/sparring`, `/admin/reps`) — decide active vs
retire/redirect — or continue the button-system pass into `/dashboard` and the
`/coaching` sub-tabs for any residual emerald/cyan/white action buttons.

---

## §23 — Orphaned rep route cleanup (Day 193)

WEB-only, patch mode. No API, no migrations, no new features, no behaviour
change. UK spelling. Followed §22's Day 193 recommendation.

**Route audit + classification (inbound refs proven repo-wide)**
- **`/reps/[id]`** — *orphaned → redirected.* A large legacy standalone client
  rep profile (1346 lines, recharts/XP) predating the CRM workspace. The only
  inbound page link anywhere was from its own `/reps/[id]/sparring` child; no
  external page links (`/v1/reps/*` matches are API calls, not page routes). The
  active, param-compatible equivalent is `/crm/reps/[id]` (§22).
- **`/reps/[id]/sparring`** — *orphaned → redirected.* A read-only sparring
  session list reachable **only** from `/reps/[id]` — a closed orphan loop.
- **`/admin/reps`** — *active → kept + documented.* Linked from the root
  `HomeLanding` (`src/app/page.tsx` → `HomeLanding.tsx`) as a **manager-gated**
  "Admin · Reps — Manage team members and roles" card. Loads through
  `/api/proxy/v1/admin/*` (no direct-backend bypass). It is the live team-member
  admin surface — **not** touched (preserving the manager journey and gating).

**Changes made (redirects only, no UI)**
- Replaced `src/app/reps/[id]/page.tsx` with a server redirect →
  `/crm/reps/${id}` (id preserved, `encodeURIComponent`).
- Replaced `src/app/reps/[id]/sparring/page.tsx` with a server redirect →
  `/crm/reps/${id}`. Deliberately funnelled to the active rep surface rather
  than deep-linking `/sparring?repId=…` — the latter risks launching a sparring
  session, which would change sparring behaviour. Both legacy routes now land on
  the single active rep profile whose Coaching tab already carries the sparring
  score trend + AI Sparring entry points.
- Both kept as redirects (not deletions), matching the Day 184 stub pattern, so
  any stray/bookmarked `/reps/*` link resolves to the real path instead of a 404.

**Deliberately not done**
- `/admin/reps` left untouched (active, referenced, manager-gated). Its legacy
  header-based identity pattern is a separate concern outside this cleanup.
- No `lib/api.ts` exports removed even though `getRepOverview` / `getRewards` /
  `getSparringSessionsByRep` etc. may now be unused — out of scope (no broad
  refactor); harmless dead exports flagged for a future tidy.

**Pre-existing observation (not changed)**
- `tests/e2e/smoke.spec.ts` lists `{ path: '/reps', name: 'Reps list' }`, but no
  `/reps` **index** route exists (`src/app/reps/` only holds `[id]/…`). That test
  entry predates this work and is unaffected by the `[id]` redirects; noted for a
  future test tidy, not touched here.

**Day 194 recommendation**
Rep routes are now consolidated on `/crm/reps/[id]`. Next: either continue the
button-system/consistency pass into `/dashboard` and the `/coaching` sub-tabs
(residual emerald/cyan/white action buttons), or tidy the stale
`tests/e2e/smoke.spec.ts` `/reps` entry and any now-unused `lib/api.ts` rep
exports.

---

## §24 — "Gravix Command Centre" visual direction + system pass (Day 194)

Scope: WEB-only, patch mode. Names the premium visual direction the Day 177–193
passes have been converging on, and applies the remaining system-level colour
corrections on shared components and the lighthouse demo path. No behaviour,
route, API or feature changes.

### Visual direction — Gravix Command Centre

The target feel is a **dark AI command centre for sales teams**: calm
intelligence, manager-first trust, professional B2B SaaS. "Jarvis-esque" in
composure — quiet dark surfaces, one clear accent, information density without
noise — never gamer UI.

**Colour roles (canonical):**

| Role | Colour | Use |
| --- | --- | --- |
| Base | neutral-950 / neutral-900 | page + card surfaces |
| Structure | neutral-800 borders | prefer fewer borders; use `/60`–`/80` opacities |
| Text | white → neutral-300 → neutral-500 | three-step hierarchy |
| **Primary action / AI / brand** | **indigo** | all primary CTAs, AI surfaces (`SectionCard variant="ai"`, `StatCard variant="ai"`, `AiInsightCard summary`), nav active state, brand mark |
| Accent (sparing) | cyan | secondary informational accents only — never a CTA, never a border-heavy block |
| Success / status | emerald | status pills, health bands, positive deltas only — never buttons, never brand |
| Warning / caution | amber | warnings, watch bands, impersonation banner |
| Risk / error | red | errors, at-risk, overdue |
| ~~Banned~~ | fuchsia, purple, pink, violet, sky | removed from shared components + demo path; not part of the system |

**Card rules:** `rounded-xl border` on neutral-950; tinted variants stay at
`/20` border + `/5` background (already the SectionCard/StatCard convention —
no glows, no gradients, no heavy shadows). Progress bars are solid single-hue
fills, not gradients.

**Spacing rules:** `PageContainer` (`p-6 space-y-6`) is the page shell;
`px-4/5 py-3/4` card headers; `text-[10px] uppercase tracking-[0.12–0.14em]`
eyebrows. Compact density, consistent rhythm.

**CTA rules:** one primary indigo CTA per view (`bg-indigo-600
hover:bg-indigo-500` family); secondary actions are neutral outline
(`border-neutral-700` + hover); destructive red only. No emerald, cyan or
white-on-black action buttons.

**Status colour rules:** green/amber/red are *status-only* (pills, badges,
deltas, band accents). If it's clickable, it isn't green.

**Motion rules:** `transition-colors`/`transition-all` on hover only;
`animate-pulse` reserved for genuinely-live indicators (live Whisperer);
no confetti, no bounce, no glow.

### Implemented (Day 194)

Shared shell + components:
- `shell/nav-item.tsx` — active accent bar + active icon emerald → **indigo**
  (nav active state is a primary-accent role, not a status).
- `shell/sidebar.tsx` — brand `Zap` mark emerald → indigo (both collapsed and
  expanded states).
- `shell/app-shell.tsx` — impersonation banner fuchsia → **amber** (it is a
  caution state; also dropped its `animate-pulse` dot — nothing is "live").
- `ui/stat-card.tsx` — `ai` variant fuchsia → indigo (now matches
  `SectionCard variant="ai"`).
- `ui/ai-insight-card.tsx` — `summary` type fuchsia → indigo.
- `layout/page-header.tsx` — `tracking-tight` on the h1 for a tighter
  premium title setting.
- Deleted `components/XpProgress.tsx` — orphaned (zero imports) arcade
  XP-bar component.

Demo-path surfaces (mechanical colour-role swaps only):
- `/dashboard` — AI Daily Briefing card fuchsia → indigo (matches the ai
  variant convention); XP progress bar emerald→cyan **gradient** replaced
  with a solid indigo fill.
- `/calls/[id]` — coach-panel deep-link notice purple → indigo.
- `/crm/accounts/[id]` — "AI CRM Memory" block + Save Memory button fuchsia
  → indigo.

### Theme-readiness notes (for future white-label themes)

No theme switcher was built (deliberate). What Day 194 sets up:

1. **Semantic variants over raw hues.** The shared components
   (`SectionCard`, `StatCard`, `StatusBadge`, `AiInsightCard`) already map
   *semantic* variants (`ai`, `warning`, `danger`, `success`) to colour
   classes in single `Record` maps at the top of each file. These maps are
   the natural seam for theme tokens — a future theme provider swaps the
   map values (or the Tailwind theme colours behind them) without touching
   call sites.
2. **Indigo is now the single primary.** With fuchsia/purple gone and
   emerald demoted to status, "brand colour" appears in far fewer places —
   a future `--color-primary` token replaces one hue, not four.
3. **Where tokens should live:** first step is Tailwind theme extension
   (`primary`, `accent`, `success`, `warning`, `danger`, `surface`,
   `border`) in `tailwind.config`, aliased to the current palette; shared
   components adopt token classes first, routes follow route-by-route.
4. **Remaining hardcoded clusters** (not migrated, candidates for the token
   pass): `/coaching` band colour maps (~line 469), `/dashboard`
   `TIER_COLORS`, `/admin/users` role-badge map (still fuchsia —
   SuperAdmin-only surface, off the demo path, left for Day 195),
   `HealthBadge`, `DashboardKpis`, `SparringStartButton`.

### Deferred (documented, not done)

- `/admin/users` fuchsia role badges + hover states (off demo path).
- `PageContainer` max-width clamp (`max-w-[1400px] mx-auto`) — would improve
  ultra-wide reading but is a layout change across every shell page; needs
  its own pass with screenshots.
- The dashboard XP/rank/streak module is product behaviour (not styling) —
  whether an enterprise coaching tool should show an XP ladder at all is a
  Day 195+ product decision, not a patch.
- Tailwind theme-token extraction (step 3 above) — Day 195 candidate.

**Day 195 recommendation:** either (a) the token pass — add semantic colours
to `tailwind.config` and migrate the shared `ui/` components onto them, or
(b) continue route-by-route cleanup (`/admin/users` fuchsia, `/coaching`
sub-tab residual cyan CTAs, `HealthBadge`/`DashboardKpis` colour maps).

---

## §25 — Global Command Centre shell upgrade (Day 195)

Scope: WEB-only. The first *visible* slice of the full-app transformation:
global shell, layout and shared-component surfaces upgraded so every shell
page improves at once. No routes, behaviour, API or product logic changed.

### What shipped

**Typography — the headline fix.** `layout.tsx` has always loaded Geist and
set `--font-geist-sans`, but `globals.css` overrode the body with
`font-family: Arial`. The entire app was rendering in Arial. The body now
uses Geist (with system fallbacks) — an instant, app-wide premium shift with
zero new dependencies. Also added: thin quiet scrollbars
(`scrollbar-width: thin`) and indigo-tinted text selection.

**Depth model.** The shell page background dropped from flat `neutral-950`
to a near-black `#060609` overlaid with a faint indigo radial glow at the
top of the viewport (`rgba(99,102,241,0.08)`, fading by 60%). Because
almost every card in the app is `bg-neutral-950`, this one change gives
*every existing card on every page* elevation contrast for free — the
core "less flat/template" fix, with no per-route edits.

**Shell panels.** Sidebar and topbar are now translucent
(`bg-neutral-950/70 backdrop-blur-xl`) with softened borders
(`border-neutral-800/60`), so the ambient glow reads through the chrome.

**Navigation states.** Active nav item upgraded from a grey block to an
indigo-tinted surface (`bg-indigo-500/10` + existing indigo accent bar and
icon). `WorkspaceTabs` active underline emerald → indigo (last emerald
action-state in the shell).

**Cards.** `SectionCard` and `StatCard` gained a soft shadow
(`shadow-md shadow-black/20`) and softened default borders
(`border-neutral-800/70`). Tinted variant colours untouched.

**Layout.** `PageContainer` now clamps content at `max-w-[1400px] mx-auto`
with `lg:px-8` (the Day 194 deferral, done as part of this pass and
browser-verified).

`/dashboard` was the proof page — no dashboard-side adjustments were needed;
the shell changes carried it.

### Observations (not changed)

- `/calls` has no index page (only `/calls/[id]`); the sidebar "Calls" item
  correctly targets `/call-library`. Pre-existing; confirmed absent in
  `backup-pre-day195` too. A future tidy could remove `'/calls'` ambiguity
  from `SHELL_PATHS` comments or add a redirect stub.
- Shared buttons are still not centralised — CTA styling remains per-route
  Tailwind. A `ui/button.tsx` primitive is the natural Day 196+ companion to
  the token pass.
- Legacy non-shell pages (login etc.) keep the plain `HeaderClient` layout;
  they now inherit Geist but none of the shell depth model.

### Theme-readiness

The depth model concentrates "brand atmosphere" in exactly two places — the
app-shell background classes and the indigo accents already mapped in
component variant `Record`s — so a future theme swaps one gradient and one
hue. No switcher built (deliberate).

**Day 196 recommendation:** route-group visual upgrades on the demo path
(`/coaching` first: tab bar spacing, card rhythm, queue tables), or the
Tailwind semantic-token pass + shared `ui/button.tsx` so CTA styling joins
the system. Shell is now strong enough that route work is polish, not
rescue.

---

## §26 — Coaching Command Centre visual pass (Day 196)

Scope: WEB-only, visual-only. `/coaching` (the key buyer/demo surface,
4,082-line route) aligned with the Command Centre shell. All handlers,
tabs, filters, collapsibles, links, data fetching and empty states
preserved — colour/spacing class changes plus one additive shared prop.

### The structural fix — card body insets

Every one of the 14 `SectionCard` bodies on this page rendered its content
flush against the card edges (lists touching the rounded border and the
header divider) — the single biggest "cramped/template" signal on the
route. `SectionCard` gained an additive `padded` prop (default **false** —
zero change to any other consumer) that wraps the body in `px-5 py-4`,
aligning body content with the `px-5` header. All 14 coaching SectionCards
now pass `padded`; dividers in "Today's priorities" become inset, list
rows breathe, empty states sit generously.

### Colour-role corrections

- **Six emerald action buttons → indigo** ("Assign sparring", "Assign
  Coaching", "Assign", "Mark complete" — real actions, not statuses),
  matching the page's existing indigo CTA recipe.
- **`SectionCard` `coaching` variant retired from emerald to neutral**
  (used only by this route — verified): "Estimated Manager Time Saved",
  "Coaching Impact", "Recent Sparring", "Queue-assigned sparring" and
  "Sparring score trend" were five large green-tinted panels; they now
  render as calm neutral cards. The variant key stays for future theming;
  green survives inside them only as status values (`StatCard
  variant="success"`).
- **Rep-band filter chips cyan → indigo** (active filter state is an
  action, mirroring the Day 190 `/crm/actions` precedent).
- **`watch` band cyan → amber** in `URGENCY_LEFT`/`URGENCY_LABEL_CLS`,
  aligning with the shared `RiskBadge`/`StatusBadge` (watch = amber
  everywhere now). "Momentum recovering" keeps cyan as an informational
  accent.
- Overview "Upload Call" CTA normalised to the canonical
  `bg-indigo-600 hover:bg-indigo-500`.

### Rhythm

Tab content containers harmonised: Overview `space-y-5 → space-y-6`
(matches the PageContainer rhythm), Assignments/Replay/Review
`space-y-3 → space-y-4`.

### Not changed (verified fine)

"Mark Reviewed" buttons are already neutral secondary; priority/status
pills (red/amber/neutral) are status-correct; the Coaching Queue's indigo
"Review call" links unchanged; error banners red, success notices emerald
(status roles). Remaining `text-cyan-*` instances are informational
accents within the allowed role.

**Day 197 recommendation:** either the Tailwind semantic-token pass +
shared `ui/button.tsx` primitive (the emerald→indigo button recipe swap
was six copies of one string — a Button component would have made it one
line), or continue the route-group pass to `/calls/[id]` + the Review
Queue surfaces.

---

## §27 — Call review workspace visual pass (Day 197)

Followed §26's Day 197 recommendation (route-group pass to `/calls/[id]`).
WEB-only, visual-only — no data fetching, scoring, audio, assignment,
review, transcript, or timeline behaviour changed. UK spelling.

The call detail page is the manager's core review surface, but it predated
the Command Centre system: no width clamp, a white "active" pill in the
section nav, flat cards up top and completely bare sections (plain `h2` +
colourless borders) for Player, Pins, Whisperer Moments, Coach assignments,
and CRM at the bottom.

### Layout & shell alignment

- `<main>` now clamps to the shell width: `mx-auto max-w-[1400px] px-6
  py-6 lg:px-8` (matches PageContainer; the sticky nav's negative-margin
  full-bleed gained matching `lg:-mx-8 lg:px-8`).
- Sticky section nav background aligned to the Day 195 shell
  (`bg-[#060609]/90 backdrop-blur-md`); the active pill went white →
  indigo (`bg-indigo-500/20 text-indigo-200`), matching WorkspaceTabs.

### Call intelligence hierarchy

- Summary band: hero score circle enlarged (h-14 → h-16) and now
  status-tinted by band (emerald ≥80 / amber ≥60 / red below — status
  colour only, matching ScorePill), card gained the standard
  `shadow-md shadow-black/20` depth.
- Processing banner picked up a pulsing indigo activity dot (non-failed
  states) and the standard card treatment.
- Review Bot, Post-action, Rubric, and Transcript cards gained the same
  depth shadow — the page now reads as one elevated console.

### SectionCard adoption (Day 196 `padded` prop)

The five bare bottom sections were converted to the shared `SectionCard`
with `padded` bodies, keeping their `<section id>` anchors for the
sticky-nav scroll and IntersectionObserver:

- **Player** → eyebrow "Playback" / title "Call recording"; pin ticks on
  the seek bar went white → indigo, pin input/button styled to the system
  (indigo-tinted Pin action), "No audio" empty state calmed red → neutral.
- **Pins** → eyebrow "Moments"; pin count in header actions; timestamps
  are indigo jump-links; delete is a neutral bordered button.
- **Whisperer Moments** → `variant="ai"` (indigo tint, matching the
  /coaching Whisperer panels); selected outcome chip emerald → indigo
  (it marks a manager selection, not a success state).
- **Coach assignments** → eyebrow "Coaching"; item count in header
  actions; quick-assign inputs normalised to `bg-neutral-900`; "Assign to
  rep" is now a canonical indigo primary.
- **CRM** → eyebrow "CRM" / title "Linked records"; "Open CRM panel"
  moved into header actions; zinc chips normalised to neutral.

### Noisy colour cleanup

- "Practice this now →" white/black button → canonical `bg-indigo-600`.
- Transcript Rep speaker label emerald → indigo (identity, not status).
- CRM drawer: white "Link" button → indigo; "Create contact" action
  emerald → indigo; colourless borders/dividers → neutral-800.
- Coach drawer: solid `bg-red-600` "Remove" → calm bordered
  `border-red-500/30 text-red-300 hover:bg-red-500/10` (red kept, as
  destructive is a status role); borderless cards → neutral-800.
- Both drawers gained `shadow-2xl shadow-black/50` panel depth.
- Fixed a latent `border-top` typo class (→ `border-t`) in the CRM drawer.

### Not changed (verified fine)

All handlers, deep links (`?panel=crm`, `a`/`c` shortcuts), drawer
open/close state, pin create/delete, moment outcome marking, quick-assign,
mark-reviewed, and CRM link/unlink flows untouched. Green/amber/red remain
status-only (score bands, urgency chips, Reviewed ✓, transcript
availability). `PinButton.tsx`, `PinList.tsx`, `score-box.tsx` in the
route folder are orphaned (never imported) — left for a dead-code tidy.

Live-proofed as Dana on the seeded "Daniel Cormier — Objection Coaching
Call" (79/100): route renders, drawers open, no console errors.

**Day 198 recommendation:** the shared `ui/button.tsx` primitive +
semantic-token pass (§26's deferred option — Day 197 again hand-copied
the indigo recipe several times), or delete the three orphaned
`calls/[id]` helper components, or extend the pass to the Review Queue
tab surfaces inside /coaching.

---

*Day 177 — audit only; no code changed. Day 178 — navigation + trust cleanup.
Day 179 — layout consistency + trust pass 2. Day 180 — coaching Overview diet.
Day 181 — coaching Overview final cleanup. Day 182 — CRM + Upload consistency
pass. Day 183 — call detail premium pass. Day 184 — orphaned review route
cleanup. Day 185 — dead-code + shell-path cleanup. Day 186 — CRM detail +
secondary CTA cleanup implemented as above. Companion validators:
`scripts/validate-premium-ux-day-177.sh`,
`scripts/validate-premium-ux-day-178.sh`, `scripts/validate-premium-ux-day-179.sh`,
`scripts/validate-premium-ux-day-180.sh`, `scripts/validate-premium-ux-day-181.sh`,
`scripts/validate-premium-ux-day-182.sh`, `scripts/validate-premium-ux-day-183.sh`,
`scripts/validate-premium-ux-day-184.sh`, `scripts/validate-premium-ux-day-185.sh`,
`scripts/validate-premium-ux-day-186.sh`. Day 187 — CRM manager surfaces
consistency pass. Companion validator:
`scripts/validate-premium-ux-day-187.sh`. Day 188 — CRM auto-assign legacy
route retirement. Companion validator:
`scripts/validate-premium-ux-day-188.sh`. Day 189 — direct backend fetch /
proxy-bypass sweep. Companion validator:
`scripts/validate-premium-ux-day-189.sh`. Day 190 — CRM tasks/actions
button-system pass. Companion validator:
`scripts/validate-premium-ux-day-190.sh`. Day 191 — CRM dead client component
cleanup (above). Companion validator:
`scripts/validate-premium-ux-day-191.sh`. Day 192 — CRM rep detail
button-system pass (above). Companion validator:
`scripts/validate-premium-ux-day-192.sh`. Day 193 — orphaned rep route cleanup
(above). Companion validator: `scripts/validate-premium-ux-day-193.sh`.
Day 194 — Gravix Command Centre visual direction + system pass (above).
Companion validator: `scripts/validate-premium-ux-day-194.sh`.
Day 195 — global Command Centre shell upgrade (above). Companion validator:
`scripts/validate-premium-ux-day-195.sh`. Day 196 — coaching Command Centre
visual pass (above). Companion validator:
`scripts/validate-premium-ux-day-196.sh`. Day 197 — call review workspace
visual pass (above). Companion validator:
`scripts/validate-premium-ux-day-197.sh`.*
