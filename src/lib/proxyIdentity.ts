// Day 316 — proxy identity hardening primitives (Next-free, unit-testable).
//
// Extracted from src/app/api/proxy/[[...path]]/route.ts (the Day-175 production
// hardening) so the invariants can be exercised by a network-free regression
// test (scripts/validate-identity-boundary-day-316.mts). Behaviour is unchanged.
//
// Production contract:
//   - Browser-supplied identity headers (x-user-id + aliases, x-org-id) are
//     DELETED before resolution — never trusted or forwarded.
//   - The header-derived user id is always empty in production; identity comes
//     only from the verified Bearer/cookie session.
//   - The dev fallback identity is permitted ONLY outside production.

export const SPOOFABLE_PROXY_IDENTITY_HEADERS = [
  "x-user-id",
  "x-gravix-user-id",
  "x-forwarded-user-id",
  "x-real-user-id",
] as const;

export function isProdProxyEnv(nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return nodeEnv === "production";
}

/**
 * In production, strip every browser-supplied identity header (plus x-org-id)
 * from the outgoing header set so it can never be trusted or forwarded upstream.
 * No-op outside production. Mutates `headers` in place.
 */
export function stripSpoofableIdentityHeaders(headers: Headers, isProd: boolean): void {
  if (!isProd) return;
  for (const h of SPOOFABLE_PROXY_IDENTITY_HEADERS) headers.delete(h);
  headers.delete("x-org-id");
}

/** The header-derived user id the proxy will trust — always empty in production. */
export function trustedHeaderUserId(headers: Headers, isProd: boolean): string {
  return isProd ? "" : (headers.get("x-user-id") || "").trim();
}

/** Dev fallback identity is permitted only outside production. */
export function devFallbackAllowed(devUid: string, isProd: boolean): boolean {
  return !isProd && !!devUid;
}
