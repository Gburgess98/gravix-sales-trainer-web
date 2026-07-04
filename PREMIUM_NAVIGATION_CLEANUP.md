# PREMIUM NAVIGATION CLEANUP — Day 178

Companion to `PREMIUM_UX_AUDIT.md` (Day 177 audit; Day 178 status in §10).
Scope: broken links, duplicate nav destinations, and the calm nav model going forward.

## 1. Old broken / misleading links → new destinations

| Old link | Where it lived | Problem | New destination |
|---|---|---|---|
| `/sparring` | dashboard onboarding card, dashboard quick link, assignments empty state, sparring post-action "Choose different drill" | No index route → 404 | New tiny redirect route `/sparring` → `/call-library?tab=sparring`; dashboard links updated to point at the tab directly |
| `/sparring/new?…` | `/calls/[id]` "Practice this now", `/sparring/[id]` post-action "Practice this now" | Unsupported — `[id]` would try to load a session literally named `new` | `/sparring/default?…` (the supported launch shortcut: creates a session, then redirects into it) |
| Sidebar "Sparring" → `/call-library` | `src/config/navigation.ts` | Identical unqualified destination to "Calls"; landed on the *Live Calls* tab | `/call-library?tab=sparring` — lands on the AI Sparring tab |

Supporting change: `/call-library` now reads `?tab=live|sparring|upload` on mount, so
tabs are deep-linkable (previously tab state was purely in-memory).

Already fine (checked, not changed): `/recent-calls` is a redirect to `/call-library`
(login/auth-callback land there, then bounce — works, one extra hop);
"Review Calls" / Review Queue links use `/coaching?tab=review`, which is supported;
`/rewards` and `/whisperer` pages exist and their few inbound links resolve;
no inbound links to `/crm/Leaderboard` were found in the app.

## 2. Current calm nav model (after Day 178)

- **Command Centre** → `/coaching` (unchanged)
- **Upload Call** → `/upload` (unchanged)
- **Calls** → `/call-library` (Live Calls tab)
- **Sparring** → `/call-library?tab=sparring` (AI Sparring tab)
- **Assignments** → `/assignments` (unchanged)
- **Accounts / Contacts / Team / Analytics / Settings / My Profile** — unchanged

## 3. Remaining nav decisions (deliberately not solved today)

1. **Sparring active state** — the sidebar active check matches `pathname` only, so a
   query-string href never highlights. Options: query-aware matching in `nav-item.tsx`,
   or a real `/sparring` surface later. Cosmetic; deferred.
2. **Orphan routes** — `/rewards`, `/whisperer`, `/recent-calls` (legacy), `/review/*`,
   `/reps/[id]`, and the `/crm/*` sub-app (overview, pipeline, tasks, actions,
   `Leaderboard` with its capitalised segment, manager/*) are still absent from the
   sidebar. Each needs a promote / consolidate / retire decision — its own day.
3. **Settings split** — "Settings" (→ `/admin/settings`, managers) vs "My Profile"
   (→ `/settings/profile`, everyone); no `/settings` index. Defer until the settings
   surface grows.
4. **Naming** — Command Centre vs Coaching, Review Queue vs Replay Queue, Calls vs
   Call Library vs Live Calls vs Call Uploads. Rename pass deferred; do it together
   with the coaching-overview diet so labels only change once.
5. **Assignments "← Back"** → `/crm/overview` (an orphan) — leave until the CRM
   sub-app decision lands.

*Day 178 — WEB-only, patch mode. Validator: `scripts/validate-premium-ux-day-178.sh`.*
