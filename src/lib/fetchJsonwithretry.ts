// web/src/lib/fetchJsonwithretry.ts
// NOTE: keep this exact filename (lowercase "withretry") to avoid case-sensitivity issues on Linux builds.

export type RetryOptions = {
  /** total attempts including the first try (default 3) */
  attempts?: number;
  /** base backoff in ms (default 250) */
  baseMs?: number;
  /** max backoff in ms (default 4000) */
  maxMs?: number;
};

type NormalisedError = Error & {
  status?: number;
  code?: string;
  body?: any;
};

function normaliseError(e: any, fallbackMsg: string): NormalisedError {
  const err: NormalisedError =
    e instanceof Error ? e : new Error(fallbackMsg);

  if (typeof e?.status === "number") err.status = e.status;
  if (typeof e?.code === "string") err.code = e.code;
  if (typeof e?.body !== "undefined") err.body = e.body;

  return err;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffDelay(attemptIdx: number, baseMs: number, maxMs: number) {
  const exp = Math.min(maxMs, Math.floor(baseMs * Math.pow(2, attemptIdx)));
  const jitter = Math.floor(Math.random() * 100);
  return Math.min(maxMs, exp + jitter);
}

function isProxyRequest(input: RequestInfo | URL) {
  try {
    const s = typeof input === "string" ? input : (input as any)?.toString?.() ?? "";
    return s.includes("/api/proxy/");
  } catch {
    return false;
  }
}

function getSupabaseAccessTokenFromLocalStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const key = Object.keys(window.localStorage).find(
      (k) => k.startsWith("sb-") && k.endsWith("-auth-token")
    );
    if (!key) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.access_token === "string" ? parsed.access_token : null;
  } catch {
    return null;
  }
}

function hasAuthHeader(headers: HeadersInit | undefined): boolean {
  if (!headers) return false;
  try {
    if (headers instanceof Headers) return headers.has("authorization") || headers.has("Authorization");
    if (Array.isArray(headers)) return headers.some(([k]) => String(k).toLowerCase() === "authorization");
    return Object.keys(headers as any).some((k) => k.toLowerCase() === "authorization");
  } catch {
    return false;
  }
}

/**
 * Fetch JSON with simple retry/backoff for network and 5xx errors.
 * - Throws with {status, body} on !ok
 * - Returns parsed JSON (or text if not JSON)
 */
export async function fetchJsonWithRetry<T = any>(
  input: RequestInfo | URL,
  init: (RequestInit & RetryOptions) = {}
): Promise<T> {
  const attempts = Math.max(1, init.attempts ?? 3);
  const baseMs = init.baseMs ?? 250;
  const maxMs = init.maxMs ?? 4000;

  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      // Build a safe per-request init (do not mutate caller-provided init)
      const finalInit: RequestInit = { ...init };

      // Browser-only: if calling our Next proxy, include cookies and attach Supabase bearer if available
      if (typeof window !== "undefined" && isProxyRequest(input)) {
        if (!finalInit.credentials) finalInit.credentials = "include";

        const alreadyHasAuth = hasAuthHeader(finalInit.headers);
        if (!alreadyHasAuth) {
          const token = getSupabaseAccessTokenFromLocalStorage();
          if (token) {
            const merged = new Headers(finalInit.headers as any);
            merged.set("Authorization", `Bearer ${token}`);
            finalInit.headers = merged;
          }
        }
      }

      const res = await fetch(input, finalInit);
      const text = await res.text();
      const isJson = (res.headers.get("content-type") || "").includes("application/json");
      const data = isJson && text ? JSON.parse(text) : (text as unknown as T);

      if (!res.ok) {
        throw normaliseError(
          {
            status: res.status,
            body: data,
            message:
              isJson && data && (data as any).error
                ? (data as any).error
                : `${res.status} ${res.statusText}`,
          },
          "request_failed"
        );
      }

      return data as T;
    } catch (e: any) {
      lastErr = normaliseError(e, "network_error");
      const status = lastErr?.status as number | undefined;
      const retriable =
        lastErr?.name === "FetchError" ||
        lastErr?.code === "ECONNRESET" ||
        lastErr?.code === "ETIMEDOUT" ||
        (status && status >= 500);

      if (i < attempts - 1 && retriable) {
        await sleep(backoffDelay(i, baseMs, maxMs));
        continue;
      }
      throw lastErr;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "unknown_error"));
}

// Provide default export for convenience
export default fetchJsonWithRetry;