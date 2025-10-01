// src/app/recent-calls/page.tsx
import { supabaseServer } from "../(lib)/supabase-server";
import Link from "next/link";

function fmtDate(d: string) {
  return new Date(d).toLocaleString("en-GB", { timeZone: "Europe/London" });
}

export default async function RecentCallsPage() {
  const supa = supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();

  let calls: any[] = [];
  let mode: "auth" | "dev" = "auth";

  if (user) {
    // ✅ Real auth path (RLS protects this)
    const { data, error } = await supa
      .from("calls")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      return (
        <div className="p-8 text-red-600">
          Error loading calls: {error.message}
        </div>
      );
    }
    calls = data ?? [];
  } else {
    // 🧪 Dev fallback: use backend API with TEST UID (no RLS)
    mode = "dev";
    const apiBase = process.env.BACKEND_BASE || "http://localhost:4000";
    const testUid =
      process.env.NEXT_PUBLIC_TEST_UID ||
      "11111111-1111-1111-1111-111111111111";
    const res = await fetch(
      `${apiBase}/v1/calls?userId=${testUid}&limit=10`,
      {
        cache: "no-store",
      }
    );
    const json = await res.json();
    if (!json.ok) {
      return (
        <div className="p-8 text-red-600">
          Error loading calls: {json.error || "unknown"}
        </div>
      );
    }
    calls = json.calls ?? [];
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Recent Calls</h1>
          {mode === "dev" && (
            <span className="text-xs rounded-full border px-2 py-0.5">
              dev (test UID)
            </span>
          )}
        </div>
        <Link href="/upload" className="underline">
          Upload another call
        </Link>
      </div>

      {!calls.length && (
        <div className="rounded-xl border p-6">
          No calls yet. Upload your first call!
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {calls.map((c: any) => (
          <div
            key={c.id}
            className="rounded-2xl border p-4 shadow-sm relative overflow-hidden"
          >
            {/* Top row: date + Play icon */}
            <div className="flex items-start justify-between">
              <div className="text-sm text-gray-500">{fmtDate(c.created_at)}</div>

              {/* ▶️ Play button */}
              <Link
                href={`/calls/${c.id}`}
                aria-label={`Play ${c.filename}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border hover:shadow
                           hover:scale-[1.03] transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-white/40"
                title="Play"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </Link>
            </div>

            {/* Filename (also a link) */}
            <div className="text-lg font-medium mt-1">
              <Link href={`/calls/${c.id}`} className="underline">
                {c.filename}
              </Link>
            </div>

          {/* Meta row */}
<div className="mt-2 text-sm flex items-center gap-3 flex-wrap">
  <span className="inline-block rounded-full border px-2 py-0.5">
    {c.status}
  </span>

  {typeof c.duration_sec === "number" && (
    <span>{Math.round(c.duration_sec)}s</span>
  )}

  {typeof c.score_overall === "number" && (
    <span>Score: {Number(c.score_overall)}</span>
  )}

  {/* Show an AI badge when status === 'scored' */}
  {c.status === "scored" && (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
      title={c.ai_model ? `Scored by ${c.ai_model}` : "AI scored"}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
        <path d="M5 12l2 2 4-5 4 6 4-8" />
      </svg>
      AI
    </span>
  )}
</div>

            {/* Path */}
            <div className="mt-3 text-sm break-all text-gray-600">
              {c.storage_path}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}