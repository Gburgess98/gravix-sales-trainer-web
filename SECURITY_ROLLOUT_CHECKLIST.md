# SECURITY ROLLOUT CHECKLIST — Day 176

Operational checklist for rolling out the Day 174/175 security hardening to production.
Companion to `SECURITY_LOCKDOWN_AUDIT.md` (what was changed and why). This document is
**docs only** — no code changes shipped with it.

Scope of the rollout:

- **Day 174 (API `01fe149`)** — fail-closed access controls. These activate automatically
  when `NODE_ENV=production` is set on the API host. No new secrets required.
- **Day 175 (API `3add39b`, WEB `b9f3df4`)** — verified identity + proxy trust boundary.
  Opt-in: dormant until `PROXY_SHARED_SECRET` is set. Requires the **same secret on both
  hosts at the same time**.

---

## 1. Env vars to SET

### API host (Render/Railway/etc.)

| Var | Value | Why |
|---|---|---|
| `NODE_ENV` | `production` | All Day 174 fail-closed behaviour is gated on this: `DEV_TEST_UID` fallback disabled, `requireManagerOrg` fails closed on missing/zero `x-org-id`. **The patches are inert without it.** |
| `PROXY_SHARED_SECRET` | shared secret (see §3) | Activates the trust boundary: `x-user-id` and its aliases are only honoured when the request carries a matching `x-proxy-secret`; otherwise those headers are deleted before any route runs. |

### WEB (Vercel project — Production environment)

| Var | Value | Why |
|---|---|---|
| `PROXY_SHARED_SECRET` | **identical** to the API value | The proxy stamps `x-proxy-secret` on every upstream request. Server-side env only — must **not** have a `NEXT_PUBLIC_` prefix (that would ship it to the browser). |
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | existing Supabase project values | In production the proxy resolves identity **only** from a Supabase-verified bearer token or cookie session. Without these, every request 401s `missing_user`. |
| `API_PROXY_TARGET` | API base URL (optional) | Proxy upstream. Defaults to `https://api.gravixbots.com` in production if unset — only set it if the API lives elsewhere. |

Note: Vercel sets `NODE_ENV=production` automatically for production builds; do not override
it to anything else, since the whole `isProdProxy` boundary (identity-header stripping,
verified bearer path) keys off it.

### Deployment order (matters)

1. Set `PROXY_SHARED_SECRET` on **WEB** first and redeploy. Harmless on its own — the proxy
   stamps a header the API ignores while its env is unset.
2. Then set the same value + `NODE_ENV=production` on the **API** and restart.

Doing it in the other order breaks production: the API would strip the proxy-injected
`x-user-id` (no secret stamped yet), and any request without a bearer token — i.e. every
cookie-session browser user — loses identity and 401s.

## 2. Env vars to UNSET (production)

All of these are dev/demo escape hatches. Most are already gated to non-production in code,
but unset them anyway — defence in depth, and it removes ambiguity when reading env dashboards.

**API host:**

- `DEV_TEST_UID` — dev identity fallback (code-gated to non-prod since Day 174, but remove it).

**WEB (Vercel Production env):**

- `PROXY_DEV_X_USER_ID`, `NEXT_PUBLIC_DEV_USER_ID`, `DEV_TEST_UID` — dev user fallbacks
  (code-gated to non-prod, but remove).
- `PROXY_DEV_X_ORG_ID`, `DEV_ORG_ID`, `NEXT_PUBLIC_TEST_ORG_ID` — dev/test org overrides.

⚠️ **Careful with the org fallback:** in production the proxy resolves `x-org-id` as
*reps-table lookup → env default*. `DEFAULT_ORG_ID` / `NEXT_PUBLIC_DEFAULT_ORG_ID` serve as
that env default for users without a reps row. Only unset these if you're sure every
production user resolves an org via the reps lookup; otherwise leave the single intended
default in place and remove the rest.

Keep dev values in local `.env.local` / `.env` files only — they never ship.

## 3. Generating + verifying the secret match

Generate once, paste into both hosts:

```bash
openssl rand -hex 32
```

Both sides `.trim()` the value, and the API compares with a length check + `timingSafeEqual`,
so a stray space won't save you but a trailing newline from a copy-paste will be tolerated.
Avoid quotes/whitespace in the env dashboard anyway.

**Live verification (after both deploys):**

