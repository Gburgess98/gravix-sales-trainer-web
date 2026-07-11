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

## §28 — Shared Button primitive + call-detail dead helper cleanup (Day 198)

Followed §27's Day 198 recommendation (both options: the button primitive
AND the orphaned helper deletion). WEB-only, behaviour-preserving — no
handler, route, form-type, or data change. UK spelling.

### The primitive — `src/components/ui/button.tsx`

Days 195–197 hand-copied four Tailwind button recipes per call site.
The new primitive canonicalises them:

- `Button` — `forwardRef` button; spreads all native props (onClick,
  disabled, aria-*, title); **defaults `type="button"`** so drawer/form
  buttons can't accidentally submit (the CRM drawer "Link" passes
  `type="submit"` explicitly).
- `buttonClasses(variant, size, className?)` — class-only helper so
  `<Link>`/`<a>` elements share the recipes without changing element
  semantics (no behavioural wrapper around Next.js Link).
- Variants: `primary` (solid indigo), `secondary` (indigo tonal
  `bg-indigo-600/20`), `ghost` (neutral bordered — the default),
  `danger` (bordered red). Sizes: `sm` (px-2.5 py-1 text-xs),
  `md` (px-3.5 py-1.5 text-sm). Uses `clsx` (already a dependency).
  Exported from the `@/components/ui` barrel.

### Migration scope (deliberately narrow)

**`/calls/[id]`** — 13 simple elements: header Link CRM / Assign Drill
(ghost), Preview Slack anchor (via `buttonClasses()`), Mark Reviewed
(secondary), Assign Coaching (ghost), Pin at (secondary md), Pins Delete
+ assignments Delete (ghost), Assign to rep (primary), Open CRM panel
(ghost), drawer Link submit + Save Assignment (primary md), coach-drawer
Remove (danger).

**`/coaching`** — the 8 copy-pasted indigo-tonal `<Link>` recipes
(Review Call/call, Open Rep, Assign drill →, queue actions) moved to
`buttonClasses('secondary')`; ~42 rendered elements share one recipe now.

**Deliberately NOT migrated (validator-pinned or stateful):**

- `/coaching` Upload Call CTA and the six `hover:bg-indigo-500/20`
  assign/complete buttons — their literal class strings are contract
  checks in `validate-premium-ux-day-196.sh`.
- `/calls/[id]` "Practice this now →" CTA — pinned by
  `validate-premium-ux-day-197.sh`.
- Conditional/stateful chips (section nav pills, moment outcome chips,
  filter chips), search-result rows, plain-link Close/Review-another-call
  anchors. These carry state-dependent class logic; converting them is
  not a string swap and stays out of scope.

### Dead helper cleanup

`src/app/calls/[id]/PinButton.tsx`, `PinList.tsx`, and `score-box.tsx`
deleted after proving **zero references** across `src/`, `tests/`,
`scripts/`, and config (grep for `PinButton|PinList|score-box|ScoreBox`
excluding the files themselves — empty). The live pin UI in `page.tsx`
never imported them. Note: `score-box.tsx` was the sole consumer of
`setScore` in `lib/api` — that export is now dead code (future tidy,
same bucket as the Day 193 dead rep exports).

### Behaviour preserved

All onClick handlers, disabled expressions, labels, aria attributes, and
the submit type moved verbatim onto `Button` props; `Button` spreads
native props so nothing is filtered. Live-proofed as Dana: /calls/[id]
header buttons render from the primitive, Assign Drill still opens the
coach drawer, Save Assignment renders as primary and stays enabled/disabled
correctly; /coaching Overview renders with the tonal links on the
primitive recipe and the pinned Upload CTA untouched. No console errors.

