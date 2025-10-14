// src/app/api/proxy/[...path]/route.ts
import { NextRequest, NextResponse } from "next/server";

// Ensure Node runtime so we can stream the request body
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBackendBase(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_API_BASE?.trim() ||
    process.env.API_BASE?.trim() ||
    "";

  // Hard fallback so Production doesn’t break even if the env is missing
  const prodFallback = "https://api.gravixbots.com";

  const base =
    fromEnv || (process.env.NODE_ENV !== "production" ? "http://localhost:4000" : prodFallback);

  return base.replace(/\/$/, "");
}

function buildTargetUrl(base: string, path: string[] | undefined, req: NextRequest): string {
  const tail = Array.isArray(path) && path.length ? path.join("/") : "";
  const qs = req.nextUrl.searchParams.toString();
  return `${base}/${tail}${qs ? `?${qs}` : ""}`;
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

    // Normalize and inject dev user id when missing
// Inject a valid UUID for x-user-id so API never 400s during demos
const devUid =
  process.env.NEXT_PUBLIC_DEV_USER_ID ||
  process.env.DEV_TEST_UID ||
  "00000000-0000-4000-8000-000000000001"; // valid v4-shaped UUID fallback
let usedDevUid = false;
if (!headers.get("x-user-id")) {
  headers.set("x-user-id", devUid);
  usedDevUid = true;
}

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
return new NextResponse(buf, { status: res.status, headers: outHeaders });

    outHeaders.delete("connection");

    // Preserve set-cookie if API sets any (auth later)
    const setCookie = r.headers.get("set-cookie");
    if (setCookie) outHeaders.set("set-cookie", setCookie);

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
