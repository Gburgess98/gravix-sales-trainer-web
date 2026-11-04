# Incident: hosted Manager Centre crash (digest 3227098399) + `x-org-id` failures

## 1. Manager Centre crash — root cause (confirmed)
**Destination:** sidebar → More → **Manager Centre** → `/crm/manager`.
**Hosted log** (`vercel logs … --query 3227098399`, staging deployment, `GET /crm/manager`):
`TypeError: fetch failed … digest: '3227098399' … Error: connect ECONNREFUSED 127.0.0.1:3000`.

**Cause.** `src/app/crm/manager/page.tsx` was an async **server component** that fetched its own `/api/proxy/v1/crm/manager/overview`
over HTTP *from the server*, with the base URL `process.env.NEXT_PUBLIC_WEB_URL ?? NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"`.
Hosted staging defines neither variable (`vercel env ls`: only Supabase URL/key, `PROXY_SHARED_SECRET`, `API_PROXY_TARGET`,
`NEXT_PUBLIC_APP_ENV`), so the server called a port nothing listens on. `fetch` threw, nothing caught it, there is no `error.tsx`
anywhere in the app, so Next replaced the whole application with its generic server-side error.
It could not have worked even with a valid URL: the call forwarded only cookies, while the app authenticates with a Bearer token.

**Reproduced locally** by running the production build on a non-3000 port with the variables unset (`ECONNREFUSED`) or empty
(`ERR_INVALID_URL` — `??` does not treat `""` as missing). The regression spec starts the build on :3101 with both variables
pointing at a closed port; against the old page all 4 tests fail, against the fix they pass.

**Fix.**
- `/crm/manager` is now a client page: no server-side self-fetch, no `cookies()`. The overview loads through `proxyFetch` (attaches auth).
  A failure is a page-level notice with **Try again**; the controls below still work. The raw API error is no longer put in a tooltip.
- `ManagerClient` used raw `fetch("/api/proxy/…")` (no Bearer, bypassing the `check:proxy` guard by using a variable); it now uses `proxyFetch`.
- New shared `ManagerGate` (extracted from the `/coaching` gate): manager = render; 401/403 = `router.replace('/assignments')`
  (no history entry, no manager UI, no manager requests); any other failure = "Couldn't check your access" + retry.
- New `src/app/error.tsx`: any other render failure shows a page-level "This page couldn't load" with **Try again** and a support
  reference (digest) instead of the full application error. The raw message is never rendered. A safety net, not the fix.

**Same pattern elsewhere (not changed):** `src/app/crm/manager/nudges/page.tsx` and `src/app/crm/contacts/[id]/page.tsx` are server
components that fetch `${INTERNAL_API_BASE_URL ?? "http://localhost:3000"}/api/proxy/…`. Hosted has no `INTERNAL_API_BASE_URL`,
so they will fail the same way (now with the error boundary instead of the full crash). They need the same conversion.

## 2. Hosted `Missing or invalid x-org-id` (CRM / Contacts) — diagnosis
**Verdict: the already-known seeded staging organisation issue, not a new header regression.** Found by reading code and
configuration; I did not observe the hosted requests in a browser session.
- The error comes from `gravix-sales-trainer-api/src/routes/crm.ts` `getOrgIdHeader`. It accepts a header (or `DEFAULT_ORG_ID`)
  only if it matches a **strict RFC-4122 regex** (`[1-5]` version nibble, `[89ab]` variant nibble) or is the all-zero UUID.
- Staging fixtures (`sql/seed/staging-day272-fixtures.sql`) use deterministic ids `00000000-2711-0000-0000-00000000000x`
  (version nibble `0`, variant nibble `0`) — they fail that regex.
- Railway staging API **has** `DEFAULT_ORG_ID` (36 chars, UUID-shaped) but with version nibble `0` and variant nibble `0`, so the
  fallback is rejected by the same regex. (Value not printed; only its shape was checked.)
- The web proxy only forwards an org id it can look up from cookies (`getOrgIdForUser` uses the cookie session) or from env defaults
  (`DEV_ORG_ID`, `DEFAULT_ORG_ID`, … — none set on hosted web staging). The browser authenticates with a Bearer token, so the lookup
  returns nothing and typically **no `x-org-id` is sent**; the API then falls to its own `DEFAULT_ORG_ID`, which is rejected.
  Either way a seeded org cannot pass. The proxy is behaving as designed since Day 175/316.
- Fix options (not done — API/data): seed the staging org with an RFC-valid UUID and update `DEFAULT_ORG_ID`, **or** relax the API
  regex to accept the seeded ids. Separately, the proxy's org lookup should use the Bearer identity, not only cookies.
- Not suppressed anywhere in this change: the UI still shows the page-level notice (without the raw string) and the real error remains
  in the API logs.
