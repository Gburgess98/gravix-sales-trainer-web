'use client';

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getCallsPage, getScoreHistory, type ScoreHistoryItem } from "@/lib/api";
import useDebouncedSearch from "@/lib/useDebouncedSearch";
import ScoreSparkline from "@/components/ScoreSparkline";
import CopyLinkButton from "@/components/CopyLinkButton";

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

type ScoresState = Record<string, ScoreHistoryItem[] | "loading" | "error" | undefined>;

export default function RecentCallsPage() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 🔎 search
  const [query, setQuery] = useState("");
  const debouncedQ = useDebouncedSearch(query, 300);

  // sparkline cache
  const [scoresMap, setScoresMap] = useState<ScoresState>({});
  const scoresCacheRef = useRef<ScoresState>({});

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

  // initial load
  useEffect(() => { fetchPage(null, true); /* eslint-disable-next-line */ }, []);

  // reload on search
  useEffect(() => {
    setCursor(null); setHasMore(true); setCalls([]);
    setScoresMap({}); scoresCacheRef.current = {};
    fetchPage(null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  // fetch sparkline histories lazily
  useEffect(() => {
    if (!calls.length) return;
    const controllers: AbortController[] = [];

    calls.forEach((c) => {
      if (scoresCacheRef.current[c.id] || scoresMap[c.id]) return;
      setScoresMap((m) => ({ ...m, [c.id]: "loading" }));
      const ac = new AbortController();
      controllers.push(ac);

      getScoreHistory(c.id, 24)
        .then((items) => {
          const sorted = items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          scoresCacheRef.current[c.id] = sorted;
          setScoresMap((m) => ({ ...m, [c.id]: sorted }));
        })
        .catch(() => {
          scoresCacheRef.current[c.id] = "error";
          setScoresMap((m) => ({ ...m, [c.id]: "error" }));
        });
    });

    return () => { controllers.forEach((ac) => ac.abort()); };
  }, [calls, scoresMap]);

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

      {/* Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {calls.map((c) => {
          const scores = scoresMap[c.id];
          const isLoadingScores = scores === "loading";
          const isErrorScores = scores === "error";
          const items = Array.isArray(scores) ? scores : [];

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
                  {isLoadingScores && <div className="w-24 h-6 rounded bg-white/10 animate-pulse" />}
                  {isErrorScores && <div className="text-xs text-red-300">trend unavailable</div>}
                  {Array.isArray(scores) && items.length === 0 && <div className="text-xs opacity-60">no scores yet</div>}
                  {Array.isArray(scores) && items.length > 0 && (
                    <ScoreSparkline
                      scores={items.map((s) => s.score)}
                      width={96}
                      height={28}
                      className="text-slate-300"
                      title="Score trend (oldest → newest)"
                    />
                  )}
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
          <button onClick={() => fetchPage(cursor)} disabled={loading} className="ml-auto px-4 py-2 rounded-xl border" aria-busy={loading ? "true" : "false"}>
            {loading ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}