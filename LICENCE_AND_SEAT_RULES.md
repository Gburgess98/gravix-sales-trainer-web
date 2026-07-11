# Licence & Seat Rules (Day 211)

Status: **Design documentation only.** No enforcement changes today. The
seat model behind Manager Team Management
(`MANAGER_TEAM_MANAGEMENT_UX_BLUEPRINT.md`) and the rules every related
endpoint must obey.

## 1. Definitions

| Term | Definition |
|---|---|
| Purchased seats | The company's paid seat count. Set by platform/support only. |
| Active user | `status = Active` member. **Consumes a seat.** |
| Pending invite | `status = Invited` (created, not yet accepted). **Consumes a seat** — a seat is committed the moment it's promised, so invites can't oversell the pool. |
| Deactivated user | `status = Deactivated`. **Does not consume a seat.** History fully retained. |
| Seats used | Active + Invited. |
| Seat limit reached | Seats used = purchased seats. |

One seat type (`standard`) in MVP; the field is reserved for future
differentiation (`MANAGER_TEAM_MANAGEMENT_FIELD_SPEC.md` §1).

## 2. Source of truth (the two-system problem, named)

Audited today — Gravix currently has **two** seat systems:

1. **Legacy:** `org_limits.max_users` checked against `users.org_id`
   counts, used by the legacy `POST /v1/admin/users` / `GET
   /v1/admin/usage` (which also resolve the caller's org via their calls
   rows — fragile and header-identity-dependent).
2. **Current platform:** `licence_pools` + `company_licences`
   (partner/super-admin licence surfaces), alongside `profiles.company_id`
   membership.

**Rule for the build:** `company_licences` is the canonical purchased-seat
source; member counts come from `profiles` (the record `/v1/team/users`
already reads). During migration, a company with no `company_licences` row
falls back to `org_limits.max_users`, then to a conservative default (5 —
the legacy default). The reconciliation (which companies have which rows)
is an explicit build-lane task with a live check before `/team` ships —
**seat maths must come from one resolver function used by every
endpoint**, never re-derived per route.

## 3. Enforcement rules (server-side, non-negotiable)

1. **Invite and reactivate are seat-checked in the same transaction as the
   write.** UI numbers are informational; the server is the gate. Two
   racing invites for the last seat: one wins, one gets `seat_limit_reached`.
2. **No manager-reachable path changes purchased seats.** Not `/team`, not
   `/v1/team/*`, not indirectly. Seat changes happen on platform licence
   surfaces only.
3. **`ensure-profile` cannot mint members** — it completes
   already-invited/authed profiles only (existing guard, restated because
   it is the obvious bypass).
4. **Deactivation frees a seat immediately; reactivation re-checks.**
5. **Cancelling a pending invite** (drawer action on Invited members)
   frees its seat; audit-logged like everything else.
6. **Every seat-affecting mutation is audit-logged** (actor, target,
   action, seat count after).
7. All checks company-scoped; no endpoint may count or write across
   companies.

## 4. Seat-limit UX states

| State | Surface behaviour |
|---|---|
| Seats available | Seat panel shows plain numbers. Invite modal footer: "This uses 1 seat — {a+1} of {b} after invite." |
| Last seat | Same as above (no urgency theatre; the numbers speak). |
| Limit reached | Panel: "All {b} seats are in use." Invite/reactivate flows show the limit state: "All {b} seats are in use. Deactivate a user to free a seat, or contact support to add seats." Primary action becomes **Contact support** (mailto/support link) — never a purchase or upgrade button. |
| Race lost (server rejects) | Toast maps `seat_limit_reached` honestly: "That was the last seat — someone else used it just now." Panel refreshes. |

**Product stance:** the seat limit is a fact, not a sales moment. No
upgrade CTAs, no plan-comparison modals, no countdown banners. Managers
who need seats talk to the platform (support), matching the "platform owns
the account" principle.

## 5. What this is not (deferred)

- Self-serve seat purchase / plan management (platform decision, not MVP).
- Per-office seat allocations; seat types (viewer/coach/full).
- Automatic seat reclamation policies (e.g. auto-deactivate after N days
  inactive) — never without explicit product design; silent deactivation
  is a trust hazard.
- Partner-level pooled-seat drawdown UX (exists at control-plane level;
  untouched by this design).
