# Scorecard Studio — Route & Navigation Plan (Day 209)

Status: **Planning only. Nothing is wired today** — no route files, no
`navigation.ts` or `SHELL_PATHS` changes, no runtime changes.

## 1. Decision: everything under `/intelligence?tab=scorecards`

```
/intelligence?tab=scorecards                    Studio home (list + coverage strip)
/intelligence?tab=scorecards&scorecard=<id>     editor (full workspace takeover)
/intelligence?tab=scorecards&scorecard=<id>&version=<n>   read-only version view
/intelligence?tab=scorecards&mode=create        new-scorecard flow (Overview first)
```

**This supersedes the Day 207 sketch** (`/intelligence/scorecards/[id]`
subroute). One workspace page with query-param deep links wins because:
- it matches the Context Engine's `?tab=…&module=…` grammar exactly
  (Day 178 tab pattern) — one navigation model for the whole Intelligence
  workspace;
- the editor is a takeover of the same shell page, so tab context (where
  you are, how to get back) is never lost;
- no second server route to gate, no layout duplication.
The `[id]` subroute remains the escape hatch if the editor ever needs its
own server-side data loading; nothing in the MVP design requires it.

Deep links used by other surfaces:
- Call review "Scored with…" caption → `…&scorecard=<id>&version=<n>`
  (read-only version view).
- Coverage strip chips → the owning scorecard's editor.

## 2. Navigation

No new nav item — Scorecard Studio is the second tab of the existing
planned Intelligence entry (`CONTEXT_ENGINE_ROUTE_PLAN.md` §2: Admin group,
manager-gated, `/intelligence` in `SHELL_PATHS`). The one-tab
`WorkspaceTabs` note from Day 208 flips here: **when the Studio ships, the
Scorecards tab starts rendering; before that it does not exist.** No
placeholder tab at any point.

Role gating identical to the Context tab: manager+ for the Studio; reps
reaching a version deep link (from the call-review caption) get the
read-only version view only — no list, no editor affordances.

## 3. Page structure (build reference)

```
src/app/intelligence/page.tsx          (from Context Engine build) gains tab switch
src/app/intelligence/ScorecardsClient.tsx   list + coverage strip + editor takeover
                                            + version view + activation dialogs
```

- Client state (`scorecard`, `version`, `mode`) synced to the URL like the
  Context tab's `module` param.
- Data via existing `proxyFetch` patterns to `/v1/intelligence/scorecards*`
  (endpoint sketch in `INTELLIGENCE_LAYER_BLUEPRINT.md` §7; the Gravix
  default renders from a virtual read-only payload served by the list
  endpoint, not a database row).
- The page ships only against real endpoints — **no mock mode**, same rule
  as the Context Engine plan.

## 4. Prototype route policy

Identical to Day 208: a static preview, if wanted, lives at
`/dev/scorecard-studio-preview` (convention of `/dev/audio-test`),
hard-coded props, labelled "Design preview — not functional", never linked
from nav, deleted when the real page lands. **None built on Day 209.**

## 5. Wiring-day checklist (Studio build day)

1. Scorecards tab added to the Intelligence `WorkspaceTabs`.
2. `ScorecardsClient` per §3, URL-synced state, activation/archive dialogs
   with the canonical copy (`SCORECARD_STUDIO_UX_BLUEPRINT.md` §9).
3. List/coverage/editor read from the real scorecards endpoints only.
4. Call-review caption on `/calls/[id]` reads `rubric._meta.scorecard_*`
   with the "Gravix default scorecard" fallback for unstamped calls —
   ships with the **runtime** day, not the Studio UI day, so the caption
   never claims a scorecard that wasn't actually used.
5. Demo seed + `LIGHTHOUSE_DEMO_SCRIPT.md` update once seeded (Day 216).
