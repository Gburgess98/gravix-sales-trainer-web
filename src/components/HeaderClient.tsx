// src/components/HeaderClient.tsx
'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase-browser';
import { useSession } from '@/lib/useSession';
import Link from 'next/link';

export default function HeaderClient() {
  const { session } = useSession();

  // Optional: keep for debugging
  useEffect(() => {
    console.log('HeaderClient session →', session);
  }, [session]);

  // Retained for future use; header now avoids intercepting clicks
  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

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
              {/* Use plain navigation to avoid client-side click interception */}
              <Link
                href="/login?logout=1"
                className="border rounded px-3 py-1 text-sm"
                data-testid="nav-logout"
                title="Logout"
              >
                Logout
              </Link>
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