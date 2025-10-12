// web/src/lib/fetchJsonWithRetry.ts
export async function fetchJsonWithRetry<T = any>(
  input: RequestInfo | URL,
  init: RequestInit & { retry?: { attempts?: number; baseMs?: number; maxMs?: number } } = {}
): Promise<T> {
  const attempts = init.retry?.attempts ?? 4;
  const baseMs = init.retry?.baseMs ?? 300;
  const maxMs = init.retry?.maxMs ?? 2500;

  let lastErr: any;
  for (let i = 0; i <= attempts; i++) {
    try {
      const r = await fetch(input, init);
      // retryable statuses
      if (r.status === 429 || (r.status >= 500 && r.status <= 599)) {
        lastErr = new Error(`HTTP ${r.status}`);
        // fall through to backoff unless final attempt
      } else {
        const ct = r.headers.get("content-type") || "";
        const isJson = ct.includes("application/json") || ct.includes("+json");
        if (!isJson) {
          // try text and wrap as ok=false error
          const text = await r.text().catch(() => "");
          if (!r.ok) throw new Error(text || `HTTP ${r.status}`);
          return (text ? JSON.parse(text) : ({} as any)) as T;
        }
        const j = (await r.json().catch(() => ({}))) as any;
        if (!r.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${r.status}`);
        return j as T;
      }
    } catch (e: any) {
      lastErr = e;
      // network errors retry too
    }
    if (i === attempts) break;
    const sleep = Math.min(maxMs, Math.round((baseMs * 2 ** i) * (0.75 + Math.random() * 0.5)));
    await new Promise((res) => setTimeout(res, sleep));
  }
  throw lastErr ?? new Error("fetch failed");
}
