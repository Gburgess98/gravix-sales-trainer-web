// Day 316 / 317 — WEB proxy identity-boundary regression guard (network-free, behavioural).
//
// Locks the production hardening invariants the proxy route relies on. The real
// route module imports Next runtime internals that don't resolve under plain
// node, so the security-critical DECISIONS are extracted into the Next-free
// @/lib/proxyIdentity module and exercised here directly through the SAME code
// the route calls. A wiring assertion confirms the route invokes them.
//
// Day 316 (helpers):
//   1. In production, browser-supplied x-user-id / aliases / x-org-id are stripped.
//   2. In production the header-derived user id is forced empty (spoof ignored).
//   3. Dev fallback identity is never permitted in production.
// Day 317 (complete resolution decision, resolveProxyUserId):
//   4. spoof-only (no verified Bearer/cookie) ⇒ resolves to NONE ⇒ route rejects.
//   5. verified Bearer accepted after spoofed headers ignored.
//   6. verified cookie accepted when no Bearer present.
//   7. Bearer takes precedence over cookie.
//   8. dev fallback never selected in production (selected only off-prod).
//
// Run: node scripts/validate-identity-boundary-day-316.mts   (no network, no DB)

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveProxyOrgId } from "../src/lib/proxyOrg.ts";
import {
  SPOOFABLE_PROXY_IDENTITY_HEADERS,
  stripSpoofableIdentityHeaders,
  trustedHeaderUserId,
  devFallbackAllowed,
  resolveProxyUserId,
} from "../src/lib/proxyIdentity.ts";

const SPOOF = "44444444-4444-4444-8444-444444444444";
const BEARER_UID = "66666666-6666-4666-8666-666666666666";
const COOKIE_UID = "77777777-7777-4777-8777-777777777777";
const DEV_UUID = "55555555-5555-4555-8555-555555555555";

