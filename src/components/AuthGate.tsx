'use client';

import { PropsWithChildren, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/useSession';

export default function AuthGate({ children }: PropsWithChildren) {
  const { session, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  if (loading) return null; // or a spinner
  if (!session) return null;

  return <>{children}</>;
}
