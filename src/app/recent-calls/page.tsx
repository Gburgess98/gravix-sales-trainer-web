'use client';

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Suspense } from 'react';
import { getCallsPage } from "@/lib/api";
import ScoreSparkline from "@/components/ScoreSparkline";
import CopyLinkButton from "@/components/CopyLinkButton";
import { fetchJsonWithRetry } from '@/lib/fetchJsonwithretry';
import { useRouter, useSearchParams, usePathname } from "next/navigation";


export const dynamic = "force-dynamic";

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

function useDebounced<T>(value: T, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function fmtDate(d: string) {
  try { return new Date(d).toLocaleString("en-GB", { timeZone: "Europe/London" }); }
  catch { return d; }
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
    n >= 80 ? "bg-green-500/20 text-green-200 border-green-400/30"
    : n >= 60 ? "bg-yellow-500/20 text-yellow-200 border-yellow-400/30"
    : "bg-red-500/20 text-red-200 border-red-400/30";
  return <span className={`px-2 py-0.5 rounded-full text-xs border ${color}`} title="Overall score">{isFinite(n) ? n : "—"}</span>;
}

function CardSparkline({ id }: { id: string }) {
  const [vals, setVals] = useState<number[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error" | "done">("idle");
  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetchJsonWithRetry(`/api/proxy/v1/calls/${id}/scores?n=12`)
      .then((r) => {
        if (cancelled) return;
        const arr = Array.isArray(r?.values) ? r.values as number[] : [];
        setVals(arr);
        setState("done");
      })
      .catch(() => {
        if (cancelled) return;
        setVals(null);
        setState("error");
      });
    return () => { cancelled = true; };
  }, [id]);

  if (state === "loading") return <div className="w-24 h-6 rounded bg-white/10 animate-pulse" />;
  if (state === "error") return <div className="text-xs text-red-300">trend unavailable</div>;
  if (!vals || vals.length < 2) return <div className="text-xs opacity-60">no scores yet</div>;
  return (
    <ScoreSparkline
      scores={vals}
      width={96}
      height={28}
      className="text-slate-300"
      title="Score trend (oldest → newest)"
    />
  );
}

