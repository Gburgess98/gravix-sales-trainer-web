# Manager Team / User Management — Scope (Day 207)

Status: **Planning only.** Part of the Intelligence Layer
(`INTELLIGENCE_LAYER_BLUEPRINT.md`). Deliberately the thinnest module —
this is an enabler, not a product pillar.

## Purpose

Let a manager run their own team day-to-day — see reps, invite new ones
within their seat allowance, assign office/team, deactivate leavers —
without touching billing, licence pools, or anything super-admin.

## What already exists

- `GET /v1/team/users` — tenant-scoped profile list (Day 168 fixed the
  unscoped leak). `POST /v1/team/ensure-profile` backfills a profile row.
- Profiles carry `company_id` / `office_id` (stamping hardened Days 165–168).
- `licence_pools` + `company_licences` tables (partner/super-admin surfaces
  `/v1/admin/partner/licences`, `/v1/admin/super/licences`) — seat limits
  exist as data; **nothing enforces them at manager level today**.
- WEB: `/admin/users` (list), `/admin/users/[id]` (detail), `/admin/reps`.
- No invite, edit, deactivate, or seat display anywhere at manager level.

## MVP capabilities

| Capability | Detail |
|---|---|
| View team | Existing `/admin/users`, gains seat-usage header ("7 of 10 seats") |
| Invite user | Email + role (rep/manager) + office. Server checks active-profile count against `company_licences` **before** creating. Over limit → clear error naming the limit; no waitlist, no auto-upgrade prompt in MVP |
| Edit member | Office/team assignment, display name, role (rep ↔ manager only) |
| Deactivate | `profiles.is_active = false` — blocks login/scoring/assignment targeting; **keeps all history** (calls, scores, rep_memory, assignments). Frees a seat |
| Reactivate | Seat-checked, same rule as invite |

`profiles.is_active` is the only schema addition this module needs.

## Explicit non-goals (never at manager level)

- Changing seat limits, licence pools, or anything billing-shaped.
- Granting company-admin/partner/super-admin roles.
- Hard-deleting users or their history (deactivate only).
- Cross-company visibility of any kind.
- SSO/SCIM provisioning (much later, enterprise tier).

## Flows

### Invite
1. `/admin/users` → **Invite user** → email, role, office.
2. API: verify caller is manager+ in company → count active profiles vs
   seats → create auth invite + profile row (stamped company/office) →
   audit activity.
3. UI: pending state until first login (`ensure-profile` completes the row).

### Deactivate / reactivate
1. Member detail → Deactivate → confirmation states what is kept (all
   history) and what stops (login, scoring, new assignments).
2. Reactivation is seat-checked exactly like an invite.

## Permission + safety rules

- All endpoints manager+ and company-scoped via existing middleware.
- **Seat enforcement is server-side**; the UI number is informational.
- `ensure-profile` must not become a backdoor around seat limits — it may
  only complete profiles for already-invited/authed users, never mint new
  members past the cap.
- Managers cannot edit or deactivate themselves out of the last-manager
  position (guard: a company must keep ≥1 active manager).
- Every invite/edit/deactivate writes an audit activity.

## API sketch

```
GET   /v1/team/users            (exists; add is_active + seat summary)
POST  /v1/team/invite           seat-checked create
PATCH /v1/team/users/:id        office / role / is_active
```

## Deferred

- Bulk invite (CSV), office management CRUD (offices are pre-provisioned),
  role templates, per-rep scorecard/coaching defaults, SSO/SCIM.
