# Shared role guard

One mechanism, applied per **segment `layout.tsx`**: `src/components/auth/role-gate.tsx` (`RoleGate level="manager|partner|super"`).
A page added inside a guarded folder is protected by default. It replaces the page-level `ManagerGate` that `/coaching`, `/crm/manager` and
`/admin/settings` used (those pages no longer gate themselves).

## Behaviour
Each level probes an endpoint that already answers 200/403 by role — no new API:

| Level | Probe | API middleware |
|---|---|---|
| `manager` | `GET /v1/admin/config` | `requireManager` |
| `partner` | `GET /v1/admin/partner/health` | `requirePartnerAdmin` |
| `super` | `GET /v1/admin/super/health` | `requireSuperAdmin` |

- 200 → render the page. 401/403 → `router.replace('/assignments')` (not in history; Back/Forward cannot loop). Anything else (5xx, network) → a calm
  "Couldn't check your access" retry: never a redirect, never the page, never the raw error.
- Until the probe answers only a neutral "Loading…" renders, so no restricted chrome flashes and no restricted request is made first.
- Client-side by design: the role lives in the API, not in the session token. The API still enforces every request; this is UI hygiene.

## Coverage (guarded segments)
`admin/` (manager; covers `settings`, `personas`, `reps`, `assignments*`) · `admin/users`, `admin/companies` (partner) · `admin/partners`, `admin/score`,
`admin/status` (super) · `coaching/` · `team/` · `intelligence/` · `crm/analytics/` · `crm/manager/` (covers `contacts`, `nudges`, auto-assign stubs) ·
`crm/reps/` · `crm/overview/` · `crm/import/` · `crm/contacts/import/`.

Deliberately **not** guarded (shared / rep-visible): `/dashboard`, `/assignments`, `/progress`, `/call-library`, `/calls/[id]`, `/upload`, `/crm/accounts*`,
`/crm/contacts/[id]`, `/crm/pipeline`, `/crm/tasks`, `/settings/profile`, `/sparring*`, `/whisperer`, auth and diagnostics.

## Enforcement
- `tests/unit/route-guards.test.mts` reads the file tree: every `roles: ['manager'|'partneradmin'|'superadmin']` nav entry must sit under a guard of at least its level;
  a fixed list of known manager/partner/super routes must be guarded; the shared routes must **not** be; no page may re-implement a gate. Non-vacuous
  (a temp tree proves the resolver rejects unguarded folders and weaker levels; removing `team/layout.tsx` fails the test).
- `tests/e2e/route-guards.spec.ts` (mocked roles): 23 restricted routes redirect a rep to `/assignments` with nothing restricted rendered or requested; shared routes stay open;
  manager reaches manager routes but not partner/super; partner admin reaches users/companies but not partners; super admin reaches all; a failed probe is a retry; no redirect loop.

## Caveats / follow-ups
- `/admin/reps` is now guarded (manager) but still sits on **unscoped** admin endpoints; it should stay hidden until those are tenant-scoped.
- `/crm/contacts/[id]` "Back to CRM" and some CRM links point at `/crm/overview`; a rep following them now lands on `/assignments`. `/crm/overview` is slated to be merged or removed.
- `/crm/pipeline` and `/crm/tasks` stay open pending the CRM release decision (the Team toggle and unscoped owner list there are separate issues).
- A manager who loses the partner/super probe is sent to `/assignments` (valid for every role), not to a role-specific home.
- Verification is mocked (probe responses are mocked per role); nothing here was checked against real accounts or hosted staging.
