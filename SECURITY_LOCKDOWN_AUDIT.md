# SECURITY LOCKDOWN AUDIT — Day 174 (updated Day 175)

**Date:** 4 July 2026 (Day 175 update: 4 July 2026)
**Scope:** gravix-sales-trainer-api (d0de9fa) + gravix-sales-trainer-web (c082acf)
**Verdict:** The platform's single biggest exposure is that **user identity is client-asserted end-to-end**. Everything else (tenant scoping, manager gates, storage access) is built on top of that unverified identity. Several critical unauthenticated endpoints and fail-open scoping paths were patched today; the identity architecture itself is the Day 175 priority.

---

## Executive summary

- **Identity is spoofable.** The API resolves the user from a client-supplied `x-user-id` header, preferred *over* the JWT — and the JWT `sub` is only base64-decoded, never signature-verified. The web client stores its user id in `localStorage` and sends it as a header; the proxy forwards it. Anyone who can reach the public API (curl — CORS does not apply) can act as any user, including managers, by guessing or obtaining a UUID. Because impersonation and tier checks look up `reps.tier` by that same spoofed id, a known SuperAdmin UUID grants full impersonation.
- **Tenant isolation is inconsistent.** Manager routers (`/v1/manager`, `/v1/assignments` manager routes, `/v1/admin`) are gated and scoped, but a long tail of legacy endpoints defined directly in `server.ts` and `dashboard.ts` had **no auth at all** and no tenant filter. The dashboard hierarchy filter was silently disabled by a dead `req.authUserId` read. Both patched today.
- **Fail-open dev bypasses existed in production paths**: `DEV_TEST_UID` env fallback, CRM org-scope bypass on missing/zero `x-org-id`, and an env-flag-only admin guard. The first two are now production-gated; the admin flag is documented below.
- **Upload/storage is in reasonable shape**: private bucket paths are prefixed by uploader id and enforced at finalize, signed URLs are short-lived (300 s), MIME/size limits and rate limits exist.

> ⚠️ Today's production fail-closed patches depend on `NODE_ENV=production` being set on the API host. Verify this on the deployment before relying on them.

---

## Critical risks

| Risk | Severity | Area | Evidence | Suggested fix | Status |
|---|---|---|---|---|---|
| Identity spoofable: `x-user-id` header trusted above JWT; JWT decoded but never signature-verified | Critical | API auth | `src/server.ts` auth-context middleware (`Priority: explicit header > jwt > env`); `tryDecodeJwtSub` does no verification; same pattern in `requireUserId`, `requireManager` fallback | Verify Supabase JWT signature (or `auth.getUser`) server-side; accept `x-user-id` only from the trusted proxy via shared secret | **Partially patched Day 175** — header path now gated by `PROXY_SHARED_SECRET` (untrusted identity headers stripped centrally); API-side JWT verification still open (Day 176) |
| WEB proxy forwards browser-supplied `x-user-id`/`x-org-id`; bearer path decode-only | Critical | WEB proxy | `src/app/api/proxy/[[...path]]/route.ts` — header takes priority; verified helper `getUserIdFromAuthorizationHeader` exists but is unused; client stores uid in `localStorage` (`useSession.ts`) and attaches it (`lib/api.ts`) | In production resolve identity from cookie session / verified bearer only; stop honouring client `x-user-id`/`x-org-id` | **Patched Day 175** (production only; dev/demo path unchanged) |
| Dashboard aggregates unauthenticated + hierarchy filter dead (`req.authUserId` never set anywhere) | Critical | API tenant isolation | `src/routes/dashboard.ts` read `(req as any).authUserId` (no writer exists) → `getUserContext(null)` → `applyHierarchyFilters` no-op; endpoints had no auth | Router-level identity guard + correct requester resolution | **Patched Day 174** |
| CRM manager org scope fail-open: missing or all-zero `x-org-id` (client-controllable) skipped membership checks | Critical | API tenant isolation | `src/routes/crm.ts` `requireManagerOrg` returned `bypassed: true` → `resolveVisibleReps` unscoped | Fail closed (`forbidden_org_scope`) in production; bypass kept for dev/local | **Patched Day 174** |
| Legacy endpoints with no auth: `/v1/reps/:id/overview`, `/v1/coach/assignments` (list/patch/delete/by-entity), `/v1/coach/notes`, `/v1/crm/accounts/:id/overview`, `/v1/crm/contacts/:id/overview`, `/v1/jobs/:id` (job results contain full transcripts) | Critical | API access control | Defined directly in `src/server.ts` with no guard; jobs endpoint returned any job by UUID | `requireIdentity` guard added to all; `/v1/jobs/:id` now owner-only | **Patched Day 174** (tenant scoping still open, see High) |
| `DEV_TEST_UID` env fallback active in production request path | Critical | API auth | `src/server.ts` auth-context middleware and `getUserId()` fell back to env uid with no `NODE_ENV` gate — if set in prod, anonymous callers authenticate as that user | Gated to non-production | **Patched Day 174** |

## High risks

