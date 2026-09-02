'use client';

import { useEffect, useState } from 'react';
import { fetchJsonWithRetry } from '@/lib/fetchJsonwithretry';

type Kpis = {
  callsAnalyzed: number;
  winRate: number;   // 0-100 or 0-1; we’ll normalize
  avgScore: number;  // 0-100
  vps: number;       // Voice Personality Score
  aht: number;       // Avg Handle Time (seconds or minutes depending on API)
};

type Trends = {
  callsAnalyzed?: number[];
  winRate?: number[];   // percentages 0..100 (or 0..1 upstream; normalize if needed upstream)
  avgScore?: number[];  // 0..100
  vps?: number[];       // 0..100
  aht?: number[];       // seconds
};

export default function DashboardKpis({ onTrends }: { onTrends?: (t: Trends) => void }) {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ts, setTs] = useState(0); // trigger refetch

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetchJsonWithRetry<any>('/api/proxy/v1/dashboard/kpis', { cache: 'no-store' });
        if (cancel) return;
        if (!res?.ok || !res?.kpis) throw new Error('No KPI payload');
        setKpis(res.kpis);
        if (onTrends && res.kpis?.trends) {
          onTrends(res.kpis.trends as Trends);
        }
      } catch (e: any) {
        setErr(e?.message || 'Failed to load KPIs');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [ts]);

  const onRetry = () => setTs((x) => x + 1);

  function fmtPct(x: number) {
    // handle 0..1 or 0..100
    const v = x <= 1 ? x * 100 : x;
    return `${v.toFixed(1)}%`;
  }
  function fmtNum(x: number) {
    return new Intl.NumberFormat().format(Math.round(x));
  }
  function fmtMmSs(totalSec: number) {
    if (!Number.isFinite(totalSec)) return '—';
    const s = Math.max(0, Math.round(totalSec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(r).padStart(2, '0');
    return `${mm}:${ss}`;
  }
  function FadeNum({ children }: { children: React.ReactNode }) {
    // simple fade
    return <span className="inline-block animate-[fadeIn_300ms_ease]">{children}</span>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
      `}</style>

      {err && (
        <div className="col-span-full flex items-center justify-between gap-3 border border-red-900/50 bg-red-950/20 rounded p-3 text-red-300 text-sm">
          <span>Error: {err}</span>
          <button
            onClick={onRetry}
            className="px-3 py-1.5 rounded border border-red-800 hover:bg-red-900/30"
          >
            Retry
          </button>
        </div>
      )}

      <KpiCard label="Calls Analyzed" loading={loading} value={
        kpis ? <FadeNum>{fmtNum(kpis.callsAnalyzed)}</FadeNum> : '—'
      } />

      <KpiCard label="Win Rate" loading={loading} value={
        kpis ? <FadeNum>{fmtPct(kpis.winRate)}</FadeNum> : '—'
      } />

      <KpiCard label="Avg Score" loading={loading} value={
        kpis ? <FadeNum>{kpis.avgScore.toFixed(1)}</FadeNum> : '—'
      } />

      <KpiCard label="VPS" loading={loading} value={
        kpis ? <FadeNum>{kpis.vps.toFixed(1)}</FadeNum> : '—'
      } />

      <KpiCard label="AHT" loading={loading} value={
        kpis ? <FadeNum>{fmtMmSs(kpis.aht)}</FadeNum> : '—'
      } />
    </div>
  );
}

function KpiCard({ label, value, loading }: { label: string; value: React.ReactNode; loading: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
      <div className="text-xs opacity-60">{label}</div>
      <div className="mt-1 h-7 text-2xl font-semibold">
        {loading ? <Skeleton /> : value}
      </div>
      {/* keep your sparklines next to/under here if you already render them */}
    </div>
  );
}

function Skeleton() {
  return <div className="w-24 h-6 rounded bg-neutral-800 animate-pulse" />;
}