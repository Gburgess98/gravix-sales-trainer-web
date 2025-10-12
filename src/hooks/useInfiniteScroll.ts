// src/app/recent-calls/page.tsx
'use client';

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCallsPage } from "@/lib/api";

export const dynamic = "force-dynamic";

// ---- Local types (match API rows) ----
type CallRow = {
  id: string;
  filename: string | null;
  storage_path?: string | null;
  status: "queued" | "processed" | "scored";
  created_at: string;
  duration_sec?: number | null;
  score_overall?: number | null;
  ai_model?: string | null;
};

function fmtDate(d: string) {
  try {
    return new Date(d).toLocaleString("en-GB", { timeZone: "Europe/London" });
  } catch {
    return d;
  }
}

function StatusBadge({ status }: { status: CallRow["status"] }) {
  const color =
    status === "scored"
      ? "bg-purple-500/20 text-purple-200 border-purple-400/30"
      : status === "processed"
      ? "bg-green-500/20 text-green-200 border-green-400/30"
      : "bg-yellow-500/20 text-yellow-200 border-yellow-400/30";
  return <span className={`px-2 py-0.5 rounded-full text-xs border ${color}`}>{status}</span>;
}

function ScoreBadge({ score }: { score: number }) {
  const n = Math.round(Number(score));
  const color =
    n >= 80
      ? "bg-green-500/20 text-green-200 border-green-400/30"
      : n >= 60
      ? "bg-yellow-500/20 text-yellow-200 border-yellow-400/30"
      : "bg-red-500/20 text-red-200 border-red-400/30";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border ${color}`} title="Overall score">
      {n}
    </span>
  );
}

/** Tiny inline hook for infinite scroll (avoids creating another file right now) */
function useInfiniteScroll<T extends HTMLElement>({
  onIntersect,
  disabled = false,
  rootMargin = "600px",
  threshold = 0,
}: {
  onIntersect: () => void;
  disabled?: boolean;
  rootMargin?: string;
  threshold?: number;
}) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;

    let firing = false;
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e?.isIntersecting || firing) return;
        firing = true;
        // fire once per intersection and re-allow next frame
        queueMicrotask(() => {
          onIntersect();
          requestAnimationFrame(() => (firing = false));
        });
      },
      { root: null, rootMargin, threshold }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [onIntersect, disabled, rootMargin, threshold]);

  return ref;
}

export default function RecentCallsPage() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchPage = useCallback(async (next?: string | null) => {
    if (loading) return;
    try {
      setLoading(true);
      setErr(null);
      // keep your existing signature: (limit, cursor?)
      const j = await getCallsPage(10, next ?? undefined);
      const items = (j.items ?? []) as CallRow[];
      setCalls((prev) => [...prev, ...items]);
      const nxt = j.nextCursor || null;
      setCursor(nxt);
      setHasMore(Boolean(nxt) && items.length > 0);
    } catch (e: any) {
      setErr(e?.message || "Failed to load calls");
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // initial load
  useEffect(() => {
    fetchPage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sentinel triggers next page when visible
  const sentinelRef = useInfiniteScroll<HTMLDivElement>({
    onIntersect: () => {
      if (!loading && hasMore) fetchPage(cursor);
    },
    disabled: loading || !hasMore,   // don't observe while loading or when done
    rootMargin: "600px",             // prefetch sooner as user nears bottom
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Recent Calls</h1>
        <div className="hidden md:flex items-center gap-2 text-xs opacity-70">
          <span className="px-2 py-0.5 rounded bg-green-600/20 text-green-400 border border-green-400/30">≥80</span>
          <span className="px-2 py-0.5 rounded bg-yellow-600/20 text-yellow-200 border border-yellow-400/30">60–79</span>
          <span className="px-2 py-0.5 rounded bg-red-600/20 text-red-300 border border-red-400/30">≤59</span>
        </div>
        <Link href="/upload" className="underline ml-auto">Upload another call</Link>
      </div>

      {err && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200 text-sm">
          Error loading calls: {err}
          <div className="mt-3">
            <button
              onClick={() => fetchPage(cursor)}
              className="px-3 py-1.5 rounded-lg border text-xs"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {!err && calls.length === 0 && !loading && (
        <div className="rounded-2xl border p-6 text-sm opacity-80">
          No calls yet. Upload your first call!
        </div>
      )}

      {/* Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {calls.map((c) => (
          <div key={c.id} className="rounded-2xl border p-4 shadow-sm relative overflow-hidden">
            {/* Top row */}
            <div className="flex items-start justify-between">
              <div className="text-sm opacity-70">{fmtDate(c.created_at)}</div>
              <Link
                href={`/calls/${c.id}`}
                aria-label={`Open ${c.filename || c.id}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border hover:shadow
                           hover:scale-[1.03] transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-white/40"
                title="Open"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </Link>
            </div>

            {/* Filename */}
            <div className="text-lg font-medium mt-1">
              <Link href={`/calls/${c.id}`} className="underline">
                {c.filename || c.id}
              </Link>
            </div>

            {/* Meta row */}
            <div className="mt-2 text-sm flex items-center gap-3 flex-wrap">
              <StatusBadge status={c.status} />
              {typeof c.duration_sec === "number" && <span>{Math.round(c.duration_sec)}s</span>}

              {typeof c.score_overall === "number" ? (
                <ScoreBadge score={c.score_overall} />
              ) : (
                <span
                  className="px-2 py-0.5 rounded-full text-xs border bg-zinc-500/10 text-zinc-300 border-zinc-400/20"
                  title="Overall score"
                >
                  —
                </span>
              )}

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

            {/* Storage path */}
            {c.storage_path ? (
              <div className="mt-3 text-sm break-all opacity-60">{c.storage_path}</div>
            ) : null}
          </div>
        ))}

        {/* Skeletons while loading first page */}
        {calls.length === 0 && loading && (
          <>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-2xl border p-4 animate-pulse">
                <div className="h-3 w-24 bg-white/10 rounded" />
                <div className="h-5 w-48 bg-white/10 rounded mt-3" />
                <div className="flex gap-2 mt-3">
                  <div className="h-5 w-16 bg-white/10 rounded" />
                  <div className="h-5 w-10 bg-white/10 rounded" />
                  <div className="h-5 w-10 bg-white/10 rounded" />
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Infinite scroll sentinel (auto-loads when visible) */}
      <div ref={sentinelRef} className="h-10" />

      {/* Fallback button (optional) */}
      {hasMore && (
        <div className="flex">
          <button
            onClick={() => fetchPage(cursor)}
            disabled={loading}
            className="ml-auto px-4 py-2 rounded-xl border"
            aria-busy={loading ? "true" : "false"}
          >
            {loading ? "Loading..." : "Load more"}
          </button>
        </div>
      )}

      {/* Status line */}
      <div className="text-xs text-neutral-400">
        {hasMore ? (loading ? "Loading more…" : "Scroll to load more…") : "All caught up."}
      </div>
    </div>
  );
}