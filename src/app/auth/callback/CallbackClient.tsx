"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";

export default function CallbackClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [msg, setMsg] = useState("Completing sign-in…");

  useEffect(() => {
    (async () => {
      try {
        const code = params.get("code");
        const errDesc = params.get("error_description") || params.get("error");
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
          // Fallback: allow hash tokens to be detected
          for (let i = 0; i < 10; i++) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) break;
            await new Promise((r) => setTimeout(r, 150));
          }
        }

        router.replace("/recent-calls");
      } catch (e: any) {
        setMsg(`Auth error: ${e?.message ?? "Unknown"}`);
      }
    })();
  }, [params, router]);

  return <p className="text-sm text-neutral-600">{msg}</p>;
}