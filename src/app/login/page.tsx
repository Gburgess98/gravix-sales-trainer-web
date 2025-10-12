"use client";

import { supabase } from "@/lib/supabase-browser";
import { getSiteUrl } from "@/lib/site";

export default function LoginPage() {
  async function login() {
    const redirectTo = `${getSiteUrl()}/auth/callback`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo }
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