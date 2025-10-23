// src/app/api/proxy/[[...path]]/route.ts
import { NextRequest, NextResponse } from "next/server";

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

async function handle(req: NextRequest, ctx: { params: { path?: string[] } }) {
  try {
    const base = getBackendBase();
    const target = buildTargetUrl(base, ctx.params?.path, req);

    // Optional debug: /api/proxy/v1/health?debug=1
    if (req.nextUrl.searchParams.get("debug") === "1") {
      return NextResponse.json({ ok: true, base, target });
    }

    // Clone headers, ensure x-user-id for test flows; never forward hop-by-hop headers
    const headers = new Headers(req.headers);
    headers.delete("host");

    // Normalize and inject dev user id when missing
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

    // Stream body through for non-GET/HEAD to preserve multipart boundaries
    const body =
      req.method === "GET" || req.method === "HEAD" ? undefined : (req as any).body ?? req.body;

    const init: RequestInit = {
      method: req.method,
      headers,
      body,
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

    // Clean hop-by-hop header
    outHeaders.delete("connection");

    // Avoid content decoding mismatch: Node may auto-decompress but preserve encoding header.
    outHeaders.delete("content-encoding");
    outHeaders.delete("transfer-encoding");
    outHeaders.delete("content-length");
    if (!outHeaders.get("content-type")) {
      outHeaders.set("content-type", "text/plain; charset=utf-8");
    }

    // Preserve set-cookie if API sets any (auth later)
    const setCookie = r.headers.get("set-cookie");
    if (setCookie) outHeaders.set("set-cookie", setCookie);

    // Stream the response body directly
    return new NextResponse(r.body, {
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
// HEAD is implicitly handled via GET in most cases; add if you need symmetry:
// export const HEAD = handle;
