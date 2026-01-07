// src/app/api/proxy/[[...path]]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { gunzipSync, brotliDecompressSync, inflateSync } from 'zlib';
import { cookies as nextCookies } from "next/headers";

// Ensure Node runtime so we can stream the request body
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function decodeJwtSub(token: string | null): string | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    const json = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    const sub = typeof json?.sub === "string" ? json.sub : null;
    return sub && sub.length > 10 ? sub : null;
  } catch {
    return null;
  }
}

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

async function getUserIdFromSupabaseCookies(
  _req: NextRequest,
  cookieList: Array<{ name: string; value: string }>
): Promise<string> {
  try {
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
    const anonKey = (
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      ""
    ).trim();
    if (!url || !anonKey) return "";

    const { createServerClient } = await import("@supabase/ssr");

    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          // IMPORTANT: use the cookie list captured once in the route handler
          return cookieList;
        },
        setAll(_cookies) {
          // Proxy must never mutate auth cookies
          // (No-op by design)
        },
      },
    });

    const { data } = await supabase.auth.getUser();
    return (data?.user?.id || "").trim();
  } catch {
    return "";
  }
}

async function getUserIdFromAuthorizationHeader(req: NextRequest): Promise<string> {
  try {
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
    const anonKey = (
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      ""
    ).trim();
    if (!url || !anonKey) return "";

    const auth = (req.headers.get("authorization") || "").trim();
    if (!auth.toLowerCase().startsWith("bearer ")) return "";
    const token = auth.slice(7).trim();
    if (!token) return "";

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error) return "";
    return (data?.user?.id || "").trim();
  } catch {
    return "";
  }
}

