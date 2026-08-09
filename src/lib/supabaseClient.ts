"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Single source of truth for the browser Supabase client.
//
// Instantiating more than one GoTrueClient against the same storage key makes
// supabase-js log "Multiple GoTrueClient instances detected in the same browser
// context" and lets two auto-refreshers race on the same rotating refresh token
// (producing "Invalid Refresh Token" errors during navigation). Day 275 collapses
// the app onto this one instance; `supabase-browser.ts` re-exports it.
//
// The instance is memoised on globalThis so a single client survives HMR /
// duplicate module evaluation in dev. The default storage key is kept unchanged
// so existing (and production) sessions remain valid — do NOT set a custom
// storageKey here.
const globalForSupabase = globalThis as unknown as {
  __gravixSupabaseBrowser?: SupabaseClient;
};

export const supabaseBrowser: SupabaseClient =
  globalForSupabase.__gravixSupabaseBrowser ??
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );

if (typeof window !== "undefined") {
  globalForSupabase.__gravixSupabaseBrowser = supabaseBrowser;
}

export const supabase = supabaseBrowser;
