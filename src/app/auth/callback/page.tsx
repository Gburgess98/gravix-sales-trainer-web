'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-browser';

export default function AuthCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const [msg, setMsg] = useState('Completing sign-in…');

  useEffect(() => {
    (async () => {
      try {
        // 1) If Supabase sent a "code", exchange it for a session (PKCE-style)
        const code = params.get('code');
        const errDesc = params.get('error_description') || params.get('error');
        if (errDesc) {
          setMsg(`Sign-in error: ${errDesc}`);
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setMsg(`Auth exchange failed: ${error.message}`);
            return;
          }
        } else {
          // 2) Fallback: if tokens came via URL hash, supabase-js will parse them
          //    (detectSessionInUrl: true). Give it a moment and verify we have a session.
          for (let i = 0; i < 10; i++) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) break;
            await new Promise(r => setTimeout(r, 150));
          }
        }

        // 3) Done — go home
        router.replace('/');
      } catch (e: any) {
        setMsg(`Auth error: ${e.message ?? 'Unknown'}`);
      }
    })();
  }, [params, router]);

  return <p className="p-6">{msg}</p>;
}
