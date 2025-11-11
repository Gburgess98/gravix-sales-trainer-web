// middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const MW_VERSION = "2025-11-11T23:15Z"; // bump when you change middleware

const IGNORE_PREFIXES = ["/_next", "/favicon", "/api", "/assets", "/fonts", "/images"];
const PUBLIC_PATHS = new Set<string>([
  "/",        // homepage (handles ?redirect= server-side)
  "/login",
  "/healthz",
]);

function isIgnoredPath(pathname: string) {
  return IGNORE_PREFIXES.some((p) => pathname.startsWith(p));
}

function hasBypass(req: NextRequest) {
  // Header-based bypass for curl/Vercel
  const bypass = req.headers.get("x-bypass-auth") || req.headers.get("x-gravix-bypass");
  const vercelBypass = req.headers.get("x-vercel-protection-bypass");
  if (bypass || vercelBypass) return true;

  // Query param bypass for quick manual tests: ?__bypass=1
  const qp = req.nextUrl.searchParams.get("__bypass");
  if (qp === "1" || qp === "true") return true;

  return false;
}

function isAuthed(req: NextRequest) {
  // Supabase cookie example; tweak to your setup
  const sb = req.cookies.get("sb-access-token") || req.cookies.get("sb-refresh-token");
  if (sb) return true;
  // Optional header-based auth
  if (req.headers.get("authorization")) return true;

  return false;
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const { pathname, search } = url;

  // Base response to attach our version header
  const pass = NextResponse.next();
  pass.headers.set("x-gravix-mw", MW_VERSION);

  // 1) Ignore internal assets entirely
  if (isIgnoredPath(pathname)) return pass;

  // 2) Allow public routes
  if (PUBLIC_PATHS.has(pathname)) return pass;

  // 3) Allow explicit bypass (headers or ?__bypass=1)
  if (hasBypass(req)) return pass;

  // 4) If unauthenticated, redirect once to "/?redirect=..."
  if (!isAuthed(req)) {
    const to = pathname + (search || "");
    const dest = url.clone();
    dest.pathname = "/";
    dest.search = `?redirect=${encodeURIComponent(to)}`;
    const res = NextResponse.redirect(dest);
    res.headers.set("x-gravix-mw", MW_VERSION);
    return res;
  }

  // 5) Otherwise allow through
  return pass;
}

export const config = {
  matcher: ["/((?!_next|favicon|api).*)"],
};