| Risk | Severity | Area | Evidence | Suggested fix | Status |
|---|---|---|---|---|---|
| `requireAdmin` is an env flag, not an auth check — if `ALLOW_ADMIN_ENDPOINTS=true` is ever set in prod, `/v1/admin/score`, `/force-score`, `/post-slack`, `/digest/daily` are fully public | High | API admin | `src/server.ts` `requireAdmin`: `if (process.env.ALLOW_ADMIN_ENDPOINTS === "true") return next()` | Replace with `requireSuperAdmin`; keep env flag as an *additional* condition at most | Open — Day 175 |
| Guarded endpoints still lack tenant scope: any authenticated id can read any account/contact overview or coach assignments by UUID, and delete/patch any assignment (no ownership check) | High | API tenant isolation | `server.ts` CRM/coach overview endpoints query by raw UUID with no org filter; `DELETE/PATCH /v1/coach/assignments/:id` unscoped | Add org/ownership checks mirroring `canAccessCall` | Open — Day 175 |
| `requireManagerOrg` validates org membership but not manager tier; only some CRM handlers additionally call `isManagerUser` | High | API roles | `src/routes/crm.ts` — `manager/overview` checks tier, several sibling endpoints rely on org membership only | Fold a tier check into `requireManagerOrg`; sweep all `/crm/manager/*` handlers | Open — Day 175 |
| `POST /v1/team/ensure-profile` upserts a profile row for any arbitrary id, unauthenticated | High | API data integrity | `src/routes/team.ts` — no requester check, attacker can overwrite display names | Require identity and enforce `id === requester` | Open — Day 175 |
| Dashboard hierarchy scoping still no-ops for reps-only users (`getUserContext` reads `users` table only; no `reps` fallback) and rep-level users see unscoped aggregates | High | API tenant isolation | `src/routes/dashboard.ts` `applyHierarchyFilters` returns unfiltered query when context is null or role is rep | Fall back to `reps` for context; default-deny or self-scope when no context | Open — Day 175 |

## Medium risks

| Risk | Severity | Area | Evidence | Suggested fix | Status |
|---|---|---|---|---|---|
| Raw upstream error messages (Supabase/internal) returned to clients across many endpoints | Medium | API info leak | Ubiquitous `res.status(500).json({ error: e.message })` | Map to generic codes; log detail server-side | Open |
| Sparring/whisperer routes derive identity purely from `x-user-id` with per-route scoping of varying rigour | Medium | API | `src/routes/sparring.ts` `getUserIdHeader`, `whisperer.ts` — systemic identity issue applies; needs a scoping sweep | Sweep after identity fix lands | Open |
| Rate limits keyed by IP with no `trust proxy` configured — behind a load balancer all traffic may share one IP (or header-spoofed) | Medium | API rate limiting | `src/middleware/rateLimits.ts`, no `app.set('trust proxy', …)` | Configure trust proxy for the deployment topology | Open |
| `/v1/debug/*` endpoints reachable with any identity (`requireAuth` = presence of a uid) | Medium | API debug | `src/routes/debug.ts` | Gate behind SuperAdmin or remove in prod | Open |
| Stale compiled `.js` siblings alongside `.ts` sources (known to shadow imports — bit us on Day 171 pins) are a security hazard: a patched `.ts` guard can be silently bypassed by an old `.js` | Medium | API build hygiene | `src/**/*.js` throughout; `callsPins.ts.ts`/`.ts.js` oddities | Delete compiled artefacts from `src/`, add to `.gitignore`, build to `dist/` only | Open |
| Proxy debug endpoint `/api/proxy/__debug` enabled in prod when `PROXY_DEBUG_TOKEN` set; reveals auth-resolution detail | Medium | WEB proxy | `route.ts` `isProxyDebugAllowed` | Acceptable with strong token; rotate/remove before lighthouse | Open |

## Low risks

| Risk | Severity | Area | Evidence | Suggested fix | Status |
|---|---|---|---|---|---|
| Root page and `/v1/version` leak git SHA/build time | Low | API | `server.ts` `/`, `/v1/version` | Harmless for now; restrict later | Open |
| Every request logged with origin/UA; identity headers echoed back as `x-proxy-*` debug response headers | Low | WEB/API | `route.ts` sets `x-proxy-user-id` etc. on responses | Strip debug headers in production | Open |
| `x-user-id` cached in `localStorage` (`gravix_user_id`) — readable by any XSS | Low | WEB | `src/lib/useSession.ts` | Becomes moot once identity moves server-side | Open |
| `/v1/admin/index-hints` returns DDL strings (schema disclosure) behind the weak admin flag | Low | API | `server.ts` | Covered by `requireAdmin` fix | Open |

---

## Already-fixed security wins

