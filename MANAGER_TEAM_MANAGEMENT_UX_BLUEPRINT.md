# Manager Team Management — UX Blueprint (Day 211)

Status: **Design documentation only.** No routes, backend, auth, or licence
enforcement changes. Expands `MANAGER_TEAM_MANAGEMENT_SCOPE.md` (Day 207)
into a buildable UX. Companions: `MANAGER_TEAM_MANAGEMENT_FIELD_SPEC.md`
(fields + permissions matrix), `MANAGER_TEAM_MANAGEMENT_ROUTE_PLAN.md`
(route decision + legacy disposition), `LICENCE_AND_SEAT_RULES.md`
(seat model + enforcement).

---

## 1. Product intent

During demo QA the gap was obvious: Dana manages a team Gravix scores every
day, and has **no real place to manage the people**. The nearest surfaces
are a control-plane console (`/admin/users` — tiers, impersonation), a
legacy page with production-broken identity patterns (`/admin/reps`), and a
coaching workload view (`/crm/manager`).

Team Management gives managers ownership of team operations — view, invite,
edit, office assignment, deactivate/reactivate — inside their company scope
and seat allowance, while billing, seat purchasing, and platform roles stay
with the platform. **Managers own the team; the platform owns the
account.**

**Desired feel:** premium manager team workspace · calm, serious,
enterprise · licence-aware without being sales-y · safe confirmations ·
never an internal admin panel or support console · no arcade.

It also quietly fixes a real operational bug: assignment creation fails
with `rep_missing_office` when a rep has no office
(`api/src/routes/assignments.ts:943`). Today a manager cannot even see
that, let alone fix it. §6 closes that loop.

---

## 2. Page anatomy — `/team`

(Route rationale in `MANAGER_TEAM_MANAGEMENT_ROUTE_PLAN.md`. Existing
primitives throughout: PageContainer, PageHeader, SectionCard, StatCard,
Button, EmptyState, StatusBadge.)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ PageHeader  Team                                                         │
│             Manage the people Gravix coaches.        [Invite user]       │
├──────────────────────────────────────────────────────────────────────────┤
│  SEAT PANEL (StatCards)                                                  │
│  Seats used 8 of 10   ·   Active 7   ·   Invited 1   ·   Deactivated 2   │
│  Need more seats? Contact support.                (quiet link, no upsell)│
├──────────────────────────────────────────────────────────────────────────┤
│  [Search name or email…]   Office [All ▾]   Role [All ▾]  Status [All ▾] │
│                                                                          │
│  NAME              ROLE      OFFICE          STATUS      LAST ACTIVE     │
│  Nate Diaz         Rep       Manchester      ● Active    Today           │
│  Ronda R.          Rep       ⚠ No office     ● Active    3 days ago     │
│  Alex Pereira      Rep       Leeds           ○ Invited   Invite sent 2 Jul│
│  Dana (you)        Manager   Manchester      ● Active    Now             │
│  …                                                                       │
│  Deactivated (2)  — collapsed                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Seat panel** — always visible, always honest: `used = active +
  invited` against purchased seats (`LICENCE_AND_SEAT_RULES.md`).
  Deactivated shown separately (they don't consume seats). At the limit,
  the panel states it plainly and the support link carries the weight —
  **no self-serve upgrade, no purchase CTA**.
- **List** — one table, search + three filters, no tabs. Deactivated
  members collapsed at the bottom. Row click opens the **member drawer**.
- **`⚠ No office`** renders as a warning chip wherever office would show —
  the visible end of the `rep_missing_office` thread (§6).
- **Empty state** (fresh company): "Your team will appear here. Invite
  your first rep to start coaching." CTA: Invite user.
- Rows never expose ids, tiers, or company columns — this is a manager's
  team list, not the control-plane console.

## 3. Member drawer (`/team?member=<id>`)

Right-side drawer over the list (pattern: existing CrmDrawer), not a
separate page — team admin is quick-action work, and context (the list +
seat panel) should stay visible.

```
┌────────────────────────────────────────────┐
│ Ronda R.                        ● Active   │
│ ronda@ufcgym.example · Rep                 │
├────────────────────────────────────────────┤
│ ⚠ No office assigned                       │
│ Coaching assignments can't be created for  │
│ Ronda until she has an office.  [Assign…]  │
├────────────────────────────────────────────┤
│ PROFILE                                    │
│  Display name   [ Ronda R.          ]      │
│  Role           [ Rep ▾ ]  (Rep · Manager) │
│  Office         [ — ▾ ]                    │
│  Manager        [ Dana ▾ ]  (reps only)    │
├────────────────────────────────────────────┤
│ ACTIVITY                                   │
│  Last active 3 days ago · 12 calls scored  │
│  · 3 open assignments                      │
├────────────────────────────────────────────┤
│ HISTORY                                    │
│  2 Jul  Invited by Dana                    │
│  4 Jul  Office cleared (support)           │
├────────────────────────────────────────────┤
│ [Deactivate user]              [Save]      │
└────────────────────────────────────────────┘
```

- **Editable:** display name, role (Rep ↔ Manager only), office, assigned
  manager (reps). **Read-only:** email (identity — support-only change),
  status, activity, history. Field-level rules in the field spec.
- **Warning card** at the top when scope is missing; **Assign…** focuses
  the office select. Saving an office clears the warning everywhere.
- **Activity** is a summary strip (last active, calls scored, open
  assignments) — enough to judge "is this person live", with no analytics
  duplication.
- **History** — read-only audit strip: invites, role/office changes,
  deactivations, resends; actor + date. Sourced from audit events; managers
  see their company's entries only.

## 4. Flows

### Invite (`Invite user` → modal)
1. Fields: email · role (Rep default / Manager) · office (**required** —
   this is where `rep_missing_office` is prevented at the front door) ·
   manager (reps; defaults to the inviter).
2. Seat check shown in the modal footer before submit: "This uses 1 seat —
   9 of 10 after invite." At the limit the form is replaced by the
   limit state: "All 10 seats are in use. Deactivate a user to free a
   seat, or contact support to add seats." (The server re-checks
   regardless — UI numbers are informational.)