function RecentCallsClient() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const weakSpot = searchParams.get('weakSpot');

  // status filter (persisted in URL ?status=all|scored|processed|queued)
  const paramStatus = (searchParams.get("status") || "all") as "all" | "scored" | "processed" | "queued";
  const [statusFilter, setStatusFilter] = useState<"all" | "scored" | "processed" | "queued">(paramStatus);

  const view = useMemo(() => {
    if (statusFilter === "all") return calls;
    return calls.filter(c => c.status === statusFilter);
  }, [calls, statusFilter]);

  // 🔎 search
  const [query, setQuery] = useState("");
  const debouncedQ = useDebounced(query, 300);

  // keep state in sync with URL changes (back/forward)
  useEffect(() => {
    const s = (searchParams.get("status") || "all") as "all" | "scored" | "processed" | "queued";
    setStatusFilter(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // infinite scroll
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const ioArmedRef = useRef(true);

  const pageSize = 10;
  const seenIds = useMemo(() => new Set(calls.map((c) => c.id)), [calls]);

  async function fetchPage(next?: string | null, reset = false) {
    if (loading) return;
    setLoading(true);
    setErr(null);
    try {
      const j = await getCallsPage(pageSize, next ?? undefined, debouncedQ || undefined);
      const items = (j?.items ?? []) as CallRow[];

      setCalls(prev => {
        const base = reset ? [] : prev;
        const seen = new Set(base.map((p) => p.id));
        const merged = [...base];
        for (const it of items) if (!seen.has(it.id)) merged.push(it);
        return merged;
      });

      const nextCur = j?.nextCursor || null;
      setCursor(nextCur);
      setHasMore(Boolean(nextCur));
    } catch (e: any) {
      setErr(e?.message || "Failed to load calls");
      setHasMore(false);
    } finally {
      setLoading(false);
      ioArmedRef.current = false;
      setTimeout(() => { ioArmedRef.current = true; }, 250);
    }
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      await fetchPage(cursor);
    } finally {
      setLoadingMore(false);
    }
  }

  // initial load
  useEffect(() => { fetchPage(null, true); /* eslint-disable-next-line */ }, []);

  // reload on search
  useEffect(() => {
    setCursor(null); setHasMore(true); setCalls([]);
    fetchPage(null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  // infinite scroll observer
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting) return;
      if (!hasMore || loading) return;
      if (!ioArmedRef.current) return;
      fetchPage(cursor);
    }, { root: null, rootMargin: "200px 0px", threshold: 0.01 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [cursor, hasMore, loading]);

  // Keyboard shortcuts: J (load more), K (scroll top), C (copy top call link)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName || "").toUpperCase();
      const isEditable = !!(target && (target as any).isContentEditable);
      if (tag === "INPUT" || tag === "TEXTAREA" || isEditable) return;

      const k = e.key.toLowerCase();
      if (k === "j") {
        if (cursor && !loadingMore) loadMore();
      } else if (k === "k") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (k === "c") {
        const first = (view && view[0]) || (calls && calls[0]);
        if (first && typeof window !== "undefined") {
          const href = `${window.location.origin}/calls/${first.id}?panel=coach`;
          navigator.clipboard?.writeText(href).catch(() => {});
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, loadingMore, view, calls]);

  function updateStatusInUrl(next: "all" | "scored" | "processed" | "queued") {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === "all") {
      sp.delete("status"); // keep URL clean
    } else {
      sp.set("status", next);
    }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    setStatusFilter(next);
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Recent Calls</h1>
        <div className="hidden md:flex items-center gap-2 text-xs opacity-70">
          <span className="px-2 py-0.5 rounded bg-green-600/20 text-green-400 border border-green-400/30">≥80</span>
          <span className="px-2 py-0.5 rounded bg-yellow-600/20 text-yellow-200 border border-yellow-400/30">60–79</span>
          <span className="px-2 py-0.5 rounded bg-red-600/20 text-red-300 border border-red-400/30">≤59</span>
        </div>

        {/* 🔎 Search */}
        <div className="ml-auto w-64">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search filename or ID…"
            className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/40"
            aria-label="Search recent calls"
          />
        </div>

        <Link href="/upload" className="underline">Upload another call</Link>
      </div>

      {/* Filters */}
      {weakSpot && (
        <div className="text-xs inline-flex items-center gap-2 px-2 py-1 rounded-lg border border-purple-400/30 bg-purple-500/10 text-purple-200">
          Weak spot focus: <span className="font-medium">{weakSpot}</span>
          <button
            onClick={() => router.replace(pathname + (searchParams.toString() ? `?${new URLSearchParams(Array.from(searchParams.entries()).filter(([k]) => k !== 'weakSpot')).toString()}` : ''), { scroll: false })}
            className="ml-2 underline"
          >
            Clear
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 text-sm">
        {(["all","scored","processed","queued"] as const).map(s => (
          <button
            key={s}
            onClick={() => updateStatusInUrl(s)}
            className={`px-2 py-1 rounded border transition ${
              statusFilter === s ? "bg-white text-black" : "opacity-80 hover:opacity-100"
            }`}
            aria-pressed={statusFilter === s ? "true" : "false"}
          >
            {s === "all" ? "All" : s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {err && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200 text-sm">
          Error loading calls: {err}
          <div className="mt-3">
            <button onClick={() => fetchPage(cursor)} className="px-3 py-1.5 rounded-lg border text-xs">Retry</button>
          </div>
        </div>
      )}

      {!err && calls.length === 0 && !loading && (
        <div className="rounded-2xl border p-6 text-sm opacity-80">
          No calls yet. Upload your first call!
        </div>
      )}

      {statusFilter !== "all" && !err && !loading && view.length === 0 && (
        <div className="rounded-2xl border p-6 text-sm opacity-80">
          No {statusFilter} calls match your search.
        </div>
      )}

      {/* Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {view.map((c) => {

          return (
            <div key={c.id} className="rounded-2xl border p-4 shadow-sm relative overflow-hidden">
              {/* Top row */}
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm opacity-70">{fmtDate(c.created_at)}</div>
                <div className="flex items-center gap-2">
                  <CopyLinkButton href={`/calls/${c.id}?panel=crm`} size="sm" />
                  <Link
                    href={`/calls/${c.id}`}
                    aria-label={`Open ${c.filename || c.id}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border hover:shadow hover:scale-[1.03] transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-white/40"
                    title="Open"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M8 5v14l11-7z" /></svg>
                  </Link>
                </div>
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
                  <span className="px-2 py-0.5 rounded-full text-xs border bg-zinc-500/10 text-zinc-300 border-zinc-400/20" title="Overall score">—</span>
                )}
                {c.status === "scored" && (
                  <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5" title={c.ai_model ? `Scored by ${c.ai_model}` : "AI scored"}>
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5"><path d="M5 12l2 2 4-5 4 6 4-8" /></svg>
                    AI
                  </span>
                )}
              </div>

              {/* Sparkline row */}
              <div className="mt-3 flex items-center justify-between">
                {c.storage_path ? (
                  <div className="text-sm break-all opacity-60 pr-3">{c.storage_path}</div>
                ) : <div className="text-sm opacity-50">—</div>}

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs opacity-70">Trend</span>
                  <CardSparkline id={c.id} />
                </div>
              </div>
            </div>
          );
        })}

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

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-10 w-full" />

      {hasMore && (
        <div className="flex">
          <button onClick={loadMore} disabled={loadingMore} className="ml-auto px-4 py-2 rounded-xl border" aria-busy={loadingMore ? "true" : "false"}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
// Server/CSR bailout requirement: wrap useSearchParams in a Suspense boundary
export default function RecentCallsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading…</div>}>
      <RecentCallsClient />
    </Suspense>
  );
}