- **CORS allow-list** (Vercel prod/staging + local only) with explicit header list; proxy path allow-list prevents open-proxy abuse (`/v1/*` only, traversal-safe).
- **Helmet security headers** on every response; strict CSP for a JSON API.
- **Rate limiting**: global 300/min, auth 10/15 min, upload 30/10 min.
- **Cron endpoints** require `x-cron-secret` with timing-safe comparison; execute mode double-gated by `CRON_ALLOW_EXECUTE`.
- **Upload hardening**: 50 MB cap, MIME allow-list, storage path forced to `${userId}/…` and enforced again at finalize; finalize stamps uploader office/company (Day 165).
- **Signed audio URLs** are short-lived (default 300 s) and only issued after `canAccessCall` (owner or same-org visibility rules, Day 171).
- **`/v1/team/users` tenant-scoped** (Day 168) — resolves requester company server-side, returns empty rather than the whole table.
- **Auth mismatch guard**: request fails loudly when `x-user-id` and JWT `sub` disagree.
- **Impersonation** requires SuperAdmin tier and is audit-logged; internal portal fails closed.
- **Manager surface** (`/v1/manager/*`) fully behind `requireManager` with hierarchy-scoped queries; null-office 500/403s fixed Days 166–170.

## Day 174 patches (this audit)

1. `DEV_TEST_UID` fallbacks gated to non-production (`server.ts`, two sites).
2. `requireIdentity` guard on 13 legacy `server.ts` endpoints; `/v1/jobs/:id` now owner-only (job results carry transcripts).
3. Dashboard router requires identity; dead `req.authUserId` reads replaced so hierarchy filtering actually engages for manager users.
4. CRM `requireManagerOrg` fails closed in production on missing/zero `x-org-id`.

All verified live: anonymous requests 401/403 under `NODE_ENV=production`; dev fallback and demo path unchanged in local dev.

## Day 175 patches (production identity hardening)

1. **WEB proxy no longer trusts browser identity in production.** Incoming `x-user-id`, `x-gravix-user-id`, `x-forwarded-user-id`, `x-real-user-id` and `x-org-id` are deleted before resolution; identity comes from the signature-verified bearer token (`getUserIdFromAuthorizationHeader` → `supabase.auth.getUser`) or the Supabase cookie session only. Org id is always server-resolved (reps lookup → env default). Dev keeps the legacy header path for curl/smoke tests and the demo.
2. **Proxy trust boundary (`PROXY_SHARED_SECRET`).** When the env is set on both deployments, the proxy stamps `x-proxy-secret` on every upstream request and the API strips all spoofable identity headers from requests lacking the matching secret (timing-safe compare) *before any route runs* — closing the per-route direct header reads as well as the central middleware. Unset env = unchanged behaviour, so rollout is opt-in and reversible. The internal cron self-call carries the secret too.
3. Verified live: with the secret configured, spoofed `x-user-id`/alias headers → 401/empty results; correct secret → normal responses; env unset → back-compat. Production proxy build 401s spoofed-header requests with no session.

**Rollout note:** set `PROXY_SHARED_SECRET` (same value) on the Vercel WEB project and the API host together. Until it is set, the API-side gate is dormant and direct callers can still supply `x-user-id`.

**Still open after Day 175:** the API's bearer path remains decode-only — a direct caller can present a forged JWT. With `PROXY_SHARED_SECRET` set this is the last unverified identity route into the API (= Day 176 priority). Client-supplied `x-company-id` / `x-active-office-id` hierarchy headers are still forwarded and should be validated against membership server-side.

## Recommended Day 175 fixes

1. ~~**Verified identity (the big one).** Production proxy resolves the user from the Supabase cookie session or signature-verified bearer only; stop honouring browser `x-user-id`/`x-org-id`. API accepts `x-user-id` only when accompanied by a proxy shared secret (`x-proxy-secret` env pair). Keep header identity for local dev.~~ **Shipped Day 175** (see above); remaining slice = API-side JWT verification (Day 176).
2. Replace `requireAdmin` env flag with `requireSuperAdmin`.
3. Ownership/org checks on coach assignments PATCH/DELETE, coach notes, CRM account/contact overviews.
4. Manager-tier check inside `requireManagerOrg` + sweep of `/crm/manager/*`.
5. `getUserContext` reps-table fallback + default-deny scoping in dashboard aggregates.
6. Lock `/v1/team/ensure-profile` to self.
7. Delete stale compiled `.js` files from `src/` (guard-bypass hazard).

## Do-not-ignore list before lighthouse clients

- [ ] **Verify `NODE_ENV=production` is set on the API host** — today's fail-closed patches depend on it.
- [ ] **Confirm prod env hygiene**: `DEV_TEST_UID`, `ALLOW_ORG_BYPASS`, `ALLOW_ADMIN_ENDPOINTS` must be unset in production.
- [ ] **Ship Day 175 #1 (verified identity)** — until then, any tenant data is one guessed UUID away for a direct-API caller.
- [ ] **Confirm the Supabase storage bucket is private** (signed-URL access only).
- [ ] Rotate any `PROXY_DEBUG_TOKEN` and Slack webhook URLs that have appeared in logs or docs.
- [ ] Begin the RLS roadmap (`RLS_ROADMAP.md` in API repo) — service-role-only DB access means one leaked key is total compromise.
