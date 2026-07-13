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

### Day 212 — implemented subset (API lane, read-only)

Shipped in the API repo (`npm run validate:team-management`, 15/15):

```
GET /v1/team/members   NEW — requireManager-gated, company-scoped
                       (users→reps identity bridge, same rule as /users).
                       Per member: office_id/office_name, scope
                       ("office" | "company"), identity ("rep" |
                       "user_only"), warnings (no_office_assigned only
                       when the company actually uses offices,
                       office_not_in_company, no_rep_identity).
                       Seat summary: company_licences canonical (summed
                       allocated), org_limits legacy fallback; response
                       warnings include over_seat_allocation and
                       members_missing_office.
```

Deliberate deviations from the sketch above:

- New `/members` endpoint instead of reshaping `GET /v1/team/users` — the
  Upload picker depends on the existing `/users` shape, and §4 promised no
  changes to existing endpoints.
- No mutating endpoints yet (invite / PATCH / deactivate deferred to the
  build lane) — Day 212 is the read-only scope foundation.

### Day 214 — `/team` read-only MVP shipped (WEB)

`src/app/team/page.tsx` (client page, `proxyFetch("/v1/team/members")`
only — no other endpoints, no mutations):

- Seat summary StatCards (members / allocated / available / scope setup)
  with the seat source humanised (company_licences → "Licensed seats",
  org_limits → "Legacy seat limit") and a calm, non-blocking
  `over_seat_allocation` warning.
- Members table: name (UUID-guarded label > email local part > "Team
  member"), role, office, coaching-scope status chip ("Office assigned" /
  "Company-wide scope" / "Needs team setup" — warning tone only when the
  API flags setup warnings).
- Loading skeleton, fail-soft error state with retry, calm forbidden
  state for non-managers. **No mutating controls at all** — no invite /
  edit / deactivate, no disabled "coming soon" buttons; the §5 drawer is
  deferred with the mutating lane to avoid fake UI.
- Nav (§2 wiring): sidebar "Team" now points to `/team`; the coaching
  workload page keeps its entry as **"Manager Centre"** (`/crm/manager`,
  unchanged route). `/team` added to `SHELL_PATHS`. `/admin/users` and
  `/admin/reps` untouched.
- Validator: `npm run validate-premium-ux-day-214`.

### Day 212 — `rep_missing_office` resolved at the API

Root cause: assignment creation (`POST /v1/assignments`) hard-required a
rep `office_id`, but reads have used "office scope when assigned, else
company scope" since Day 166/168 (`applyOrgScope`), and the demo company —
like any office-less company — has no office rows at all. Fix: office is
now optional scope at creation (null `office_id` stamps company scope,
matching seeded rows); company remains the hard boundary
(`rep_missing_company` kept). In exchange the previously missing
cross-company write guard was added: a manager assigning to a rep outside
their own company now gets 403 `rep_out_of_scope`.

## 5. Page structure (build reference)

```
src/app/team/page.tsx        server shell: role gate, PageContainer, initial load
src/app/team/TeamClient.tsx  list + filters + seat panel + drawer + modals
```

Drawer pattern: existing `CrmDrawer` conventions; URL-synced `member` /
`mode` params (Intelligence workspace grammar). Data via `proxyFetch` to
`/v1/team/*` only — ships against real endpoints, **no mock mode**.

## 6. Error-map integration points (build lane)

**Day 212 update:** `rep_missing_office` can no longer occur for
same-company reps — assignment creation falls back to company scope (see
§4). Remaining errors worth mapping on assignment-create surfaces:
`rep_missing_company` (broken identity row) and `rep_out_of_scope`
(cross-company target), both deep-linking `/team?member=<rep_id>` once
`/team` exists. Error mapping only — no assignment logic changes.

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
