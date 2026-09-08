// Day 316 — WEB proxy identity-boundary regression guard (network-free, behavioural).
//
// Locks the production hardening invariants the proxy route relies on. The real
// route module imports Next runtime internals that don't resolve under plain
// node, so the security-critical DECISIONS are extracted into the Next-free
// @/lib/proxyIdentity module and exercised here directly. A wiring assertion
// confirms the route actually calls them (so the invariant can't be bypassed).
//
//   1. In production, browser-supplied x-user-id / aliases / x-org-id are stripped.
//   2. In production the header-derived user id is forced empty (spoof ignored).
//   3. Dev fallback identity is never permitted in production.
//   4. Non-vacuity: outside production the same header IS honoured, and the route
//      is verified to actually invoke the helpers.
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
} from "../src/lib/proxyIdentity.ts";

const SPOOF = "44444444-4444-4444-8444-444444444444";
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

console.log("Day 316 — WEB proxy identity boundary regression guard\n");

// ── 1. production strips every spoofable identity header (+ x-org-id) ─────
{
  const h = spoofedHeaders();
  stripSpoofableIdentityHeaders(h, /* isProd */ true);
  ok("prod: all spoofable identity headers removed",
    SPOOFABLE_PROXY_IDENTITY_HEADERS.every((n) => h.get(n) === null) && h.get("x-org-id") === null);
  ok("prod: non-identity headers preserved (content-type kept)", h.get("content-type") === "application/json");
}

// ── 2. production forces header-derived user id empty (spoof ignored) ─────
ok("prod: trustedHeaderUserId ignores a spoofed x-user-id (empty)",
  trustedHeaderUserId(spoofedHeaders(), true) === "");

// ── 3. dev fallback never permitted in production ─────────────────────────
ok("prod: dev fallback NOT allowed even with a dev uid set",
  devFallbackAllowed(DEV_UUID, true) === false);

// ── 4a. non-production control (non-vacuity) ──────────────────────────────
{
  const h = spoofedHeaders();
  stripSpoofableIdentityHeaders(h, /* isProd */ false); // dev: no strip
  ok("dev control: headers NOT stripped and x-user-id honoured",
    h.get("x-user-id") === SPOOF && trustedHeaderUserId(h, false) === SPOOF);
  ok("dev control: dev fallback allowed when a dev uid is set",
    devFallbackAllowed(DEV_UUID, false) === true);
}

// ── 4b. wiring: the real route actually invokes the hardening helpers ─────
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
  ok("route gates dev fallback via devFallbackAllowed(devUid, isProdProxy)",
    /devFallbackAllowed\(devUid,\s*isProdProxy\)/.test(routeSrc));
}

console.log(`\n${failures === 0 ? "✅ PASS" : `❌ FAIL (${failures})`} — WEB proxy identity boundary guard\n`);
process.exit(failures === 0 ? 0 : 1);
