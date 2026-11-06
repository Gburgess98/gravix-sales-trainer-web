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

export type ProxyAuthSource = "header" | "bearer" | "cookie" | "dev" | "none";

export interface ProxyUserIdInputs {
  /** NODE_ENV === "production" */
  isProd: boolean;
  /** header-derived user id — must already be run through trustedHeaderUserId (empty in prod) */
  headerUserId: string;
  /** user id from the VERIFIED Bearer token (server-verified in prod), else "" */
  bearerUserId: string;
  /** user id from the VERIFIED Supabase cookie session, else "" */
  cookieUserId: string;
  /** sanitized dev fallback uid (already uuid-validated), else "" */
  devUid: string;
}

/**
 * The single source of truth for the proxy's identity-resolution ORDER decision:
 * header > bearer > cookie > dev (dev only permitted outside production). Pure —
 * the async Bearer/cookie verification happens in the route and is passed in as
 * already-resolved ids so this decision can be exercised network-free. When the
 * result is `none`, the route rejects with 401 missing_user.
 */
export function resolveProxyUserId(i: ProxyUserIdInputs): { userId: string; source: ProxyAuthSource } {
  const allowDevFallback = devFallbackAllowed(i.devUid, i.isProd);
  const userId =
    i.headerUserId ||
    i.bearerUserId ||
    i.cookieUserId ||
    (allowDevFallback ? i.devUid : "");
  const source: ProxyAuthSource = i.headerUserId
    ? "header"
    : i.bearerUserId
      ? "bearer"
      : i.cookieUserId
        ? "cookie"
        : allowDevFallback && i.devUid
          ? "dev"
          : "none";
  return { userId, source };
}
