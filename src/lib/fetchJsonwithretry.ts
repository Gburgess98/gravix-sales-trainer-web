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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffDelay(attemptIdx: number, baseMs: number, maxMs: number) {
  const exp = Math.min(maxMs, Math.floor(baseMs * Math.pow(2, attemptIdx)));
  const jitter = Math.floor(Math.random() * 100);
  return Math.min(maxMs, exp + jitter);
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
      const res = await fetch(input, init);
      const text = await res.text();
      const isJson = (res.headers.get("content-type") || "").includes("application/json");
      const data = isJson && text ? JSON.parse(text) : (text as unknown as T);

      if (!res.ok) {
        const msg = isJson && data && (data as any).error
          ? (data as any).error
          : `${res.status} ${res.statusText}`;
        const err: any = new Error(msg);
        err.status = res.status;
        err.body = data;
        throw err;
      }

      return data as T;
    } catch (e: any) {
      lastErr = e;
      const status = e?.status as number | undefined;
      const retriable =
        e?.name === "FetchError" ||
        e?.code === "ECONNRESET" ||
        e?.code === "ETIMEDOUT" ||
        (status && status >= 500);

      if (i < attempts - 1 && retriable) {
        await sleep(backoffDelay(i, baseMs, maxMs));
        continue;
      }
      throw e;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "unknown_error"));
}

// Provide default export for convenience
export default fetchJsonWithRetry;