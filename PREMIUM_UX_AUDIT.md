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

*Day 177 — audit only; no code changed. Day 178 — navigation + trust cleanup.
Day 179 — layout consistency + trust pass 2. Day 180 — coaching Overview diet.
Day 181 — coaching Overview final cleanup. Day 182 — CRM + Upload consistency
pass. Day 183 — call detail premium pass. Day 184 — orphaned review route
cleanup. Day 185 — dead-code + shell-path cleanup implemented as above.
Companion validators: `scripts/validate-premium-ux-day-177.sh`,
`scripts/validate-premium-ux-day-178.sh`, `scripts/validate-premium-ux-day-179.sh`,
`scripts/validate-premium-ux-day-180.sh`, `scripts/validate-premium-ux-day-181.sh`,
`scripts/validate-premium-ux-day-182.sh`, `scripts/validate-premium-ux-day-183.sh`,
`scripts/validate-premium-ux-day-184.sh`, `scripts/validate-premium-ux-day-185.sh`.*
