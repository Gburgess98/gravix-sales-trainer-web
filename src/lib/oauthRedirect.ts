// OAuth redirect helpers for the browser login. Pure and Next-free so they can be unit-tested with `node --test`.
//
// The OAuth `redirectTo` for a user-triggered browser login is ALWAYS the origin of the page the user is on. No environment URL
// and no localhost fallback: a preview must come back to the preview, production to production. (Supabase still only honours
// redirectTo values on its Redirect URL allow-list; anything else falls back to its Site URL.)

export const POST_LOGIN_KEY = "gravix:post-login-next";
export const CALLBACK_PATH = "/auth/callback";
export const DEFAULT_AFTER_LOGIN = "/recent-calls";

/** `origin` must be a bare http(s) origin (as window.location.origin produces); anything else throws. */
export function buildOAuthRedirectTo(origin: string): string {
  let u: URL;
  try { u = new URL(origin); } catch { throw new Error("invalid_origin"); }
  if ((u.protocol !== "https:" && u.protocol !== "http:") || u.origin !== origin.replace(/\/$/, "")) throw new Error("invalid_origin");
  return `${u.origin}${CALLBACK_PATH}`;
}

/**
 * A post-login destination is accepted only when it is a same-site absolute PATH: starts with a single "/", no scheme, no
 * "//" or "/\" (protocol-relative / backslash tricks), no control characters, bounded length, not the login/callback pages
 * (loops). Returns the path (with query) or null.
 */
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== "string") return null;
  const v = next.trim();
  if (!v || v.length > 300) return null;
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(v)) return null;
  if (/^\/[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v)) return null; // "/javascript:..." style
  let decoded = v;
  try { decoded = decodeURIComponent(v); } catch { return null; }
  if (decoded.startsWith("//") || /[\u0000-\u001f\u007f\\]/.test(decoded)) return null;
  const pathOnly = v.split(/[?#]/)[0];
  if (pathOnly === "/login" || pathOnly.startsWith("/auth/")) return null;
  return v;
}
