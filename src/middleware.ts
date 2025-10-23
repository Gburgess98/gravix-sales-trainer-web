import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Base proxy paths we want to normalize to /api/proxy/index.html
const PROXY_BASES = new Set(["/api/proxy", "/api/proxy/"]);

const PROTECTED = [/^\/recent-calls/, /^\/calls\//, /^\/crm/, /^\/admin/];

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const path = url.pathname;

  // Normalize base API proxy path so it never 404s on Vercel
  if (PROXY_BASES.has(path)) {
    url.pathname = "/api/proxy/index.html";
    return NextResponse.rewrite(url);
  }

  const needsAuth = PROTECTED.some((re) => re.test(path));

  if (!needsAuth) return NextResponse.next();

  const hasSession = req.cookies.get("sb-auth-token") || req.cookies.get("sb-access-token"); // supabase auth cookies
  if (!hasSession) {
    url.pathname = "/"; // or "/login"
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on all app pages except _next assets and favicon
    "/((?!_next|favicon.ico|api).*)",
    // Explicitly include the API proxy base paths so we can rewrite them
    "/api/proxy",
    "/api/proxy/",
  ],
};