async function handle(req: NextRequest, context: any) {
  try {
    const base = getBackendBase();

    // Next.js App Router: treat params as async-safe and only read once
    const params = context?.params ? await Promise.resolve(context.params as any) : undefined;
    const pathParts = (params as any)?.path as string[] | undefined;

    // Next.js App Router: await cookies() once and reuse
    const cookieStore = await nextCookies();
    const cookieList = (cookieStore.getAll() || []).map((c) => ({ name: c.name, value: c.value }));

    const target = buildTargetUrl(base, pathParts, req);

    // Optional debug: /api/proxy/v1/health?debug=1
    if (req.nextUrl.searchParams.get("debug") === "1") {
      // Note: user id resolution happens after header cloning below
      return NextResponse.json({ ok: true, base, target });
    }

    // Clone headers; never forward hop-by-hop headers
    const headers = new Headers(req.headers);
    headers.delete("host");

    // ---- Resolve user id (priority)
    // 1) Explicit x-user-id header (curl/dev)
    // 2) Authorization: Bearer <jwt> (decode sub locally)
    // 3) Supabase cookie session (real browser)
    // 4) Dev fallback (explicit opt-in only)
    const headerUserId = (headers.get("x-user-id") || "").trim();
    const authHeader = (headers.get("authorization") || headers.get("Authorization") || "").trim();
    const bearerToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    const bearerUserId = decodeJwtSub(bearerToken) || "";

    const cookieUserId = (!headerUserId && !bearerUserId)
      ? await getUserIdFromSupabaseCookies(req, cookieList)
      : "";

    const devUid =
      (process.env.NEXT_PUBLIC_DEV_USER_ID || process.env.DEV_TEST_UID || "").trim();

    const allowDevFallback =
      process.env.NODE_ENV !== "production" &&
      ((process.env.PROXY_DEV_FALLBACK || "") === "1" ||
        (process.env.NEXT_PUBLIC_PROXY_DEV_FALLBACK || "") === "1");

    const resolvedUserId =
      headerUserId ||
      bearerUserId ||
      cookieUserId ||
      (allowDevFallback ? devUid : "");

    const usedDevUid =
      !headerUserId && !bearerUserId && !cookieUserId && allowDevFallback && !!devUid;

    const authSource = headerUserId
      ? "header"
      : bearerUserId
        ? "bearer"
        : cookieUserId
          ? "cookie"
          : usedDevUid
            ? "dev"
            : "";

    // Debug headers
    headers.set("x-proxy-auth-source", authSource);
    headers.set("x-proxy-user-id", resolvedUserId || "");
    headers.set("x-proxy-dev-uid", devUid || "");
    headers.set("x-proxy-bearer", bearerToken ? "1" : "");

    if (!resolvedUserId) {
      const res = NextResponse.json({ ok: false, error: "missing_user" }, { status: 401 });
      try { res.headers.set("x-proxy-auth-source", authSource); } catch { }
      try { res.headers.set("x-proxy-user-id", resolvedUserId || ""); } catch { }
      try { res.headers.set("x-proxy-dev-uid", devUid || ""); } catch { }
      try { res.headers.set("x-proxy-bearer", bearerToken ? "1" : ""); } catch { }
      try {
        const hasCookieHeader = !!req.headers.get("cookie");
        const hasNextCookies = cookieList.length > 0;
        res.headers.set("x-proxy-has-cookie", hasCookieHeader ? "1" : "");
        // keep header name for compatibility, but source is the single cookie list
        res.headers.set("x-proxy-has-req-cookies", hasNextCookies ? "1" : "");
        res.headers.set("x-proxy-has-next-cookies", hasNextCookies ? "1" : "");
      } catch { }
      try { res.headers.set("x-proxy-has-x-user-id", headerUserId ? "1" : ""); } catch { }
      try { res.headers.set("x-proxy-has-supabase-env", (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) && (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY) ? "1" : ""); } catch { }
      return res;
    }

    // Inject identity headers for API
    headers.set("x-user-id", resolvedUserId);
    headers.set("x-gravix-user-id", resolvedUserId);
    headers.set("x-forwarded-user-id", resolvedUserId);

    // Org id: prefer explicit header, then env fallbacks
    const devOrg =
      process.env.NEXT_PUBLIC_TEST_ORG_ID ||
      process.env.NEXT_PUBLIC_DEFAULT_ORG_ID ||
      process.env.DEFAULT_ORG_ID ||
      "";

    const existingOrgId = headers.get("x-org-id");
    const finalOrgId =
      existingOrgId && existingOrgId.trim().length > 0
        ? existingOrgId
        : devOrg;

    if (finalOrgId) {
      headers.set("x-org-id", finalOrgId);
    }

    // Ensure a request id for tracing
    try {
      if (!headers.get("x-request-id") && typeof crypto !== "undefined" && (crypto as any).randomUUID) {
        headers.set("x-request-id", (crypto as any).randomUUID());
      }
    } catch { }

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
    try {
      const hasCookieHeader = !!req.headers.get("cookie");
      const hasNextCookies = cookieList.length > 0;
      outHeaders.set("x-proxy-has-cookie", hasCookieHeader ? "1" : "");
      outHeaders.set("x-proxy-has-req-cookies", hasNextCookies ? "1" : "");
      outHeaders.set("x-proxy-has-next-cookies", hasNextCookies ? "1" : "");
    } catch { }

    // Add debug headers so we can verify what the proxy used at runtime
    try { outHeaders.set("x-proxy-api-base", base); } catch { }
    try { outHeaders.set("x-proxy-dev-uid", devUid); } catch { }
    try { outHeaders.set("x-proxy-user-id", resolvedUserId); } catch { }
    try { outHeaders.set("x-proxy-api-fallback", usedDevUid ? "1" : ""); } catch { }
    try { outHeaders.set("x-proxy-auth-source", authSource); } catch { }
    try { outHeaders.set("x-proxy-bearer", bearerToken ? "1" : ""); } catch { }

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
      try { bodyText = gunzipSync(Buffer.from(rawBuf)).toString('utf8'); } catch { }
      if (!/[\{\[]/.test(bodyText)) {
        try { bodyText = brotliDecompressSync(Buffer.from(rawBuf)).toString('utf8'); } catch { }
      }
      if (!/[\{\[]/.test(bodyText)) {
        try { bodyText = inflateSync(Buffer.from(rawBuf)).toString('utf8'); } catch { }
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
    try { outHeaders.set("x-proxy-api-base", base); } catch { }
    try { outHeaders.set("x-proxy-api-fallback", usedDevUid ? "1" : ""); } catch { }

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
