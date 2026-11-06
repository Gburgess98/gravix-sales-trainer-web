'use client';

// Production hotfix: the hardened /api/proxy only trusts a verified Supabase identity (Bearer token or cookie session) —
// it no longer injects a dev/test user. This UI predates that and calls the proxy with plain fetch(), so attach the signed-in
// user's access token to same-origin /api/proxy requests. The patch is installed at module load (before any page effect
// runs) and never touches other URLs, an existing Authorization header, or Request objects.

import { supabase } from '@/lib/supabase-browser';

let installed = false;
function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname + input.search : '';
      if (url.startsWith('/api/proxy/') || url === '/api/proxy') {
        const headers = new Headers(init?.headers);
        if (!headers.has('authorization')) {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (token) headers.set('authorization', `Bearer ${token}`);
        }
        return original(input, { ...init, headers });
      }
    } catch {
      /* fall through to the untouched request */
    }
    return original(input, init);
  };
}
install();

export default function ProxyAuthShim() {
  return null;
}