let failures = 0;
function ok(name: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "✅" : "❌"}  ${name}${detail ? " — " + detail : ""}`);
  if (!pass) failures++;
}

function spoofedHeaders(): Headers {
  return new Headers({
    "x-user-id": SPOOF,
    "x-gravix-user-id": SPOOF,
    "x-forwarded-user-id": SPOOF,
    "x-real-user-id": SPOOF,
    "x-org-id": "99999999-9999-4999-8999-999999999999",
    "content-type": "application/json",
  });
}

// Reproduce the route's own header-derivation step, then delegate the ORDER
// decision to the shared resolveProxyUserId — i.e. exactly the route's chain.
function resolveLikeRoute(opts: {
  isProd: boolean;
  headers: Headers;
  bearerUserId?: string;
  cookieUserId?: string;
  devUid?: string;
}) {
  const headers = new Headers(opts.headers);
  stripSpoofableIdentityHeaders(headers, opts.isProd);
  const headerUserId = trustedHeaderUserId(headers, opts.isProd);
  return resolveProxyUserId({
    isProd: opts.isProd,
    headerUserId,
    bearerUserId: opts.bearerUserId ?? "",
    cookieUserId: opts.cookieUserId ?? "",
    devUid: opts.devUid ?? "",
  });
}

console.log("Day 316/317 — WEB proxy identity boundary regression guard\n");

// ── Day 316: strip / header / dev helpers ─────────────────────────────────
{
  const h = spoofedHeaders();
  stripSpoofableIdentityHeaders(h, true);
  ok("prod: all spoofable identity headers removed",
    SPOOFABLE_PROXY_IDENTITY_HEADERS.every((n) => h.get(n) === null) && h.get("x-org-id") === null);
  ok("prod: non-identity headers preserved (content-type kept)", h.get("content-type") === "application/json");
}
ok("prod: trustedHeaderUserId ignores a spoofed x-user-id (empty)",
  trustedHeaderUserId(spoofedHeaders(), true) === "");
ok("prod: dev fallback NOT allowed even with a dev uid set",
  devFallbackAllowed(DEV_UUID, true) === false);
{
  const h = spoofedHeaders();
  stripSpoofableIdentityHeaders(h, false); // dev: no strip
  ok("dev control: headers NOT stripped and x-user-id honoured",
    h.get("x-user-id") === SPOOF && trustedHeaderUserId(h, false) === SPOOF);
  ok("dev control: dev fallback allowed when a dev uid is set",
    devFallbackAllowed(DEV_UUID, false) === true);
}

// ── Day 317: complete production resolution decision ──────────────────────
{
  // 4. spoof-only, no verified identity ⇒ NONE ⇒ route returns 401 missing_user.
  const r = resolveLikeRoute({ isProd: true, headers: spoofedHeaders(), devUid: DEV_UUID });
  ok("prod: spoof-only (no bearer/cookie) resolves to NONE (would be rejected)",
    r.userId === "" && r.source === "none", `userId='${r.userId}' source=${r.source}`);
}
{
  // 5. verified Bearer accepted even though spoofed headers are present (ignored).
  const r = resolveLikeRoute({ isProd: true, headers: spoofedHeaders(), bearerUserId: BEARER_UID, devUid: DEV_UUID });
  ok("prod: verified Bearer accepted after spoofed headers ignored",
    r.userId === BEARER_UID && r.source === "bearer", `userId=${r.userId} source=${r.source}`);
}
{
  // 6. verified cookie accepted when no Bearer present.
  const r = resolveLikeRoute({ isProd: true, headers: spoofedHeaders(), cookieUserId: COOKIE_UID, devUid: DEV_UUID });
  ok("prod: verified cookie accepted when no Bearer present",
    r.userId === COOKIE_UID && r.source === "cookie", `userId=${r.userId} source=${r.source}`);
}
{
  // 7. Bearer precedence over cookie.
  const r = resolveLikeRoute({ isProd: true, headers: spoofedHeaders(), bearerUserId: BEARER_UID, cookieUserId: COOKIE_UID });
  ok("prod: Bearer takes precedence over cookie", r.userId === BEARER_UID && r.source === "bearer");
}
{
  // 8. dev fallback never selected in production; selected only off-prod.
  const prod = resolveLikeRoute({ isProd: true, headers: new Headers(), devUid: DEV_UUID });
  const dev = resolveLikeRoute({ isProd: false, headers: new Headers(), devUid: DEV_UUID });
  ok("prod: dev fallback never selected ⇒ NONE", prod.userId === "" && prod.source === "none");
  ok("dev control: dev fallback selected when nothing else present", dev.userId === DEV_UUID && dev.source === "dev");
}

// ── wiring: the real route actually invokes the hardening helpers ─────────
{
  const here = path.dirname(fileURLToPath(import.meta.url));
  const routeSrc = fs.readFileSync(
    path.join(here, "..", "src", "app", "api", "proxy", "[[...path]]", "route.ts"),
    "utf8",
  );
  ok("route imports the hardening helpers from @/lib/proxyIdentity",
    /from ["']@\/lib\/proxyIdentity["']/.test(routeSrc));
  ok("route calls stripSpoofableIdentityHeaders(headers, isProdProxy)",
    /stripSpoofableIdentityHeaders\(headers,\s*isProdProxy\)/.test(routeSrc));
  ok("route derives headerUserId via trustedHeaderUserId(headers, isProdProxy)",
    /trustedHeaderUserId\(headers,\s*isProdProxy\)/.test(routeSrc));
  ok("route resolves identity via resolveProxyUserId({ isProd: isProdProxy, ... })",
    /resolveProxyUserId\(\{[\s\S]*isProd:\s*isProdProxy/.test(routeSrc));
}

// ── organisation identity (staging org repair): membership, not the browser ───
{
  const ORG = "00000000-2711-4000-8000-000000000002";
  const OTHER = "99999999-9999-4999-8999-999999999999";
  const base = { isProd: true, clientOrgId: "", verifiedOrgId: "", fallbackOrgId: "", allowDefaultInProd: false };
  const own = resolveProxyOrgId({ ...base, verifiedOrgId: ORG });
  ok("org: verified membership is what is forwarded", own.ok && own.orgId === ORG && own.source === "membership");
  const tamper = resolveProxyOrgId({ ...base, verifiedOrgId: ORG, clientOrgId: OTHER });
  ok("org: a different client-supplied org is refused (403 org_mismatch), not forwarded", !tamper.ok && tamper.status === 403);
  const unverified = resolveProxyOrgId({ ...base, clientOrgId: OTHER });
  ok("org: with no verified membership the client org is ignored", unverified.ok && unverified.orgId === "" && unverified.source === "none");
  const prodDefault = resolveProxyOrgId({ ...base, fallbackOrgId: OTHER });
  ok("org: the default org is NOT used in production unless explicitly allowed", prodDefault.ok && prodDefault.orgId === "");
  const optIn = resolveProxyOrgId({ ...base, fallbackOrgId: OTHER, allowDefaultInProd: true });
  ok("org: explicit opt-in enables the default org as a last resort", optIn.ok && optIn.orgId === OTHER && optIn.source === "fallback");

  const here2 = path.dirname(fileURLToPath(import.meta.url));
  const routeSrc2 = fs.readFileSync(path.join(here2, "..", "src", "app", "api", "proxy", "[[...path]]", "route.ts"), "utf8");
  const stripAt = routeSrc2.indexOf("stripSpoofableIdentityHeaders(headers, isProdProxy)");
  const captureAt = routeSrc2.indexOf('const clientOrgId = (headers.get("x-org-id")');
  ok("route captures the client org BEFORE stripping it (so tampering is detectable in production)", captureAt > 0 && captureAt < stripAt);
  ok("route resolves the org via resolveProxyOrgId and refuses a mismatch", /resolveProxyOrgId\(\{[\s\S]*isProd:\s*isProdProxy/.test(routeSrc2) && /!orgDecision\.ok[\s\S]{0,200}status:\s*orgDecision\.status/.test(routeSrc2));
  ok("route reads the org with the user's own Bearer session first (getOrgIdForBearer)", /await getOrgIdForBearer\(bearerToken,\s*resolvedUserId\)/.test(routeSrc2));
  ok("route no longer lets the browser's x-org-id through", !/existingOrgId/.test(routeSrc2) && /headers\.delete\("x-org-id"\)/.test(routeSrc2));
  ok("route does not carry a UUID predicate of its own", !/\[1-5\]\[0-9a-f\]\{3\}-\[89ab\]/.test(routeSrc2.replace(/function isUuid[\s\S]*?\n\}/, "")));
}

console.log(`\n${failures === 0 ? "✅ PASS" : `❌ FAIL (${failures})`} — WEB proxy identity boundary guard\n`);
process.exit(failures === 0 ? 0 : 1);
