// Defaults for retries/backoff used by fetchJsonWithRetry
export const DEFAULT_FETCH_RETRY = { attempts: 4, baseMs: 300, maxMs: 2500 };

// Re-export to satisfy imports that use PascalCased file name
export * from "./fetchJsonwithretry";
export { default } from "./fetchJsonwithretry";

type RetryOpts = { attempts?: number; baseMs?: number; maxMs?: number };
type InitWithRetry = RequestInit & { retry?: RetryOpts; retries?: number; backoffMs?: number };

function deriveRetry(init?: InitWithRetry): Required<RetryOpts> {
  const attempts = init?.retry?.attempts ?? (init?.retries ?? DEFAULT_FETCH_RETRY.attempts);
  const baseMs = init?.retry?.baseMs ?? (init?.backoffMs ?? DEFAULT_FETCH_RETRY.baseMs);
  const maxMs = init?.retry?.maxMs ?? DEFAULT_FETCH_RETRY.maxMs;
  return { attempts, baseMs, maxMs };
}

function shouldRetryStatus(status: number) {
  return status === 429 || (status >= 500 && status <= 599);
}

export async function fetchJsonWithRetry<T=any>(url: string, init: RequestInit = {}, attempts = 3, backoffMs = 300): Promise<T> {
  let lastErr: any;
  for (let i=0;i<attempts;i++) {
    try {
      const r = await fetch(url, { ...init, cache: "no-store" });
      const text = await r.text();
      let body: any = null;
      try { body = JSON.parse(text); } catch { body = text; }
      if (!r.ok) throw new Error(typeof body === "string" ? body : JSON.stringify(body));
      return body as T;
    } catch (e:any) {
      lastErr = e;
      await new Promise(r => setTimeout(r, backoffMs * (i+1)));
    }
  }
  throw lastErr;
}

// web/src/lib/fetchJsonWithRetry.ts

export async function fetchJsonWithRetry<T = any>(
  input: RequestInfo | URL,
  init: InitWithRetry = {}
): Promise<T> {
  const { attempts, baseMs, maxMs } = deriveRetry(init);

  let lastErr: any;
  for (let i = 0; i <= attempts; i++) {
    try {
      const r = await fetch(input, init);
      const ct = r.headers.get("content-type") || "";
      const isJson = ct.includes("application/json") || ct.includes("+json");

      if (!r.ok) {
        // Only retry for 429/5xx. For other 4xx, surface the error immediately.
        if (shouldRetryStatus(r.status)) {
          lastErr = new Error(`HTTP ${r.status}`);
        } else {
          if (isJson) {
            const j = await r.json().catch(() => ({}));
            const message = (j as any)?.error || (j as any)?.message || `HTTP ${r.status}`;
            throw new Error(message);
          } else {
            const text = await r.text().catch(() => "");
            throw new Error(text || `HTTP ${r.status}`);
          }
        }
      } else {
        if (isJson) {
          return (await r.json()) as T;
        } else {
          const text = await r.text().catch(() => "");
          return (text ? JSON.parse(text) : ({} as any)) as T;
        }
      }
    } catch (e: any) {
      lastErr = e;
    }

    if (i === attempts) break;
    const sleep = Math.min(maxMs, Math.round(baseMs * 2 ** i * (0.75 + Math.random() * 0.5)));
    await new Promise((res) => setTimeout(res, sleep));
  }
  throw lastErr ?? new Error("fetch failed");
}
