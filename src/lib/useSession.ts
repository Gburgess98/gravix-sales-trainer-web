'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase-browser';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      if (typeof window !== 'undefined' && data.session?.user?.id) {
        window.localStorage.setItem('gravix_user_id', data.session.user.id);
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ?? null);
      if (typeof window !== 'undefined' && s?.user?.id) {
        window.localStorage.setItem('gravix_user_id', s.user.id);
      }
    });

    return () => { sub.subscription.unsubscribe(); };
  }, []);

  return { session, loading };
}
