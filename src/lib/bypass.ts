// src/lib/bypass.ts
export function isBypass(): boolean {
  if (typeof window === "undefined") return false;
  const qp = new URLSearchParams(window.location.search);
  return qp.get("__bypass") === "1" || qp.get("__bypass") === "true";
}

/** Headers to send when bypassing auth for local/dev testing */
export function bypassHeaders(): HeadersInit {
  return isBypass() ? { "x-bypass-auth": "1" } : {};
}