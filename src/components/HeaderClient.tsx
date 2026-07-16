// src/components/HeaderClient.tsx
'use client';

import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';
import { useSession } from '@/lib/useSession';
import Link from 'next/link';

export default function HeaderClient() {
  const { session } = useSession();
  const pathname = usePathname();

  // Retained for future use; header now avoids intercepting clicks
  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("[logout] supabase signOut failed:", e);
    }

    // Clear cached app user id (if present)
    try {
      localStorage.removeItem("gravix_user_id");
    } catch {}

    // Clear Supabase auth keys so session cannot rehydrate
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.includes("auth-token") || k.startsWith("sb-")) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {}

    // Hard redirect to login to reset all client state
    window.location.href = "/login";
  };

  // The login page is a full-screen brand surface — a header whose only
  // action would be "Login" (a link to the page itself) adds nothing.
  if (pathname === '/login') return null;

  return (
    <header className="w-full border-b">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-semibold text-lg">Gravix Sales Trainer</Link>
        <nav className="flex items-center gap-3">
          {session ? (
            <>
              {/* ✅ Added Upload link */}
              <Link href="/upload" className="border rounded px-3 py-1 text-sm">
                Upload
              </Link>

              <span className="text-sm opacity-70">{session.user.email}</span>
              {/* Use button to trigger logout and fully clear Supabase state */}
              <button
                type="button"
                onClick={logout}
                className="border rounded px-3 py-1 text-sm"
                data-testid="nav-logout"
                title="Logout"
              >
                Logout
              </button>
            </>
          ) : (
            <Link href="/login" className="border rounded px-3 py-1 text-sm">
              Login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}