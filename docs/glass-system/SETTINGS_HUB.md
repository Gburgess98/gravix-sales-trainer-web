# Settings hub (`/admin/settings`) — audit and decisions

Manager/admin only. `ManagerGate` (API-decided via the manager-only `GET /v1/admin/config`) renders nothing until the role is
confirmed and sends non-managers to `/assignments`; the nav entry already had `roles: ['manager']`. Sections are real URLs
(`?section=general|people|ai|privacy|coaching|gamification|system`); desktop has a left section nav, below `lg` a labelled native
`<select>`. Drafts live in the page, so switching sections keeps edits; leaving the page asks first (`beforeunload` + in-app links).

## What exists, and what genuinely works
| Capability | Endpoint / route | Editable in the hub? |
|---|---|---|
| Company call visibility (`everyone`/`managers`/`disabled`) | `GET/PATCH /v1/admin/org-settings` (manager PATCH, org resolved server-side) | **Yes** — Calls & privacy, confirm dialog, server-echoed value, non-optimistic |
| Streak threshold, points multiplier, comeback bonus | `GET/PATCH /v1/admin/config` | **Yes** — Sparring & gamification (see the platform-wide finding) |
| Low / critical review-score thresholds | same `PATCH /v1/admin/config` (`scoring.low/critical`; Day 297, prod DB lacks the columns) | **Yes**, only where the API returns both values; otherwise a plain "not available in this environment" |
| Team members, role mix, seats | `GET /v1/team/members` (manager, tenant-scoped) | Read-only summary + link to `/team` |
| Workspace/company name, own role, time zone | `GET /v1/users/me` | Read-only; own profile edit stays at `/settings/profile` |
| Intelligence (Context, Scorecards, Objections) | `/intelligence?tab=…` | Link cards; `/intelligence` gets a "← Settings" link |
| Buyer persona tuning | `GET/PATCH /v1/admin/persona-config`, page `/admin/personas` | Link (the existing 550-line editor already owns it) |
| Auto-assign + per-org team settings | `/crm/manager` (`/v1/crm/manager/settings`) | Link (Manager Centre) |
| Environment / build / status | `GET /v1/version`, `GET /v1/health` | Read-only; only the whitelisted non-secret fields are shown |

## Deliberately omitted (no real backend contract)
- **Integrations** — Slack webhooks are env-only and SuperAdmin-only (`/v1/admin/test-slack`, `/send-slack`); CRM import is a task at `/crm/import`, not configuration.
- **Notifications** — no preference endpoint or table exists.
- **Data & security** — no retention, export-governance or manager-visible audit endpoint (`/v1/admin/super/audit` is SuperAdmin only).
- **Role changes / invitations** — the only endpoints (`POST /v1/admin/users`, `PATCH /v1/admin/reps/:id`, `GET /v1/admin/reps`) are not tenant-scoped (below); People & access therefore stays read-only and points at Team.
- No "coming soon" cards.

## Findings (not fixed — API/product)
1. **`admin_config` is a platform-wide singleton** (`id = true`, one row for all tenants). `PATCH /v1/admin/config` is gated only by `requireManager`, so a manager at any company changes streak/points/threshold values for **every** company. The old page did the same while saying "applies immediately". The hub now labels these sections **Platform-wide** and says so in the confirmation. A per-organisation store (`team_settings`, edited in Manager Centre) exists; which store scoring actually reads, and whether these controls should be SuperAdmin-only, is a product decision.
2. **Unscoped admin endpoints:** `GET /v1/admin/reps` lists up to 500 reps across all tenants; `PATCH /v1/admin/reps/:id` changes any rep's tier (only a "last manager" guard when demoting yourself). `GET/POST /v1/admin/users` and `/usage` resolve the org from the caller's first call row. None are used by the hub.
3. `GET /v1/admin/org-settings` is readable by any authenticated user (intentional, rep Company-calls gating); the hub never calls it for reps because reps never render Settings.
4. Prod lacks `admin_config` threshold columns until the Day 297 migration; the hub handles that by hiding the control rather than writing.

## Verification
**Mocked only** (fake manager/rep sessions, stateful mock of the endpoints; no hosted or real data): `tests/e2e/settings-hub.spec.ts`, 32 checks at 1440px and 375px — every section reachable and clean (no UUIDs, secrets or raw API text), deep links/unknown section/refresh/back/forward, visibility change → confirm → exact PATCH → success and failure, gamification validation + confirm + payload + failure + discard, thresholds validation + payload + unavailable state, people/AI/system/general, loading/error/denied, unsaved-changes guards, keyboard (focus ring, radio arrows, dialog focus + Escape returns focus), rep redirected with no settings UI or manager request, manager still reaches it.
