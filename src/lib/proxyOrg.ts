// Proxy organisation-identity decision (Next-free, unit-testable) — the org counterpart of proxyIdentity.ts.
//
// The organisation the API sees must come from the VERIFIED user's own membership (their `reps.org_id`, read with
// their own Bearer/cookie session), never from the browser. Rules:
//   • verified membership present → that org is forwarded. A client-supplied `x-org-id` that differs (or is malformed)
//     is a mismatch and the request is REFUSED (403 org_mismatch), never "corrected" silently and never forwarded.
//   • no verified membership → any client-supplied org is IGNORED (it cannot be verified). The configured default org
//     is used only as an explicit last resort: always outside production, and in production only when the operator
//     sets PROXY_ALLOW_DEFAULT_ORG=1. Otherwise no org header is sent and the API decides.
// This module deliberately does NOT validate UUID syntax: the API's own strict predicate stays the single authority,
// and a malformed id can only ever be compared for equality here, never accepted.

export type ProxyOrgSource = 'membership' | 'fallback' | 'none'

export interface ProxyOrgInputs {
  /** NODE_ENV === "production" */
  isProd: boolean
  /** x-org-id as sent by the browser, captured BEFORE any stripping ("" if absent) */
  clientOrgId: string
  /** org_id from the verified user's own reps row ("" if it could not be read) */
  verifiedOrgId: string
  /** configured default org (DEV_ORG_ID / DEFAULT_ORG_ID …) */
  fallbackOrgId: string
  /** PROXY_ALLOW_DEFAULT_ORG === "1" */
  allowDefaultInProd: boolean
}

export type ProxyOrgDecision =
  | { ok: true; orgId: string; source: ProxyOrgSource }
  | { ok: false; error: 'org_mismatch'; status: 403 }

const norm = (s: string) => String(s ?? '').trim().toLowerCase()

export function resolveProxyOrgId(i: ProxyOrgInputs): ProxyOrgDecision {
  const verified = norm(i.verifiedOrgId)
  const client = norm(i.clientOrgId)
  if (verified) {
    if (client && client !== verified) return { ok: false, error: 'org_mismatch', status: 403 }
    return { ok: true, orgId: i.verifiedOrgId.trim(), source: 'membership' }
  }
  const fallbackAllowed = !i.isProd || i.allowDefaultInProd
  const fallback = i.fallbackOrgId.trim()
  if (fallbackAllowed && fallback) return { ok: true, orgId: fallback, source: 'fallback' }
  return { ok: true, orgId: '', source: 'none' }
}
