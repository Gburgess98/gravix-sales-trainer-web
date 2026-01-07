import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Server-side Supabase client bound to Next.js cookies.
 * Uses ANON key (never service role).
 */
export async function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !anon) return null as any;

  const cookieStore = await cookies();

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map((c) => ({ name: c.name, value: c.value }));
      },
      setAll(toSet) {
        for (const c of toSet) {
          cookieStore.set(c.name, c.value, c.options as any);
        }
      },
    },
  });
}

// Back-compat helpers
export async function createSupabaseServerClient() {
  return supabaseServer();
}
export async function getSupabaseServerClient() {
  return supabaseServer();
}