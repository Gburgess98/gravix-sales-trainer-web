// src/app/api/proxy/[[...path]]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { gunzipSync, brotliDecompressSync, inflateSync } from 'zlib';

// Ensure Node runtime so we can stream the request body
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBackendBase(): string {
  const target = (process.env.API_PROXY_TARGET || "").trim();
  if (target) return target.replace(/\/$/, "");
  // Fallbacks: local in dev, public API in prod
  return (process.env.NODE_ENV !== "production" ? "http://localhost:4000" : "https://api.gravixbots.com");
}

function buildTargetUrl(base: string, path: string[] | undefined, req: NextRequest): string {
  const pieces = Array.isArray(path) ? path : [];
  const suffix = pieces.length ? `/${pieces.join('/')}` : "/";
  const qs = req.nextUrl.searchParams.toString();
  return `${base.replace(/\/$/, '')}${suffix}${qs ? `?${qs}` : ''}`;
}

async function handle(req: NextRequest, context: any) {
  try {
    const base = getBackendBase();
    const target = buildTargetUrl(base, context?.params?.path as string[] | undefined, req);

    // Optional debug: /api/proxy/v1/health?debug=1
    if (req.nextUrl.searchParams.get("debug") === "1") {
      return NextResponse.json({ ok: true, base, target });
    }

    // Clone headers, ensure x-user-id for test flows; never forward hop-by-hop headers
    const headers = new Headers(req.headers);
    headers.delete("host");

    // Inject a valid UUID for x-user-id so API never 400s during demos
    const devUid =
      process.env.NEXT_PUBLIC_DEV_USER_ID ||
      process.env.DEV_TEST_UID ||
      "00000000-0000-4000-8000-000000000001"; // valid v4-shaped UUID fallback
    let usedDevUid = false;
    if (!headers.get("x-user-id")) {
      headers.set("x-user-id", devUid);
      // aliases for safety across proxies/CDNs
      headers.set("x-gravix-user-id", devUid);
      headers.set("x-forwarded-user-id", devUid);
      usedDevUid = true;
    }

    // Inject org id if missing (prefer explicit header, then env fallbacks)
    const devOrg = process.env.NEXT_PUBLIC_TEST_ORG_ID || process.env.DEFAULT_ORG_ID || "";
    if (devOrg && !headers.get("x-org-id")) {
      headers.set("x-org-id", devOrg);
    }

    // Ensure a request id for tracing
    try {
      if (!headers.get("x-request-id") && typeof crypto !== "undefined" && (crypto as any).randomUUID) {
        headers.set("x-request-id", (crypto as any).randomUUID());
      }
    } catch {}

    // Strip hop-by-hop / unsafe
    headers.delete("connection");
    headers.delete("content-length"); // important when we stream

    // Force plain text/JSON from origin (avoid gzipped bytes leaking through)
    headers.set("accept-encoding", "identity");

    // Stream body through for non-GET/HEAD to preserve multipart boundaries
    const body =
      req.method === "GET" || req.method === "HEAD" ? undefined : (req as any).body ?? req.body;

    // Build fetch init with a plain headers object to avoid weird header serialization
    const init: RequestInit = {
      method: req.method,
      headers: {
        ...Object.fromEntries(headers.entries()),
        // Force plain response from origin (no gzip/brotli)
        "accept-encoding": "identity",
        // Prefer JSON but allow text as fallback
        accept: headers.get("accept") || "application/json, text/plain;q=0.9, */*;q=0.8",
        // Friendly UA to help diagnose upstream behavior
        "user-agent": headers.get("user-agent") || "gravix-web-proxy",
      },
      body,
      cache: 'no-store',
      // @ts-ignore - Next.js request hints
      next: { revalidate: 0 },
      redirect: "manual",
      // Node.js streaming hint; prevents full buffering of multipart/form-data
      duplex: "half" as any,
    };

    const r = await fetch(target, init);

    // Pass backend response straight through so the frontend can read raw error text
    const outHeaders = new Headers(r.headers);

    // Add debug headers so we can verify what the proxy used at runtime
    try { outHeaders.set("x-proxy-api-base", base); } catch {}
    try { if (usedDevUid && devUid) outHeaders.set("x-proxy-dev-uid", devUid); } catch {}

    // Preserve set-cookie if API sets any (auth later)
    const setCookie = r.headers.get("set-cookie");
    if (setCookie) outHeaders.set("set-cookie", setCookie);

    // Read upstream body as raw bytes
    const rawBuf = await r.arrayBuffer();
    let bodyBytes = Buffer.from(rawBuf);

    // Respect Content-Encoding if provided
    const enc = (r.headers.get('content-encoding') || '').toLowerCase();
    try {
      if (enc.includes('gzip')) {
        bodyBytes = gunzipSync(bodyBytes);
      } else if (enc === 'br' || enc.includes('brotli')) {
        bodyBytes = brotliDecompressSync(bodyBytes);
      } else if (enc.includes('deflate')) {
        bodyBytes = inflateSync(bodyBytes);
      }
    } catch {
      // ignore and try heuristics below
    }

    let bodyText = '';
    try {
      bodyText = new TextDecoder('utf-8', { fatal: false }).decode(bodyBytes);
    } catch {
      bodyText = bodyBytes.toString('utf8');
    }

    // Heuristic: if it still looks binary and no JSON token found, attempt decompression guesses
    if (!/[\{\[]/.test(bodyText)) {
      try { bodyText = gunzipSync(Buffer.from(rawBuf)).toString('utf8'); } catch {}
      if (!/[\{\[]/.test(bodyText)) {
        try { bodyText = brotliDecompressSync(Buffer.from(rawBuf)).toString('utf8'); } catch {}
      }
      if (!/[\{\[]/.test(bodyText)) {
        try { bodyText = inflateSync(Buffer.from(rawBuf)).toString('utf8'); } catch {}
      }
    }

    // Strip BOM if present
    if (bodyText.charCodeAt(0) === 0xFEFF) {
      bodyText = bodyText.slice(1);
    }

    // If origin leaked stray bytes before JSON, cut to the first JSON token
    const firstJsonIdx = bodyText.search(/[\{\[]/);
    if (firstJsonIdx > 0) {
      bodyText = bodyText.slice(firstJsonIdx);
    }

    // Clone & sanitize headers (some already sanitized above)
    outHeaders.delete("content-encoding");
    outHeaders.delete("transfer-encoding");
    outHeaders.delete("content-length");

    // Ensure a sensible content-type
    if (!outHeaders.get("content-type")) {
      const t = bodyText.trim();
      const looksJson = t.startsWith("{") || t.startsWith("[");
      outHeaders.set(
        "content-type",
        looksJson ? "application/json; charset=utf-8" : "text/plain; charset=utf-8"
      );
    }

    // Helpful debug headers
    try { outHeaders.set("x-proxy-api-base", base); } catch {}
    try { outHeaders.set("x-proxy-api-fallback", ""); } catch {}

    // Final cleanup to strip any leftover binary prefix characters
    if (/^[^\x20-\x7E\r\n]+\{/.test(bodyText)) {
      const idx = bodyText.indexOf('{');
      if (idx > 0) bodyText = bodyText.slice(idx);
    }

    // If the body is valid JSON, normalize it by re-serializing
    try {
      const parsed = JSON.parse(bodyText);
      bodyText = JSON.stringify(parsed);
      // Ensure content-type is JSON
      outHeaders.set('content-type', 'application/json; charset=utf-8');
    } catch {
      // not JSON; leave as text
    }

    // Final trim of any stray non-printable characters
    bodyText = bodyText
      .replace(/^[^\x20-\x7E\r\n]+/, '')
      .replace(/[^\x20-\x7E\r\n]+$/, '');

    return new NextResponse(bodyText, {
      status: r.status,
      statusText: r.statusText,
      headers: outHeaders,
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
export const HEAD = handle;
