'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { getCallsPage } from '@/lib/api';
import ScoreSparkline from '@/components/ScoreSparkline';
import CopyLinkButton from '@/components/CopyLinkButton';
import { fetchJsonWithRetry } from '@/lib/fetchJsonwithretry';

import { isOpenPath, guardDisabled } from '@/lib/openRoutes';

export const dynamic = 'force-dynamic';

type CallItem = {
  id: string;
  filename?: string | null;
  created_at?: string | null;
  status?: string | null;
  score_overall?: number | null;
  duration_sec?: number | null;
  storage_path?: string | null;
  ai_model?: string | null;
};

function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function fmtDate(d?: string) {
  try {
    return new Date(d || '').toLocaleString('en-GB', { timeZone: 'Europe/London' });
  } catch {
    return d;
  }
}

function StatusBadge({ status, scored }: { status?: string; scored?: number | null }) {
  const s = (status || '').toLowerCase();
  const hasScore = Number.isFinite(scored);
  let label = 'Pending';
  let cls = 'px-2 py-0.5 rounded-full text-xs border border-amber-800 text-amber-300 bg-amber-500/10';
  if (s === 'failed' || s === 'error') {
    label = 'Failed';
    cls = 'px-2 py-0.5 rounded-full text-xs border border-red-800 text-red-300 bg-red-500/10';
  } else if (s === 'scored' || hasScore) {
    label = 'Scored';
    cls = 'px-2 py-0.5 rounded-full text-xs border border-emerald-800 text-emerald-300 bg-emerald-500/10';
  } else if (['queued', 'processing', 'pending', 'processed'].includes(s)) {
    label = 'Pending';
  }
  return <span className={cls}>{label}</span>;
}

function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (!Number.isFinite(score)) return <span className="px-2 py-0.5 text-xs border rounded bg-zinc-500/10 text-zinc-300 border-zinc-400/20">—</span>;
  const n = Math.round(Number(score));
  const color =
    n >= 80 ? 'bg-green-500/20 text-green-200 border-green-400/30' :
    n >= 60 ? 'bg-yellow-500/20 text-yellow-200 border-yellow-400/30' :
    'bg-red-500/20 text-red-200 border-red-400/30';
  return <span className={`px-2 py-0.5 rounded-full text-xs border ${color}`}>{n}</span>;
}

function CardSparkline({ id }: { id: string }) {
  const [vals, setVals] = useState<number[] | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'done'>('idle');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetchJsonWithRetry(`/api/proxy/v1/calls/${id}/scores?n=12`)
      .then((r) => {
        if (cancelled) return;
        const arr = Array.isArray(r?.values) ? r.values as number[] : [];
        setVals(arr);
        setState('done');
      })
      .catch(() => {
        if (cancelled) return;
        setVals(null);
        setState('error');
      });
    return () => { cancelled = true; };
  }, [id]);

  if (state === 'loading') return <div className="w-24 h-6 rounded bg-white/10 animate-pulse" />;
  if (state === 'error') return <div className="text-xs text-red-300">trend unavailable</div>;
  if (!vals || vals.length < 2) return <div className="text-xs opacity-60">no scores yet</div>;
  return <ScoreSparkline scores={vals} width={96} height={28} className="text-slate-300" />;
}

type Filter = 'all' | 'scored' | 'pending' | 'failed';

function RecentCallsClient() {
  // Mark this route as "open" for auth guards (debug-only — does not change control flow)
  const __rcPathname = '/recent-calls';
  const __isOpenRC = guardDisabled() || isOpenPath(__rcPathname);
  useEffect(() => {
    try {
      console.debug('[Recent Calls] open-route check:', { path: __rcPathname, isOpen: __isOpenRC });
    } catch {}
  }, [__isOpenRC]);
  const [calls, setCalls] = useState<CallItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const debouncedQ = useDebounced(query);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  async function loadPage(reset = false) {
    setLoading(true);
    setErr(null);
    try {
      const j = await getCallsPage({ status, q: debouncedQ, cursor: reset ? null : cursor, limit: 12 });
      const items = j.items ?? j.calls ?? [];
      setCalls(reset ? items : [...calls, ...items]);
      setCursor(j.nextCursor ?? null);
      setHasMore(Boolean(j.nextCursor));
    } catch (e: any) {
      setErr(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadPage(true); /* eslint-disable-next-line */ }, [status, debouncedQ]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Recent Calls</h1>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search filename or ID…"
          className="ml-auto w-64 px-3 py-2 rounded bg-transparent border text-sm"
        />
      </div>

      <div className="flex items-center gap-2 text-sm">
        {(['all','scored','pending','failed'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setStatus(f)}
            className={`px-3 py-1 rounded border ${status===f ? 'bg-neutral-800' : 'opacity-80 hover:opacity-100'}`}
          >
            {f[0].toUpperCase()+f.slice(1)}
          </button>
        ))}
      </div>

      {err && <div className="text-red-400 text-sm">{err}</div>}
      {!err && !loading && calls.length === 0 && <div className="text-sm opacity-70">No calls found.</div>}

      <div className="grid gap-4 md:grid-cols-2">
        {calls.map(c => (
          <div key={c.id} className="rounded-xl border p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs opacity-60">{fmtDate(c.created_at)}</span>
              <div className="flex gap-2">
                <CopyLinkButton href={`/calls/${c.id}?panel=coach`} size="sm" />
                <Link href={`/calls/${c.id}`} className="text-xs underline">Open</Link>
              </div>
            </div>
            <div className="text-sm font-medium">{c.filename || c.id}</div>
            <div className="flex items-center gap-2 text-xs">
              <StatusBadge status={c.status} scored={c.score_overall} />
              <ScoreBadge score={c.score_overall} />
              {c.ai_model && <span className="opacity-60">AI: {c.ai_model}</span>}
            </div>
            <div className="flex justify-between items-center">
              <div className="text-xs opacity-60 truncate max-w-[60%]">{c.storage_path || '—'}</div>
              <CardSparkline id={c.id} />
            </div>
          </div>
        ))}
      </div>

      {hasMore && !loading && (
        <button onClick={() => loadPage()} className="block ml-auto px-3 py-1 rounded border text-sm">Load more</button>
      )}
      {loading && <div className="text-sm opacity-70">Loading…</div>}
    </div>
  );
}

export default function RecentCallsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading…</div>}>
      <RecentCallsClient />
    </Suspense>
  );
}