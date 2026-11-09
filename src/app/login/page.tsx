"use client";

import { supabase } from "@/lib/supabase-browser";
import { buildOAuthRedirectTo, safeNextPath, POST_LOGIN_KEY } from "@/lib/oauthRedirect";

export default function LoginPage() {
  async function login() {
    // The redirect is the origin of THIS page only (preview -> preview, production -> production, localhost only on localhost).
    const redirectTo = buildOAuthRedirectTo(window.location.origin);
    // Keep a validated same-site destination (?next=/path) for after the callback; it is never put in redirectTo itself.
    try {
      const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
      if (next) window.sessionStorage.setItem(POST_LOGIN_KEY, next);
      else window.sessionStorage.removeItem(POST_LOGIN_KEY);
    } catch { /* storage unavailable: fall back to the default destination */ }
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, queryParams: { prompt: "select_account" } },
    });
  }
  return (
    <div className="p-8">
      <h1 className="text-xl mb-4">Login</h1>
      <button
        onClick={login}
        className="px-4 py-2 rounded border border-white/30 hover:bg-white/10"
      >
        Continue with Google
      </button>
    </div>
  );
}
