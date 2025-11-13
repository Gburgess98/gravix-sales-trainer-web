import { redirect } from "next/navigation";
import HomeLanding from "@/components/HomeLanding";

// IMPORTANT: homepage must handle ?redirect= server-side to avoid loops.
// We also enforce a "safe path" check to prevent open redirects (and avoid /api & /_next).

function isSafePath(path: string) {
  if (!path) return false;
  // Decode once if it looks encoded
  try {
    if (/%2F|%3F|%3D/i.test(path)) path = decodeURIComponent(path);
  } catch {
    // if decode fails, treat as unsafe
    return false;
  }

  // Must start with single "/" and not be the root
  if (!path.startsWith("/") || path === "/") return false;

  // Block internal non-page paths
  if (path.startsWith("/api") || path.startsWith("/_next") || path.startsWith("/favicon")) return false;

  // Block obvious file downloads
  if (/\.[a-zA-Z0-9]+(\?|$)/.test(path)) return false;

  // No protocol or double slashes
  if (path.includes("://") || path.includes("//")) return false;

  return true;
}

export default function Home(props: { searchParams?: Record<string, string | string[]> }) {
  const sp = props?.searchParams || {};
  const raw = Array.isArray(sp.redirect) ? sp.redirect[0] : sp.redirect;

  if (raw && isSafePath(raw)) {
    // Server-side, instant, non-flaky redirect
    redirect(decodeURIComponent(raw));
  }

  return <HomeLanding />;
}