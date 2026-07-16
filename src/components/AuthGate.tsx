'use client';

import { PropsWithChildren, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/useSession';

// Middleware contract (middleware.ts → layout.tsx): routes stamped
// x-open-route=1 render with body[data-open-route="1"] and must never be
// auth-redirected. Honour that here so wrapping the whole shell in this
// gate (Day 228) cannot change the behaviour of the open routes.
function isOpenRoute(): boolean {
  if (typeof document === 'undefined') return false;
  return document.body?.dataset.openRoute === '1';
}

export default function AuthGate({ children }: PropsWithChildren) {
  const { session, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session && !isOpenRoute()) router.replace('/login');
  }, [loading, session, router]);

  if (loading) return null; // dark blank beats a shell full of fake empty data
  if (!session && isOpenRoute()) return <>{children}</>;
  if (!session) return null;

  return <>{children}</>;
}