3. Submit → row appears as `○ Invited`, seat panel updates, audit entry.
   Toast: "Invite sent to alex@…".

### Resend invite
`Invited` rows: overflow action **Resend invite** (drawer + row). Quiet
confirmation, audit entry, "Invite sent 2 Jul" refreshes. Rate-limited
server-side; UI shows "sent just now" state rather than a disabled button
where possible.

### Edit profile / assign office
Inline in the drawer → **Save**. Office/role changes get a one-line
consequence note above Save (e.g. role change: "Manager access applies from
next sign-in."). Office change on a rep with open assignments keeps
history untouched — new scope applies to new work only (server rule,
stated in the note).

### Deactivate
1. Confirmation dialog carries the full consequence, verbatim:
   **"{Name} will no longer be able to sign in, appear in coaching
   queues, or receive assignments. Their calls, scores and history are
   kept. This frees 1 seat."**
2. Cannot deactivate yourself; cannot deactivate the last active manager
   (server-enforced, dialog explains when hit).
3. Row moves to the collapsed Deactivated group; audit entry.

### Reactivate
From a deactivated row/drawer — seat-checked exactly like an invite
("This uses 1 seat…"); at the limit, the same limit state applies.

## 5. What managers never see here

No billing, no plan names, no seat purchasing, no tier ladder
(SuperAdmin/PartnerAdmin/Owner never appear as options), no impersonation,
no delete. Permanent deletion does not exist on any surface — deactivation
is the strongest action, and history (calls, assignments, ownership) is
never rewritten. Support-only actions (email change, company move, owner
role) surface as "Contact support" copy, not disabled controls.

## 6. Assignment-scope connection (closing `rep_missing_office`)

The thread, end to end:

1. **Prevent** — invite requires an office; there is no path to create a
   scopeless member from `/team`.
2. **See** — `⚠ No office` chip on list rows + drawer warning card for
   pre-existing scopeless reps (seeded/support-created).
3. **Fix** — office select in the drawer; save stamps the profile
   (the same hierarchy `getUserHierarchy` reads).
4. **Explain** — assignment creation surfaces that fail with
   `rep_missing_office` map the error to human copy + a deep link:
   "Ronda doesn't have an office yet, so this assignment can't be
   created. Assign one in Team → `/team?member=<id>`." (Wired in the
   build lane on the surfaces that call assignment-create — no assignment
   logic changes; error mapping only.)

## 7. Copy deck (canonical strings, UK spelling)

| Where | Copy |
|---|---|
| Page sub | Manage the people Gravix coaches. |
| Seat panel | Seats used {a} of {b} · Active {n} · Invited {n} · Deactivated {n} |
| Seat limit (panel) | All {b} seats are in use. |
| Support line | Need more seats? Contact support. |
| Invite footer | This uses 1 seat — {a+1} of {b} after invite. |
| Limit state (modal) | All {b} seats are in use. Deactivate a user to free a seat, or contact support to add seats. |
| No-office chip | No office |
| Drawer warning | Coaching assignments can't be created for {name} until they have an office. |
| Deactivate dialog | {Name} will no longer be able to sign in, appear in coaching queues, or receive assignments. Their calls, scores and history are kept. This frees 1 seat. |
| Reactivate footer | This uses 1 seat — {a+1} of {b}. |
| Assignment error map | {Name} doesn't have an office yet, so this assignment can't be created. Assign one in Team. |

Tone: factual, no urgency theatre, no sales language at the seat limit.

## 8. MVP vs later (UX-level)

**MVP:** list + search/filters · seat panel · member drawer (profile,
activity strip, history) · invite/resend · office & role & manager edits ·
deactivate/reactivate · no-office warnings · assignment error mapping.

**Later:** bulk actions (multi-select office assignment, CSV invite) ·
office management CRUD (offices remain pre-provisioned) · per-member
coaching summary beyond the activity strip · seat-type differentiation ·
transfer-ownership flows · SSO/SCIM provisioning.