```bash
API=https://api.gravixbots.com
WEB=https://<web-app-domain>
UID=<any-real-user-uuid>
SECRET=<the shared secret>

# a) Direct API, spoofed identity, NO secret → must be rejected (401/403),
#    because the middleware deletes x-user-id before any route sees it.
curl -s -o /dev/null -w "%{http_code}\n" -H "x-user-id: $UID" "$API/v1/reps/overview"

# b) Direct API, spoofed identity, WRONG secret → must also be rejected.
curl -s -o /dev/null -w "%{http_code}\n" -H "x-user-id: $UID" -H "x-proxy-secret: wrong" "$API/v1/reps/overview"

# c) Direct API, identity + CORRECT secret → 200. Proves the API-side value.
curl -s -o /dev/null -w "%{http_code}\n" -H "x-user-id: $UID" -H "x-proxy-secret: $SECRET" "$API/v1/reps/overview"

# d) Through the WEB proxy as a real logged-in user (browser, cookie session) →
#    pages load. Proves the WEB-side value matches (c)'s.
```

**Mismatch symptom to watch for:** if the WEB secret differs from the API's, the API strips
the proxy-injected `x-user-id`. Requests that also carry a bearer token still work (the API
falls back to the JWT `sub`), but **cookie-session browser users get 401s across the app**.
"Bearer flows fine, cookie logins broken" ⇒ suspect a secret mismatch first.

## 4. What breaks for direct scripts without `x-proxy-secret`

Once `PROXY_SHARED_SECRET` is set on the API, any tool that calls the deployed API directly
and asserts identity via headers (`x-user-id`, `x-gravix-user-id`, `x-forwarded-user-id`,
`x-real-user-id`) has those headers **silently deleted** in the central middleware. The
request then proceeds unauthenticated and hits `requireIdentity` → `401`/`403` (there is no
`DEV_TEST_UID` rescue in production).

Affected callers and fixes:

- **API repo validation/seed scripts** pointed at the deployed API (e.g.
  `validate-*.ts`, `seed-demo-org.ts`, `seed-ufc-demo-story.ts`, `smoke.sh`) → add
  `-H "x-proxy-secret: $PROXY_SHARED_SECRET"` (or export the env where the script builds
  headers). Scripts run against **localhost with the env unset are unaffected** — the gate
  is dormant there.
- **Ad-hoc curl / Postman** with `x-user-id` → same: include the secret header, or use a
  real `Authorization: Bearer` token instead (the bearer path is not gated — note it is
  still decode-only until the Day 176+ JWT-verification work lands).
- **Internal cron self-call** — already stamps the secret from its own env (Day 175);
  nothing to do, but see smoke check §5(f).
- **The WEB proxy** — stamps the secret automatically; browser traffic is unaffected.

Treat the secret like a credential: never commit it, never put it in a `NEXT_PUBLIC_` var,
pass it to scripts via env.

## 5. Production smoke checks (post-deploy)

Run in order; expected result in brackets.

- **(a) Anonymous proxy call** — `curl -s -o /dev/null -w "%{http_code}" $WEB/api/proxy/v1/reps/overview` → **401** `missing_user`.
- **(b) Spoofed identity through the prod proxy** — same call with `-H "x-user-id: $UID"` → **401** (prod proxy strips browser identity headers; header path is dev-only).
- **(c) Direct API spoof, no/wrong secret** — §3(a)/(b) → **401/403**.
- **(d) Direct API with correct secret** — §3(c) → **200**.
- **(e) Real login** — log in as the demo manager (Dana), confirm `/coaching`, `/dashboard`, Calls, and Review Queue load with data (proves cookie-session resolution + org lookup + secret match end-to-end).
- **(f) Cron self-call** — after the next scheduled run, check API logs for auth errors on the internal endpoint (it must be stamping the secret).
- **(g) Static validators still green** (run locally, pre- or post-deploy):
  - WEB: `npm run validate-security-day-175` (nests day-174; 14 checks)
  - API: `npx tsx scripts/validate-security-lockdown.ts` (16 checks)
- **(h) WEB build** — `npm run build` passes (only needed if deploying new WEB code, not for env-only changes).

## 6. Rollback plan

The Day 175 trust boundary was designed opt-in, so rollback is an **env change, not a revert**.

1. **Unset `PROXY_SHARED_SECRET` on the API** and restart. `identityHeadersTrusted()` returns
   true when the env is empty → identity headers honoured as before Day 175. This alone
   restores pre-rollout behaviour for every caller.
2. Optionally unset it on WEB too. Not urgent — with the API env empty, the stamped header
   is simply ignored. (If you unset WEB but not API, you recreate the §3 mismatch outage —
   don't do it in that order.)
3. **Do not unset `NODE_ENV=production` on the API** as part of a rollback. That would also
   disable the Day 174 fail-closed patches (and re-enable `DEV_TEST_UID`), which are
   independent of the secret and should stay on.
4. Full code revert (`API 3add39b` / WEB `b9f3df4`) is a last resort only — the changes are
   inert without the env, so there is nothing an env rollback can't switch off.

**Rollback order: API first, then (optionally) WEB** — the mirror image of the deploy order.

---

*Day 176. Validated with `validate-security-day-175` (WEB) and `validate-security-lockdown` (API); no code changed.*
