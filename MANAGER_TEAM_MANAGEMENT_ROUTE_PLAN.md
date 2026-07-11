# Manager Team Management — Route & Navigation Plan (Day 211)

Status: **Planning only. Nothing is wired today** — no routes, nav changes,
redirects, or endpoint changes.

## 1. Decision: new top-level route `/team`

```
/team                     team list + seat panel
/team?member=<id>         member drawer open
/team?mode=invite         invite modal open (deep-linkable from error maps)
```

### Why `/team` (and not the alternatives)

- **Not `/admin/users`** — audited today: it is the **control-plane
  console** (SuperAdmin/PartnerAdmin tier badges, impersonation controls,
  cross-company columns), gated to partner admins in the Control Plane nav
  group. Putting manager team ops there would either leak platform
  controls to managers or force a confusing dual-mode page. **This
  supersedes the Day 207 scope note** ("extend /admin/users") — that note
  predated this audit.
- **Not `/crm/manager/users`** — `/crm/manager` is the coaching workload
  workspace (rep assignment counts, nudges). People administration is not
  CRM, and burying invite/deactivate under CRM would make the platform's
  most safety-sensitive manager surface hard to find.
- **Not `/admin/team`** — `/admin/*` is drifting toward control-plane and
  legacy pages; new manager pillars live at the top level (`/coaching`,
  `/intelligence`). `/team` is short, obvious, and matches the CLAUDE.md
  navigation direction (Team under the Admin nav group).

## 2. Navigation (wiring day)

- Admin nav group (manager-gated) gains
  `{ label: 'Team', href: '/team', icon: Users2, roles: ['manager'] }`.
- **Label collision, resolved:** the Workspace group currently has
  "Team" → `/crm/manager`. On wiring day that item is relabelled
  **"Team Workspace"** (coaching workload) so "Team" unambiguously means
  people management. One-line `navigation.ts` change, documented here so
  it isn't debated later.
- `SHELL_PATHS` gains `'/team'`.
- Page gating: manager+ server-side, same pattern as other Admin-group
  surfaces; reps deep-linking get a calm "This page is for managers"
  state, not an error dump.

## 3. Legacy disposition (build lane, Day 184/193 stub pattern)

| Surface | Disposition |
|---|---|
| `/admin/reps` | **Superseded by `/team`.** Server redirect stub → `/team` once `/team` ships; its HomeLanding link repointed. It is the only manager-facing invite surface today and is built on browser identity headers (`x-user-id` from localStorage) that Day 175 production hardening strips — it must not remain the invite path. |
| `/admin/users` | Untouched — remains the control plane (partner/super admins). |
| `/crm/manager` | Untouched functionally — relabelled in nav only (§2). |
| Legacy API: `POST /v1/admin/users`, `GET /v1/admin/usage` | Superseded by `/v1/team/*` (§4). Both resolve the caller's org by looking up their **calls** rows (`calls.org_id` via `x-user-id`) — a manager with no uploaded calls gets `no_org`; identity comes from a browser header. Retired (410 or removed) once `/team` is proven live, in the API lane. |

## 4. API sketch (extends existing `/v1/team` router — new endpoints, no changes to existing ones today)

```
GET    /v1/team/users            exists (Day 168, tenant-scoped) — gains
                                 status/office/invite/last-active fields + seat summary
POST   /v1/team/invite           seat-checked create + invite email (transactional check)
POST   /v1/team/users/:id/resend-invite
PATCH  /v1/team/users/:id        full_name / role (bounded) / office_id / manager_id
POST   /v1/team/users/:id/deactivate
POST   /v1/team/users/:id/reactivate    (seat-checked)
GET    /v1/team/audit?user_id=   company-scoped audit read for the History strip
```

Identity from the authed session/profile (Day 175 trust boundary), never
from calls-table lookups. Seat source of truth:
`LICENCE_AND_SEAT_RULES.md` §2 (company_licences canonical, org_limits
legacy fallback during migration).

## 5. Page structure (build reference)

```
src/app/team/page.tsx        server shell: role gate, PageContainer, initial load
src/app/team/TeamClient.tsx  list + filters + seat panel + drawer + modals
```

Drawer pattern: existing `CrmDrawer` conventions; URL-synced `member` /
`mode` params (Intelligence workspace grammar). Data via `proxyFetch` to
`/v1/team/*` only — ships against real endpoints, **no mock mode**.

## 6. Error-map integration points (build lane)

Surfaces that create assignments and can receive `rep_missing_office`
(e.g. call review Assign Coaching, admin assignment create) add a mapped
message + deep link `/team?member=<rep_id>`. Error mapping only — no
assignment logic changes.

## 7. Prototype policy

Unchanged house rule: static preview only at `/dev/team-preview`,
hard-coded props, labelled non-functional, never linked, deleted when the
real page lands. **None built on Day 211.**

## 8. Wiring-day checklist

1. `/v1/team/*` endpoints live and proven org-scoped (API lane first).
2. `/team` page + drawer + modals against real endpoints.
3. Nav: add Team (Admin group), relabel `/crm/manager` item, SHELL_PATHS.
4. `/admin/reps` → redirect stub; HomeLanding link repointed.
5. Error maps on assignment-create surfaces.
6. Legacy `POST /v1/admin/users` + `GET /v1/admin/usage` retired after
   live proof.
7. Demo seed: Dana's team visible with one `Invited` and one no-office rep
   to demo the warning → fix flow; `LIGHTHOUSE_DEMO_SCRIPT.md` updated.
