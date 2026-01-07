"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { supabase } from "@/lib/supabase-browser";

// Minimal local replacement for getSiteUrl (avoids missing '@/lib/site')
function getSiteUrl() {
  const env = process.env.NEXT_PUBLIC_WEB_BASE || process.env.NEXT_PUBLIC_WEB_ORIGIN;
  if (env) return env.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3000"; // fallback for SSR/build
}

export default function LoginPage() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("logout") === "1") {
      // Best-effort cleanup in case user hits /login?logout=1 directly
      (async () => {
        try {
          await supabase.auth.signOut();
        } catch {}

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
      })();
    }
  }, [searchParams]);
  async function login() {
    const redirectTo = `${getSiteUrl()}/auth/callback`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          prompt: "select_account"
        }
      }
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