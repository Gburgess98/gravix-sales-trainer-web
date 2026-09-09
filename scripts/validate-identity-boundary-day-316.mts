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

console.log(`\n${failures === 0 ? "✅ PASS" : `❌ FAIL (${failures})`} — WEB proxy identity boundary guard\n`);
process.exit(failures === 0 ? 0 : 1);