**Day 199 recommendation:** extend Button adoption route-group by
route-group (CRM surfaces next — `/crm/accounts`, `/crm/reps/[id]` carry
the same hand-copied recipes), or the semantic colour-token pass
(`indigo-600` → named action token) now that recipes live in one file,
or tidy the dead `lib/api` exports (`setScore` + Day 193's rep exports).

---

## §29 — Call Library / Sparring visual pass (Day 199)

**Scope:** `/call-library` (all three tabs — Live Calls, AI Sparring,
Call Uploads) plus its `SparringStartButton` opponent modal (only
imported by this route). WEB-only, visual-only; no behaviour change.

### What was flat / noisy

- Hand-rolled tab bar with a **white** active underline — every other
  workspace (coaching, CRM detail) had moved to `WorkspaceTabs` with the
  indigo active state on Day 195.
- Filter chips (View, status, score band) inverted to **solid white**
  when active — the loudest element on the page and off-system.
- All three tab bodies sat in flat `rounded-lg border` boxes with no
  elevation — pre-Day-195 card language.
- Row "Open" links were underlined text; the load-more and
  "Open + link CRM" buttons were one-off hand-rolled recipes.
- Empty states were bare left-aligned grey sentences with no next step.
- The sparring opponent modal carried the old **emerald** arcade accent
  on mode chips, preset selection, input focus rings, and the Begin CTA.

### Changes

- Tabs → shared `WorkspaceTabs<Tab>` (indigo active underline, same
  rhythm as /coaching). Deep-link `?tab=` handling untouched (same
  `setTab` state, same mount-time query read).
- Active filter chips: white inversion → indigo tonal
  (`border-indigo-500/40 bg-indigo-500/15 text-indigo-200`); disabled
  and idle states unchanged.
- All three tab bodies → `SectionCard` (elevation, rounded-xl, header
  divider). Live tab: title "Latest analysed calls", sort select as
  header action, "Checking assignments…" as conditional subtitle.
  Sparring tab: title + subtitle + `SparringStartButton` as header
  action, persona/difficulty presets in a calm config row below the
  header. Uploads tab: `padded` SectionCard with title/subtitle.
- Empty states → shared `EmptyState` with a sub-line and, where it
  helps, an "Upload a call" → `/upload` action (live-empty + uploads).
- Day 198 Button adoption: row "Open" links → `buttonClasses('secondary')`,
  load-more → `Button` (ghost), uploads "Open + link CRM" → `Button`
  (ghost, handler verbatim), modal Cancel/Begin → `Button` ghost/primary.
- Search input + sort/preset selects: neutral focus ring → indigo.
- `SparringStartButton` modal: emerald mode chips / preset borders /
  focus rings → indigo; emerald Begin → primary Button. Emerald now
  appears on this route only as the scored/completed status dot.
- Live call rows gained a quiet `hover:bg-neutral-900/40`; upload cards
  calmed to `border-neutral-800` with hover border/bg.

### Behaviour preserved

Tab state + `?tab=` deep link, search debounce, scope/visibility
forcing, status/score/rep/tag filters, sort, cursor pagination
(`loadMore` disabled expression verbatim), assignment badge enrichment,
5s processing poll, sparring session/persona loads with their error
strings, `SparringStartButton` session POST body and redirect — all
untouched. Browser-proofed on the dev preview: all three tabs render,
`?tab=sparring` selects the sparring tab (indigo active), modal opens
with indigo Begin/ghost Cancel and zero emerald, empty/error states
render inside the new cards (unauthenticated preview shows the expected
`missing_user` error styling).

**Day 200 recommendation:** CRM workspace Button/`WorkspaceTabs`
adoption (`/crm/accounts`, `/crm/reps/[id]` still carry hand-copied
recipes and white-active chips), or the semantic colour-token pass now
that all demo-path surfaces sit on the shared system.

---

## §30 — Day 200 visual milestone: full QA sweep + CRM workspace adoption

**Scope:** consistency sweep across the upgraded app to close the
Days 194–199 visual sprint. WEB-only, patch mode, behaviour-preserving.
This is the **Day 200 visual milestone**: every core demo-path surface
now sits on the Command Centre system (Geist, near-black shell, indigo
action colour, SectionCard elevation, shared Button recipes, green/amber/red
reserved for status).

### Pages checked

/dashboard, /coaching, /calls/[id] (source), /call-library (+ ?tab=sparring),
/upload, /crm/accounts, /crm/accounts/[id], /crm/reps/[id], /crm/manager,
/crm/tasks, /crm/actions — audited by source grep for white-active chips,
hand-copied recipes, emerald/cyan action colours, fuchsia/purple/pink,
and light-theme outliers; representative routes opened in the dev preview.

### Fixed now (low-risk, visual-only)

- `/crm/accounts/[id]` rescue-tasks urgency filter: the **white-active**
  "All" chip (last one in the app's active surfaces) → indigo tonal.
  The red/amber/cyan actives stay — they mirror the urgency semantics.
- `/crm/accounts/[id]`: rep-performance link and contact "Open →" off
  cyan → neutral; 4× cyan form focus rings → indigo.
- `/crm/accounts`: "Default View" sort toggle active cyan → indigo tonal
  ("Needs Intervention" stays red — semantic); 7× cyan focus rings →
  indigo; account cards' hover border + title hover cyan → indigo;
  owner-role pill cyan → neutral; "Open →" pill cyan → indigo tonal.
- `/dashboard`: "Upload a call →" action link cyan → indigo.
- Deleted **both** orphaned, never-imported, light-theme
  `ContactHealthClient.tsx` components (`crm/accounts/[id]/` and
  `crm/contacts/[id]/` — `bg-white`/`slate-50`/`emerald-50` outliers;
  zero references remained). Day 191 dead-client pattern.

### Deferred to Day 201+ (documented, untouched)

- `/dashboard` full Command Centre pass — the page keeps arcade-leaning
  elements (XP/tier colours incl. `diamond: text-cyan-300`, "missions"
  strip, cyan stat accents, cyan chart stroke). Needs its own day, not
  a drive-by. Highest-value next candidate — it's a first-screen surface.
- Cyan "medium" urgency (UrgencyPill + matching filter chip active on
  `/crm/accounts/[id]`) — semantic pair; changing it means picking a
  proper medium-urgency colour across CRM in one pass.
- `/crm/Leaderboard` — still orphaned/light-theme (Day 187 note stands).
- Literal indigo recipes on `/crm/accounts`, `/crm/tasks`, `/crm/actions`
  stay hand-copied for now: day-182/190 validators pin those exact
  strings, so Button adoption there should come with a validator-refresh
  day, not a drive-by (same policy as the day-196/197 pins in Day 198).
- Semantic colour-token pass (`indigo-600` → named action token) remains
  open — recipes are centralised in `ui/button.tsx`, so it is now cheap.

### Behaviour preserved

Colour-class-only edits plus deletion of two never-imported files. All
handlers (`setRescueFilter`, `setSortMode`, search inputs, unlink,
create-account/contact forms), hrefs, disabled states, and empty states
untouched. Day-182/186/187/190/192 validator pins checked before every
edit — the pinned strings are negative cyan checks or recipes this
sweep did not touch.

**Day 201 recommendation:** `/dashboard` Command Centre pass (retire the
arcade XP/tier/mission styling, adopt SectionCard/StatCard rhythm), then
the colour-token pass with a validator-pin refresh.

---

## §31 — Dashboard Command Centre pass (Day 201)

**Scope:** `/dashboard` only — the Day 200 milestone's named highest-value
holdout. WEB-only, visual/copy pass, strict behaviour preservation: all
data fetches, calculations, handlers, hrefs, disabled states and
conditional rendering untouched.

### Audited (arcade/gamified areas found)

- XP language throughout: "XP & Progression" panel, "Today's XP" stat,
  "Total XP", "+N XP today", "No XP yet … unlock badges" empty state.
- Gamer rank ladder (`RANK_NAMES`: Novice → Trainee → Prospect → Closer →
  Performer → Elite → Legend) shown in the header chip and progression bar.
- Mission language ("Today's Mission" strip, "Mission Centre").
- Cyan off status duty: `diamond: text-cyan-300` tier colour, Expected
  Impact `text-cyan-300`, mission time `text-cyan-400/80`, cyan chart
  stroke `#22d3ee`, cyan `info` StatCard variant on Streak, two cyan
  `recommendation` AiInsightCards.
- Emerald off status duty: "Today's XP" success tint, mission impact
  `text-emerald-400/80`, "+N XP today" `text-emerald-400/70`, "all clear"
  success tint on zero open assignments.
- Five hand-rolled `rounded-xl border` card shells (pre-SectionCard
  template feel, px-4 py-3 headers, no elevation).
- No fuchsia/purple/pink found (Day 194 already cleared these).

### Language reframed (professional sales-performance vocabulary)

- "XP & Progression" → **Development Progress**; "Current Rank" →
  **Performance Level**; "Total XP" → **Progress Points**; "Today's XP"
  stat → **Progress Today** ("points earned today"); progress bar copy
  "N / 100 XP — M to next rank" → "N / 100 points — M to next level";
  "Tier:" row → **Operating level:**.
- Rank ladder renamed to a professional development ladder (Foundation,
  Developing I–III, Emerging I–III, Established I–III, Advanced I–III,
  Expert I–III, Principal). Cosmetic array only — same length, same
  `xpLevel()` maths, no backend change.
- "What should I do next?" card → **Next Best Action** (matches the
  AiInsightCard vocabulary); mission impact strings "XP + coaching
  compliance" / "XP + streak" → "Coaching compliance" / "Coaching
  momentum".
- Empty state "No XP yet … earn XP, build your rank, and unlock badges"
  → "No progress recorded yet … build your performance level and reach
  your next milestone" (rewards → milestones).

### Colour calmed (green/amber/red = status only, indigo = action/AI)

- `diamond` tier colour cyan → indigo; Expected Impact cyan → neutral;
  mission Impact emerald / Time cyan → neutral; voice-trend chart stroke
  `#22d3ee` → indigo `#818cf8`.
- KPI strip: Progress Today and Streak stats → `default` (earning points
  is not a status); Open Assignments amber/emerald states → `danger`
  only when overdue, otherwise neutral. Voice Score keeps its
  success/warning/danger banding — genuine performance status.
- Development Progress: streak amber → white; "+N points today" emerald
  → neutral. AI briefing keeps amber weakest / emerald strongest /
  red overdue — real signals.
- "Getting Started" and no-data feedback AiInsightCards: cyan
  `recommendation` type → indigo `summary` (labels unchanged).

### Structure / primitives

- Five hand-rolled card shells → **SectionCard** (AI Daily Briefing on
  `variant="ai"` with the urgency/trend chips as header actions and the
  awaiting-data chip as subtitle; Next Best Action; Skill Momentum;
  Performance Progress with latest-avg + trend chip as actions;
  Development Progress). Uniform px-5 py-4 header rhythm + shadow
  elevation from the shared primitive.
- "Start now →" CTA → `buttonClasses('secondary', 'md')`; footer quick
  links → `buttonClasses('ghost', 'sm')`.

### Behaviour preserved

All four proxyFetch endpoints (`/v1/reps/me`, `/v1/assignments`,
`/v1/dashboard/voice-score-trend?days=30`, `/v1/reps/:id/daily-feed`),
`nextAction`/`computeBriefingData` logic, `hasAnyData`/`totalXp`/`mission`
conditional branches, the EmptyState upload onClick, recharts wiring and
all hrefs untouched. Day-179/194/200 dashboard validator pins re-checked:
the pinned `href="/upload"` indigo link literal is retained verbatim.

### Deferred

- Semantic colour-token pass (indigo-600 → named action token) — still
  the cheapest global win; needs a validator-pin refresh day.
- Day-182/190 pinned CRM recipes (Button adoption there still blocked).
- `/crm/Leaderboard` orphan and the cyan "medium" urgency pair (Day 200
  notes stand).

**Day 202 recommendation:** the colour-token pass with validator-pin
refresh, or the `/assignments` workspace visual pass (next most-visited
rep surface still on the old rhythm).

---

## §32 — Assignments workspace pass (Day 202)

**Scope:** `/assignments` only (`src/app/assignments/AssignmentsClient.tsx`)
— the rep-side coaching follow-through surface, last touched structurally
on Day 179 (PageContainer only). WEB-only, visual/copy pass, strict
behaviour preservation: all data fetches, completion/snooze/streak logic,
handlers, hrefs, disabled states and conditional rendering untouched.

### Audited (task-list/arcade areas found)

- Task-list header copy: "Clear tasks, fast wins. Keep your streak
  alive." subtitle; "Daily Win" panel with emoji chips (✅ 🔥 🎯) and
  "(takes 2 mins)" framing.
- Arcade toast copy: "Completed ✓ (+XP soon)"; raw "XP today" chip.
- Streak copy in task language ("Finish one task…", "Streak reset.
  Let's restart strong today.").
- Seven hand-copied white CTA recipes (`bg-white text-black`) — the
  pre-Day-198 primary button, retired everywhere else on Day 200.
- White progress bar fill (`bg-white/60`).
- Sky (cyan-family) "Auto-created" origin badge.
- Raw internal values rendered to reps: `a.type` shown as
  `call_review`/`custom`; raw error codes shown bare.
- Pre-Day-195 flat card shells: "Daily Win", "Momentum", plain `h2`
  Open/Completed sections, hand-rolled empty states, no elevation.
- Duplicate Tailwind bg classes on the overdue card recipe
  (`bg-neutral-950` + `bg-red-500/10`).
- No fuchsia/purple/pink found.

### Language reframed (coaching follow-through vocabulary)

- Subtitle → "Your coaching queue — drills, call reviews and follow-ups
  from your manager." (kept the `My Assignments` h1 — pinned by
  `tests/e2e/assignments.spec.ts`).
- "Daily Win" panel → **Next Best Action** SectionCard (matches the
  Day 201 dashboard vocabulary); emoji chips stripped; "Next best
  action: Run this drill now (5 mins)" family → "Next step: run this
  sparring drill" / "review and score the call" / "mark complete once
  done".
- "XP today: N · total M" chip → "Progress today: N pts · total M"
  (Day 201 points vocabulary); "Streak" chip → "Practice streak";
  "You're back on track ✓" → "Completed today ✓"; streak warn/reset
  copy moved from task language to practice-streak language.
- Toast "Completed ✓ (+XP soon)" → "Assignment completed" (also the
  cross-tab BroadcastChannel reason string — copy-only).
- Raw `a.type` → `typeLabel()` (Sparring drill / Call review / Coaching
  task); bare error codes now prefixed "Something went wrong."
- Empty states reworded calm ("When your manager assigns a drill or
  call review, it will appear here.").

### Colour calmed (green/amber/red = status only, indigo = action)

- All seven white `bg-white text-black` CTAs →
  `buttonClasses('primary', 'md')` / `<Button variant="primary">`
  (Start sparring, Start review / Pick a call, Mark complete ×3,
  Start now, Review call); Snooze 24h + Refresh → ghost recipe.
- Progress bar fill white → indigo-500; "Auto-created" origin badge
  sky → indigo.
- Kept: emerald COMPLETED pill + "Completed today ✓" chip (genuine
  success), amber flagged-call badge + streak warning (genuine
  attention), red overdue wash/badges/critical (genuine risk).

### Structure / primitives

- Header: awkward outer flex (Refresh/Back vertically centred against
  the tall left column) → `PageHeader` `actions` slot (ghost Refresh
  Button + ghost Back link, href preserved).
- "Next Best Action" → **SectionCard** (eyebrow "Today", padded).
- "Momentum" hand-rolled panel → five **StatCard**s (Open; Overdue
  `danger` when > 0; Due today `warning` when > 0; Completed 7d with
  "+N today" subtext; Completion rate 7d). Same `momentum` maths.
- Open / Completed plain `h2` sections → **SectionCard padded** with
  count in the actions slot; hand-rolled empty states → **EmptyState**
  (Go to Sparring href preserved).
- Today's Focus card kept hand-rolled (dynamic overdue red wash +
  left accent bar) but gains the shared `shadow-md shadow-black/20`
  elevation; overdue duplicate-bg recipe fixed (single bg per state).

### Behaviour preserved

`/v1/assignments`, `/v1/reps/me` and the `PATCH /v1/assignments/:id/complete`
optimistic flow untouched; snooze read/write/clear, localStorage streak
state, BroadcastChannel/storage/visibility refresh listeners, auto-focus
scroll + highlight ring, `sparringHref`/`callReviewHref`/`/sparring`/
`/crm/overview` hrefs, title attrs, disabled states and all conditional
rendering intact. Day-179 pin (PageContainer) and the e2e-pinned
"My Assignments" heading retained.

### Deferred

- Semantic colour-token pass — still the standing recommendation.
- Streak/snooze localStorage mechanics are client-only trust debt
  (server knows nothing of snoozes) — product decision, not visual.
- `/admin/assignments/*` manager surfaces — separate lane.
- Day-182/190 pinned CRM recipes (unchanged).

**Day 203 recommendation:** the colour-token pass with validator-pin
refresh, or `/admin/assignments` + `/coaching?tab=assignments` manager
assignment surfaces for cross-side consistency.

---

## §33 — Semantic colour tokens + validator-pin refresh (Day 203)

**Scope:** design-system foundation/hardening pass. WEB-only. No product
behaviour, routes, API, migrations, features, theme switcher or white-label
settings. Rendered colour output is **byte-identical** — proven by compiling
`globals.css` and confirming each token class resolves to the same oklch as the
raw palette utility it replaces (12 pairs, incl. `/opacity` modifiers, which
Tailwind resolves through the var chain at build time).

### Token mapping (`src/app/globals.css`, `@theme`)

Semantic roles alias the current Tailwind palette 1:1 via `var()`:

| Role      | Palette  | Meaning                                    |
|-----------|----------|--------------------------------------------|
| `brand`   | indigo   | primary action / AI / brand accent         |
| `accent`  | cyan     | sparing highlight + "medium" urgency pair   |
| `success` | emerald  | positive status only                        |
| `warning` | amber    | caution status only                         |
| `danger`  | red      | error / destructive / at-risk status only   |

Only the shades the shared components use are aliased (brand 200–600, accent
300/500, success 100–600, warning 300–600, danger 100–600). Surface / card /
border / muted stay on the **neutral** scale — the components already use it
consistently, so no alias was added there (deliberate; avoids churn and keeps
the Day-195/196 neutral pins literal).

### Components migrated (raw palette → semantic token)

- `ui/button.tsx` — `primary`/`secondary` → `brand`, `danger` → `danger`;
  `ghost` stays neutral.
- `shell/workspace-tabs.tsx` — active underline `indigo-400` → `brand-400`.
- `ui/ai-insight-card.tsx` — all five insight types + the three inline item
  variants → brand/accent/success/warning/danger.
- `ui/stat-card.tsx` — `ai`→brand, `info`→accent, `success`/`warning`/`danger`
  roles tokenised; `default` stays neutral.
- `ui/status-badge.tsx` — RiskBadge, UrgencyBadge, StatusBadge maps + ScorePill
  bands → success/warning/danger/accent; neutral fallbacks unchanged.
- `ui/section-card.tsx` — `ai`→brand, `rescue`/`warning`→warning, `danger`→
  danger; `default`/`coaching` stay neutral literal (Day-195/196 pins).

All variant names, props and public APIs are unchanged — consumers and their
validators (Days 196/199/201/202 pin usage/imports) keep passing untouched.

### Validator-pin refresh

The blocking pins were **not** the days guessed in the task brief; the ones that
actually pinned migrated component internals were:

- **Day 194** — StatCard/AiInsightCard `ai` variant exact indigo literal →
  `(indigo|brand)` intent regex.
- **Day 195** — WorkspaceTabs `border-indigo-400` and StatCard `ai` literal →
  `(indigo|brand)` intent regexes.
- **Day 198** — the four Button recipes → intent regexes accepting the raw
  palette word **or** the token (`(indigo|brand)`, `(red|danger)`), while still
  asserting the full behaviour contract (solid brand primary, brand-tonal
  secondary, neutral ghost, bordered danger). An accidental emerald/cyan primary
  still fails.

Each loosened check carries an inline `Day 203 —` comment explaining why. No
behaviour-protecting check was weakened. Route-file recipe pins (Days 182/190
CRM, 196/197 page literals, 199/201/202 usage) were left literal — they don't
block component-level design-system work.

### White-label readiness

Retinting a whole role for a white-label is now a token-layer edit
(`--color-brand-* → another palette`) with **zero component changes**. Remaining
foundation work before true theming: (1) neutral/surface is still literal across
components — a `surface`/`muted` alias pass would complete the roles; (2) route
files still use raw palette literals directly (intentionally not mass-migrated
this pass); (3) no light-theme token set yet — `@theme` currently maps one dark
palette.

### Deferred

- Surface/muted (neutral) token aliasing + route-file adoption — next increments.
- Light-theme / actual theme switching — explicitly out of scope today.
- `empty-state.tsx`, `page-container.tsx`, `page-header.tsx` — neutral/white
  only, nothing to tokenise; left as-is.

**Day 204 recommendation:** extend the token layer to surface/muted (neutral)
roles and begin opt-in route-file adoption of the semantic classes, or open the
`/admin/assignments` manager-assignment lane for cross-side consistency.

---

## §34 — Admin assignments manager lane visual pass (Day 204)

**Scope:** `/admin/assignments`, `/admin/assignments/queue`,
`/admin/assignments/create` — all three routes render the single
`src/app/admin/assignments/AdminAssignmentsClient.tsx` with a different
`initialView`. Day 202 deliberately left this lane untouched; this pass joins it
up with the Command Centre system and the rep `/assignments` workspace. WEB-only,
visual/copy pass. **Every** data fetch, assignment create/complete/nudge/delete/
reschedule handler, bulk action, manager gate, filter/tab state, href, disabled
state, confirm() and form/button type is preserved — colour-class, copy and a
few presentational-primitive swaps only.

### Active vs orphaned

All three route files are active and imported (`page.tsx` → overview,
`queue/page.tsx` → queue, `create/page.tsx` → create), each linked from
`/coaching`, `/crm/overview` and `HomeLanding`. Nothing orphaned; no route
retired.

### Trust/clarity cleanup (raw/internal removed)

- Removed the **debug badge** ("AdminAssignmentsClient · v2 · has Show/Expand
  controls") that shipped to managers.
- Removed the raw **"View: {view}"** indicator chip.
- Create panel description reworded from developer copy
  ("Prefills from `?rep_id=` / `?repId=` … `#create-assignment`") to
  "Assign a sparring drill, call review or follow-up task to a rep."
- Type `<select>` option labels title-cased (Custom / Sparring / Call review)
  — `value` enums unchanged.
- Queue table Type column now renders `safeTypeLabel(a.type)` instead of the raw
  `call_review`/`custom` enum.
- Header `Admin · Assignments` → **Assignments** via shared `PageHeader`.

### Visual system adoption

- `PageHeader` for the title/subtitle/actions row; Refresh → shared `Button`
  (ghost), Back → `buttonClasses("ghost")` (was underlined link).
- Container clamp `max-w-[1600px]` → `max-w-[1400px]` (shell standard); the
  `min-h-screen` flex column + queue `max-h-[65vh]` scroll structure kept.
- Eight stat tiles (4 overview + 4 Trust) → shared `StatCard`; Overdue tile
  flips to the `danger` variant only when `> 0` (cf. Days 201/202).
- Overview / Queue / Create tabs and the Assigned / Completed / Overdue queue
  filters: active state moved from arcade `bg-white text-black` to the brand
  tonal chip recipe (`border-brand-500/40 bg-brand-500/15 text-brand-200`).

### Colour roles (Day 203 tokens)

- Every arcade white primary CTA (Create, Assign sparring, bulk Assign drill,
  bulk Confirm, Force complete) → brand primary (`bg-brand-600 … text-white
  hover:bg-brand-500`).
- All status/risk styling migrated to semantic tokens: `statusPill`,
  `stuckPill`, `stuckSectionClass`, `assignmentOriginBadge`, the manager
  confidence pills, needs-help overdue text, duplicate-title + weekly heads-up
  warnings, momentum-healthy + created/bulk-result success banners, and every
  error banner. Success/warning/danger stay on genuine status/risk only.
- The off-palette **sky** "Auto-created" origin badge → neutral (origin, not a
  status; mirrors the Day 202 sky retirement). No fuchsia/purple/pink present.
- Two new `-200` shades (`success-200`, `warning-200`) added to the Day 203
  `@theme` token layer (alias emerald/amber 1:1) to cover the status-pill text
  tones this lane needs.

### Behaviour preserved

`createAssignment`, `markComplete` (+ its override confirm()), `setDueToday`,
`nudgeRep`/`nudgeTopForRep`, `deleteAssignment`, `runBulkAction`
(`assign_stale_drill` / `clear_overdue_noise`), `jumpToCreateAndPrefill`,
`prefillSparringForRep`, `setTopOverdueDueToday`, the manager-gate probe
(`/v1/admin/config`), reps/signals/trust loads, per-rep paged manager fetch,
filter/search/limit URL sync, localStorage expand + help-streak state, and all
POST/PATCH/DELETE proxy endpoints are untouched.

### Deferred

- Panels remain hand-rolled `div`s (not `SectionCard`) — nesting + custom
  headers make a wrapper swap higher-risk than value; deferred.
- The `min-h-screen`/`max-h-[65vh]` queue scroll layout was kept rather than
  moved to `PageContainer` (would change scroll behaviour).
- `bg-black` micro-chips left as-is (visually fine, neutral family).

**Day 205 recommendation:** extend the Day 203 token layer to surface/muted
(neutral) roles, or a `/admin` shell-consistency pass (other `/admin/*` manager
surfaces) for cross-side polish.

---

## §35 — Analytics intelligence workspace pass (Day 205B)

**Scope:** `/crm/analytics` (the sidebar Analytics route, manager-gated) plus a
fuchsia sweep on `/admin/users`. WEB-only, visual-only. No API changes, no new
features, no route changes.

### Competitor-inspired principles (extracted, not copied)

Competitor screenshots (Kendo) were used as *principle* references only:

- **Calm hierarchy** — one clear hero surface per page, secondary modules
  visually subordinate, generous confident spacing.
- **Premium workspace framing** — the page reads as an intelligence workspace,
  not a grid of disconnected chart tiles.
- **Curated insight** — every chart carries a plain-English subtitle saying
  what it measures and over what range, so figures read as findings.
- **Enterprise-grade states** — deliberate loading, empty, and error states
  instead of blank axes on empty data.
- **Action adjacency** — insight surfaces end in obvious next actions.

Deliberately **not** copied: Kendo's light theme, hero layout, left context
module navigation, setup-progress meter, editable business-context fields,
Autofill concept, wording, or any visual assets. Gravix stays on its own dark
Command Centre shell and Day 203 semantic tokens.

### What changed — `/crm/analytics`

Previously: hand-rolled header + local KPI `Card`, hardcoded hex palette
(blue-400 line, blue-500 + **violet `#8b5cf6`** bars), per-call-site export
button recipes, and charts that rendered empty axes with no loading/empty/error
handling. A classic "PowerPoint chart grid".

- Page rebuilt on the shell system: `PageContainer` + `PageHeader` (rep/range
  selects as calm header actions), `StatCard` ×4 KPI strip, `SectionCard` for
  every chart module, `Button`/`buttonClasses` for all actions.
- Hero framing: Score performance is now the single `variant="ai"` hero card
  (eyebrow *Intelligence*), with the two bar charts as subordinate modules.
- Chart palette unified on the brand ramp: line `#818cf8` (brand-400), bars
  `#6366f1` (brand-500) — the violet `#8b5cf6` bar is retired. Hexes mirror
  the token palette because Recharts writes SVG presentation attributes, which
  cannot resolve CSS variables.
- Curated subtitles on every module including the live range
  (e.g. "Average call review score per day · last 30 days").
- States: pulse skeleton while first load is in flight, `EmptyState` per chart
  when a range has no data (score trend offers a real "Upload a call" link),
  and a `variant="danger"` error card with a Retry button if the analytics
  fetches fail (previously an unhandled rejection and stale silence).
- Manager next actions: a closing "Act on these insights" card linking to the
  existing review queue (`/coaching?tab=review`), assignments admin
  (`/admin/assignments`) and team workspace (`/crm/manager`). Real routes only.

### What changed — `/admin/users`

Residual fuchsia retired (last active-surface fuchsia in the app): SuperAdmin
tier badge → brand-200/brand-400 chip; impersonation "Active" chip and "Exit
impersonation" link → warning tokens (impersonation *is* a caution status);
"Become User" hover → brand. No handler/gating changes.

### Behaviour preserved

All three analytics fetches (`stage-conversion`, `score-trend`,
`activity-by-rep`), the sessionStorage read-then-refresh cache, the Supabase
`calls` realtime re-load channel, the 90-day rep-options fetch, `exportCSV`,
`exportPNG` (same element ids `score-performance-card`,
`conversion-by-stage-card`, `activity-by-rep-card`; SVG-first export path
untouched), KPI reductions, and the rep/days filter state are unchanged. The
only logic additions are the `loaded`/`loadError` flags feeding the new states.

### Future module (documented, not built): Context Engine / Scorecard Studio

Kendo's strongest product idea is an editable **business-context setup
surface** (company profile, ICP, objections, competitors) feeding scoring, plus
a **scorecard builder** with per-criterion results. Gravix has no scorecard,
context, or config routes today (audited: none exist). Opportunity, for a
future lane — requires API/schema work, so out of scope for a visual pass:

- **Context Engine** — org-scoped editable context fields (business summary,
  ICP, competitors, objection library) that AI feedback/sparring prompts could
  consume; setup-progress affordance; AI-assist prefill *only* when a real
  backend exists (no fake Autofill UI).
- **Scorecard Studio** — manager-defined scoring criteria with weights;
  per-call scorecard results view replacing the single opaque score.

No placeholder routes or fake UI were shipped for either.

### Deferred

- `/crm/overview` analytics blocks (1,457-line page) — separate pass.
- Recharts theming beyond colour (custom tooltip component, axis typography).
- `/admin/users` full shell adoption (PageContainer/PageHeader) — badge-only
  sweep today.

**Day 206 recommendation:** `/crm/overview` intelligence pass (same treatment
as `/crm/analytics`), or the surface/muted token extension carried from Day 204.

---

## §36 — Intelligence + manager workspace v2 (Day 205C)

**Scope:** `/crm/analytics` recomposed as the Intelligence Cockpit, plus
low-risk trust/colour passes on `/crm/overview`, `/crm/manager`
(ManagerClient), and `/admin/users`. WEB-only, visual-only. No API changes, no
migrations, no new routes, no fake features.

### Why Day 205B still read as "basic dark charts"

Day 205B put `/crm/analytics` on the shell system, but composition stayed a
uniform grid: a bare `PageHeader` floating on the background, four
equal-weight KPI tiles with no hierarchy or movement, three same-weight chart
cards on default Recharts styling (dashed cartesian grids, bare axis lines,
flat solid marks), no curated-insight layer between the numbers and the
charts, and next actions as three bare buttons. Structurally sound; visually
still a PowerPoint dashboard.

### What changed — `/crm/analytics` (Intelligence Cockpit)

- **Intelligence hero band** — the page opens with a framed panel (rounded-2xl
  brand-tinted border, layered indigo radial glows echoing the app shell),
  eyebrow *Gravix Intelligence*, `PageHeader` inside it with the rep/range
  selects, and a chip row: a live indicator (honest — the existing Supabase
  realtime channel refreshes on `calls` changes) plus the active scope/range.
- **KPI hierarchy** — *Avg call score* promoted to a featured 2-column card
  (text-4xl value, its own radial sheen) with a **trend delta chip** computed
  from the score trend already fetched (second half of range vs first);
  up = success tint, down = warning tint, steady = neutral. Shows an em dash,
  not a misleading 0, when no calls are scored. Three `StatCard`s remain;
  *Tasks completed* now carries a derived completion-rate subtext.
- **Signals band** — "This range at a glance": up to four plain-English reads
  derived arithmetically from the three existing responses (score direction,
  most-coached rep, task completion rate, busiest pipeline stage). No extra
  fetches, no AI claims — the subtitle says "read automatically from the
  figures in this range". Honest empty line when there is no data.
- **Score performance module** — line chart upgraded to a gradient-filled
  area (brand-400 stroke, fade-to-transparent fill), dashed grid replaced
  with faint horizontal rules only, axis lines/ticks removed, Y domain locked
  0–100, plus a **reading rail** (Latest / Range high / Range low with dates,
  all derived from the same series).
- **Chart framing** — both bar charts get vertical gradient fills on the
  brand ramp, softened grid, no axis lines, `maxBarSize` so sparse data stops
  rendering as slabs, and a brand-tinted hover cursor.
- **Humanised rep labels** — `repLabel()` maps unnamed reps to `Rep a1b2c3`
  (first 6 chars) in the chart axis and rep filter; raw UUIDs no longer
  render. CSV exports keep full-fidelity ids.
- **Intentional empty states** — conversion empty state now sits over muted
  aria-hidden ghost bars (decoration under an explicit "No stage transitions"
  message, not fake data); all three modules keep fixed heights so the page
  doesn't collapse when empty.
- **Next actions** — the three real links (`/coaching?tab=review`,
  `/admin/assignments`, `/crm/manager`) upgraded from bare buttons to
  described action cards with hover affordance; header gains an *Upload a
  call* ghost action (existing route).

Preserved exactly: all three `/v1/crm/analytics/*` fetches, sessionStorage
cache, `analytics-updates` realtime channel, `exportCSV`/`exportPNG` and their
element ids (`score-performance-card`, `conversion-by-stage-card`,
`activity-by-rep-card` — ids now wrap the chart node only, so PNG exports
capture the chart as before), rep/days filters, error card + Retry, loading
skeletons, and the pinned brand hexes `#818cf8`/`#6366f1`.

### What changed — `/crm/overview` (trust pass only)

Active and manager-facing (linked from manager surfaces and assignment flows).
Full recomposition of the 1,450-line page stays deferred; today only:

- Emoji status chips (🟡/🕑/✅ and 🔴/✅/💤 in Manager Trust) replaced with
  semantic status dots (warning/accent/success/danger/neutral).
- Raw `missing_user` error code under "Control Centre unavailable" replaced
  with calm copy; the code moves to a hover `title` for debugging.
- Top Reps medal emojis (🥇🥈🥉) replaced with rank chips (#1–#3 in brand
  tint); active-filter accent moved `sky-500` → `brand-500`; "XP" display
  label reworded to "Points" (same underlying field).

**Build warnings (documented, not faked):** `listCoachAssignments` and
`getTopObjections` are imported from `@/lib/api` but not exported there —
the two Day 205A build warnings. Restoring them needs real helper/API work
(they back the Recent Assignments and Top Objections cards), so they are left
untouched rather than stubbed. Candidate for the Day 206 overview pass.

### What changed — `/crm/manager`

- Header subtitle de-jargonised ("dry-run" parenthetical → plain sentence).
- Failure banner no longer prints the raw error code inline (moved to
  `title`); banner moved onto warning tokens.
- ManagerClient: four `bg-white text-black` primary CTAs (Run auto-assign
  now / Execute this preview / both confirm-modal confirms) moved to the
  brand primary recipe; "from preview" provenance chip emerald → neutral
  (green stays status-only). The Day 187-pinned indigo batch-assign literal
  is untouched; all handlers, disabled states and confirm flows preserved.

### What changed — `/admin/users`

- Filter chips + search focus ring cyan → brand (active/action = brand).
- Tier badges onto tokens: PartnerAdmin raw indigo → brand, Manager cyan →
  accent token, Owner amber → neutral (amber is caution-only).
- Partner-name chip cyan → neutral label; error card onto danger tokens.
- Impersonation flows untouched.

### Not copied / not built

Same boundary as §35: no light theme, no Kendo hero/module-nav/setup-progress
layout, no editable context fields, no Autofill, no scorecard builder, no new
routes. Verified: no `src/app/scorecard`, `src/app/context`, or
`src/app/crm/scorecard` exist.

### Future product opportunities (real features for future lanes, not fake UI)

- **Context Engine** — org-scoped editable business context (company profile,
  ICP, value prop, objection library, competitors) consumed by AI feedback,
  sparring and Whisperer prompts; setup-progress affordance once fields exist.
- **Scorecard Studio** — manager-defined scoring criteria and weights with
  per-criterion results on call review, replacing the single opaque score.
- **AI Scorecard Builder** — generate a draft scorecard from the org's
  context + call history for the manager to edit and approve.
- **AI Autofill from website** — prefill Context Engine fields from the org's
  public site, manager-reviewed before save.
- **Custom scorecards by call type** — different criteria for discovery vs
  demo vs objection-handling calls, selected at upload/review time.

All five need API/schema work — documented here so the demo narrative can
mention direction without shipping placeholder UI.

### Deferred

- `/crm/overview` full Intelligence Cockpit recomposition (incl. restoring
  `listCoachAssignments`/`getTopObjections` exports — needs helper work).
- `/crm/manager` deeper workspace polish (tables, run-history framing).
- Raw "Rep ID" free-text filter inside overview's embedded CRM Analytics
  section — replace with a rep select when that section is recomposed.
- Surface/muted token extension (carried from Days 204/205B).

**Day 206 recommendation:** `/crm/overview` intelligence pass — it is the
weakest remaining high-visibility manager surface, and its two build warnings
should be resolved with real helpers in the same lane.

---

## §37 — Final product quality pass (Day 206)

**Scope:** `/crm/overview` recomposed on the Intelligence Cockpit system
(primary), plus targeted trust/polish on `/crm/manager` (ManagerClient +
RunHistoryTable) and `/settings/profile`. WEB-only, visual-only. No API
changes, no migrations, no new routes, no fake features.

### Surfaces ranked (audited in browser, weakest first)

1. **`/crm/overview`** — pre-shell layout (`max-w-5xl`, own rhythm), bare
   floating header, nested boxes-in-boxes, six different card recipes,
   bare-text empty states, KPI tiles buried mid-page, sparklines silently
   broken (wrong prop name), four perpetual em-dash stub tiles, an embedded
   "CRM Analytics" block with a raw *Rep ID* text input and sky-blue line
   chart. Clearly the weakest active manager surface. **Upgraded.**
2. **`/crm/manager`** — shell-aligned since 205C, but shipped a dev-scaffold
   "Auto-Assign Runner / write flow pending" placeholder card, raw
   `missing_user` mono codes in two error cards, `(mode=fallback)` leak,
   snake_case `run_id:` labels and full raw UUIDs in the rep table.
   **Polished.**
3. **`/settings/profile`** — solid Day 179 shell, but surfaced raw parser
   errors ("Unexpected token '<' … is not valid JSON") directly in the error
   banner; raw palette classes. **Polished.**
4. **`/admin/users`** — already premium after 205B/C. **No change.**
5. **`/upload`** — already demo-ready after Days 163–166 (structured card,
   guidance rail, brand CTA). **No change.**

### What changed — `/crm/overview` (Intelligence Cockpit recomposition)

Render layer rebuilt on the shell system; every fetch, state, handler and
href above it untouched.

- **Hero band** — same framing as `/crm/analytics`: rounded-2xl brand border,
  layered radial glows, *Gravix Intelligence* eyebrow, `PageHeader` with a
  *Manager workspace* action, and the assignments summary (Open / Due soon /
  Completed 7d) as hero status chips.
- **KPI strip promoted** to directly under the hero: featured *Avg coaching
  score* card (2-col, text-4xl, brand sheen) + Total calls + Conversion (90d).
  The KPI sparklines were passing a `data` prop that `Sparkline` doesn't
  accept — they had never rendered. Now wired to the real `values` prop with
  a numeric-series guard, so the score/calls/win-rate series from
  `/v1/dashboard/kpis` actually draw.
- **Performance signals** — the nested Flag-Intelligence-inside-Reporting
  boxes flattened into one `variant="ai"` SectionCard with two labelled tile
  rows (flags / coaching output) on a single tile recipe; *Assign drill*
  moved to the shared button recipe; orange-300 → warning token; honest
  empty copy per row.
- **Control Centre / Nudges / Today’s actions / Manager trust / Recent
  assignments / Top objections / Top accounts / Top reps** — all converted to
  `SectionCard` with consistent title/subtitle/action headers, shared chip
  and tile recipes, `EmptyState` for every empty list, and status chips moved
  to Day 203 tokens (danger/warning/success; brand for open/active).
- **Top objections chart** de-arcaded: the gold/green/rose ranking `Cell`s
  and blue-400 bars replaced with a single brand fill, soft ticks, no axis
  lines, dark rounded tooltip, capped bar width.
- **CRM analytics quick view** — reframed as an explicit *Quick view*
  SectionCard pointing at the full cockpit (*Open Analytics* CTA). The raw
  *Rep ID* free-text input replaced with a rep **select** built from the
  activity-by-rep response already on the page (same `analyticsRep` state and
  values, `null` for all reps — behaviour identical, no raw UUID entry).
  Sky-blue `#38bdf8` line → brand `#818cf8`; summary tiles, stage chips and
  activity rows on the shared recipes with humanised rep labels
  (`repShort()`), plus per-block empty copy and a loading skeleton on the
  existing `loadingAnalytics` state (previously unused).
- **Removed:** the four perpetual em-dash stub tiles (Avg. Handle Time /
  Objection Wins / Follow-ups Sent / Rep Activity) — hardcoded `—` values
  with empty sparklines, i.e. decorative template stubs; and the dead
  static recharts import shadowed by the module's `nextDynamic` versions.
- Raw `repFilter` UUID readout under Top reps replaced by a subtitle state +
  *Reset filter* action.

### What changed — `/crm/manager`

- **Removed the "Auto-Assign Runner" scaffold card** (dashed border, "write
  flow pending" badge, two inert placeholder controls, roadmap copy) — it was
  hard-gated behind `AUTO_ASSIGN_WRITE_UI_ENABLED = false` and was internal
  scaffolding shipped to users. The real read-only Latest run + Run history
  surfaces are unchanged.
- **Rep overview table** onto shell rhythm (uppercase tracked headers, row
  divide + hover, rounded-xl); *Rep ID* column truncated to 8 chars with the
  full id on hover; `No reps found (mode=fallback)` → calm copy with the mode
  in a hover title.
- **Error cards** (ManagerClient + RunHistoryTable) no longer print the raw
  error code in mono under the hint — the code moves to a hover `title`.
- **Latest run provenance** — `run_id:` / `executed_from_preview_run_id:` /
  `executed_at:` labels humanised (Run / From preview / Executed) with
  truncated ids, full values on hover.

### What changed — `/settings/profile`

- `friendlyError()` guard: parser/transport errors (JSON token errors,
  `missing_user`, network) map to calm copy instead of rendering raw
  JavaScript exception text in the banner.
- Palette onto tokens: red/emerald banners → danger/success, indigo
  focus/CTA → brand.

### Deliberately not copied from Kendo

Same boundary as §§35–36: principles only (calm hierarchy, workspace framing,
premium controls, less clutter). No light theme, no left context-module nav,
no setup-progress meter, no editable business-context fields, no Autofill, no
scorecard builder, no new routes. Verified again: no
`src/app/scorecard`, `src/app/context`, or `src/app/crm/scorecard` exist.

### Behaviour preserved

All `/crm/overview` fetches (kpis, reporting-summary, flags-summary, crm
actions, nudges, control-centre, assignments summary, trust, coach
assignments, top objections, Day 53 analytics loader) and their states are
untouched; `assignDrillFromSection` intact; all hrefs preserved
(`/crm/manager`, `/crm/manager/control-centre`, `/crm/manager/nudges`,
`/crm/contacts/*`, `/crm/contacts/import`, `/admin/assignments`,
`/assignments`, `/crm/accounts/*`, `/crm/reps/*`, `/crm/analytics`);
`analyticsDays`/`analyticsRep` filter semantics identical; rep-filter
query-param behaviour identical. ManagerClient handlers, confirm flows,
disabled states, Day 187 pinned literal, and RunHistoryTable
execute-from-preview flow untouched. Profile load/save logic unchanged.

### Known non-blockers (unchanged, documented)

- `listCoachAssignments` / `getTopObjections` (+ `DashboardKpisResp` type)
  still missing from `lib/api` — the two build-warning groups; restoring them
  is real helper work for the next lane.
- `/crm/Leaderboard` orphan; `rewards` warning pair.

### Remaining future opportunities

Unchanged from §36: Context Engine, Scorecard Studio, AI Scorecard Builder,
AI Autofill from website, custom scorecards by call type — all need
API/schema work; no placeholder UI shipped.

**Day 207 recommendation:** restore the missing `lib/api` helpers so Recent
assignments / Top objections actually populate (clears both build-warning
groups), then a demo reseed + timed rehearsal on the upgraded surfaces.

---

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
`scripts/validate-premium-ux-day-197.sh`. Day 198 — shared Button
primitive + call-detail dead helper cleanup (above). Companion validator:
`scripts/validate-premium-ux-day-198.sh`. Day 199 — call library /
sparring visual pass (above). Companion validator:
`scripts/validate-premium-ux-day-199.sh`. Day 200 — visual milestone:
full QA sweep + CRM workspace adoption (above). Companion validator:
`scripts/validate-premium-ux-day-200.sh`. Day 201 — dashboard Command
Centre pass (above). Companion validator:
`scripts/validate-premium-ux-day-201.sh`. Day 202 — assignments
workspace pass (above). Companion validator:
`scripts/validate-premium-ux-day-202.sh`. Day 203 — semantic colour tokens +
validator-pin refresh (above). Companion validator:
`scripts/validate-premium-ux-day-203.sh`. Day 204 — admin assignments manager
lane visual pass (above). Companion validator:
`scripts/validate-premium-ux-day-204.sh`. Day 205A — pre-demo hygiene
checkpoint (not a visual pass): removed proven-dead `lib/api` exports
(`setScore`, `listAdminReps`, `patchAdminRepTier`, `AdminRepRow`,
`getSparringSessionsByRep`) and dropped the stale `/reps` smoke-spec entry
(no `/reps` index route exists). Build warnings and `/crm/Leaderboard`
documented as known non-blockers in `DEMO_VISUAL_QA_NOTES.md`. Companion
validator: `scripts/validate-premium-ux-day-205a.sh`. Day 205B — analytics
intelligence workspace pass (above). Companion validator:
`scripts/validate-premium-ux-day-205b.sh`.*
