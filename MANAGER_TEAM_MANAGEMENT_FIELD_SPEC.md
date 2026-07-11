# Manager Team Management — Field Spec & Permissions (Day 211)

Status: **Design documentation only.** Exact MVP fields and the permission
matrix. UX: `MANAGER_TEAM_MANAGEMENT_UX_BLUEPRINT.md`. Seats:
`LICENCE_AND_SEAT_RULES.md`.

## 1. Member fields

| Field | Key | Type | Manager can edit? | Notes / rules |
|---|---|---|---|---|
| Display name | `full_name` | text | ✅ | Shown everywhere (coaching queues, leaderboards, call ownership). Changing it never rewrites historical records — they reference the user id. |
| Email | `email` | email | ❌ read-only | Identity-critical. Change = support action ("Contact support to change an email address"). Shown in list search and drawer. |
| Role | `role` | select | ✅ within bounds | Manager-settable values: `Rep` · `Manager` only. Owner/PartnerAdmin/SuperAdmin are platform tiers and never appear as options. Role change applies from next sign-in (session note in UI). |
| Office / team | `office_id` | select (company's offices) | ✅ | **Required at invite.** The field that satisfies `getUserHierarchy` and prevents `rep_missing_office`. Offices are pre-provisioned (support); no office CRUD in MVP. |
| Assigned manager | `manager_id` | select (company's active managers) | ✅ (reps only) | Defaults to the inviter on invite. Drives coaching queue routing. |
| Status | `status` | computed | via actions only | `Active · Invited · Deactivated`. Never a free edit — changed only by invite/accept/deactivate/reactivate flows. |
| Invite status | `invited_at`, `invite_accepted_at`, `last_invite_sent_at` | timestamps | via Resend only | Renders as "Invite sent 2 Jul"; resend updates `last_invite_sent_at` (rate-limited server-side). |
| Last active | `last_active_at` | computed | ❌ | Best-effort from session/API activity; renders relative ("3 days ago"). Absent → "—", never fabricated. |
| Seat type | `seat_type` | fixed `standard` | ❌ | Single seat type in MVP; field reserved so future types don't need a model change. Not rendered in MVP UI. |
| Activity strip | — | computed | ❌ | Last active · calls scored (count) · open assignments (count). Read-only summary from existing data. |
| History | — | audit events | ❌ | Invited / role changed / office changed / deactivated / reactivated / invite resent — actor + timestamp. Company-scoped read. |

Storage note (unchanged from Day 207): the member record is `profiles`
(+ `office_id`/`company_id` stamping from Days 165–168). New columns this
module needs: `is_active` (Day 207) plus the invite timestamps above —
confirmed at build time against the real profiles shape; no other schema
appetite.

## 2. Permission matrix

| Capability | Rep | Manager | Company owner | Support / platform admin | Super admin |
|---|---|---|---|---|---|
| See own profile (`/settings/profile`) | ✅ | ✅ | ✅ | — | — |
| View `/team` list + drawers | ❌ | ✅ (company scope) | ✅ | via control plane | via control plane |
| Invite (seat-checked) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Edit name/role/office/manager | ❌ | ✅ within bounds | ✅ within bounds | ✅ | ✅ |
| Deactivate / reactivate | ❌ | ✅ (not self, not last manager) | ✅ | ✅ | ✅ |
| Resend invite | ❌ | ✅ | ✅ | ✅ | ✅ |
| Change email / move company | ❌ | ❌ | ❌ | ✅ | ✅ |
| Grant Owner/Partner/Super tiers | ❌ | ❌ | ❌ | ❌ | ✅ |
| Change purchased seats / billing | ❌ | ❌ | ❌ | ✅ (licence surfaces) | ✅ |
| Permanently delete a user | ❌ | ❌ | ❌ | ❌ | ❌ (does not exist) |
| Cross-company visibility | ❌ | ❌ | ❌ | ✅ (control plane) | ✅ |

- **Company owner** = existing `Owner` tier; behaves as manager-plus within
  the company on this surface (same bounds — Owner still cannot grant
  platform tiers or change seats). MVP treats owner ≡ manager here; the
  distinction matters only for support workflows.
- **Support/platform admin** operate through the existing control-plane
  surfaces (`/admin/users`, licence pages), never through `/team`.
- Rep visibility: reps never see the team surface; their own profile lives
  at `/settings/profile` as today.

## 3. Validation rules (server-enforced; UI mirrors)

1. Invite: email format + not already a member of any company (conflict →
   "already has a Gravix account — contact support to move them");
   role ∈ {Rep, Manager}; office required; manager required for reps;
   **seat check inside the same transaction as creation**.
2. Role bounds enforced server-side regardless of payload (a crafted
   request cannot set tiers).
3. Self-deactivation and last-active-manager deactivation rejected
   (`last_manager_guard`).
4. Reactivation seat-checked identically to invite.
5. Email, company_id, seat counts: not writable via any `/v1/team/*`
   endpoint.
6. Every mutation writes an audit event (actor, target, change, timestamp)
   — the drawer History reads these back.
7. All reads/writes company-scoped via existing org-scope middleware;
   office filters within company where hierarchy applies.
8. `ensure-profile` (existing) completes profiles for already-invited
   users only — it must never mint members past the seat cap
   (guard carried over from `MANAGER_TEAM_MANAGEMENT_SCOPE.md`).
