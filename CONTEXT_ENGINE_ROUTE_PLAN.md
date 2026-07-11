# Context Engine — Route & Navigation Plan (Day 208)

Status: **Planning only. Nothing is wired today** — no route files, no
`navigation.ts` change, no `SHELL_PATHS` change. This documents exactly
where the Context Engine will live and what the wiring day changes.

## 1. Decision: `/intelligence?tab=context`

The Intelligence workspace route from `INTELLIGENCE_LAYER_BLUEPRINT.md` §7
stands:

```
/intelligence                    workspace home — WorkspaceTabs
  ?tab=context                   Context Engine (default tab in MVP)
  ?tab=context&module=objections deep link to a rail module
  ?tab=scorecards                Scorecard Studio (Day 212)
/intelligence/scorecards/[id]    scorecard editor (Day 212)
```

**Rejected: `/settings/company-context`.** Settings is account/config
housekeeping (`/settings/profile`, `/admin/settings`); the Context Engine
is a product pillar managers return to, and it shares a workspace with
Scorecard Studio — burying it under Settings undersells the moat and splits
the Intelligence Layer across two homes.

**Naming collision, resolved:** `/crm/analytics` already carries
"Intelligence Cockpit" branding (Days 205B–C). Distinction:
- `/crm/analytics` — **observe**: what is happening across the team.
- `/intelligence` — **teach**: what Gravix knows about how you sell.
Sidebar labels keep them apart: "Analytics" vs "Intelligence". If confusion
shows up in testing, the cockpit page sub-copy can cross-link ("Teach
Gravix → Intelligence"), not the other way round.

## 2. Nav placement (wiring day, not today)

`src/config/navigation.ts` — Admin section (manager-gated), between
Analytics and Settings:

```ts
{ label: 'Intelligence', href: '/intelligence', icon: Sparkles, roles: ['manager'] },
```

- Icon: `Sparkles` (lucide) — `Brain` is taken by Command Centre
  (`/coaching`), `BarChart2` by Analytics. Final pick on wiring day.
- `SHELL_PATHS` gains `'/intelligence'` (required for sidebar/topbar shell).
- Role gating: `roles: ['manager']` on both item and page — same pattern as
  existing Admin-group surfaces; reps who deep-link get the read-only
  summary view (`CONTEXT_ENGINE_UX_BLUEPRINT.md` §6), enforced page-side.

## 3. Page structure (build reference)

```
src/app/intelligence/page.tsx        server shell: auth/role gate, PageContainer
src/app/intelligence/ContextClient.tsx   client: rail + editor + guidance +
                                         publish strip + preview drawer
```

- `?tab=` handled like existing tabbed workspaces (Day 178 pattern,
  `/coaching?tab=`); `?module=` is client state synced to the URL.
- Data via existing `proxyFetch` patterns to `/v1/intelligence/context`
  (endpoints per `CONTEXT_ENGINE_SPEC.md`; API is Day 208+ lane work in the
  API repo — nothing in WEB assumes it exists before then).
- Tab bar renders only the Context tab until Scorecard Studio ships — a
  one-tab `WorkspaceTabs` is fine and avoids a dead "Scorecards" tab.
  **No placeholder tabs, no disabled nav items.**

## 4. Prototype route policy

If a static preview is wanted before the API exists:
- Location: `/dev/context-engine-preview` (matches the existing
  `/dev/audio-test` convention).
- Hard-coded props, clearly labelled "Design preview — not functional",
  never added to `navigation.ts` or `SHELL_PATHS`, deleted when the real
  page lands.
- Anything else — placeholder `/intelligence` routes, disabled nav entries,
  fake data wired to real-looking controls — is explicitly out.

## 5. Wiring-day checklist (Day 209 or later)

1. Add `/intelligence` to `SHELL_PATHS`.
2. Add nav item to Admin section (manager roles).
3. Create page + client per §3, gated server-side.
4. Read/write against the real `/v1/intelligence/context` endpoints only —
   if the API lane hasn't landed, the page doesn't ship (no mock mode).
5. Update `LIGHTHOUSE_DEMO_SCRIPT.md` flow once seeded (Day 216).
