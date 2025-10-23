'use client';

import { useEffect, useState } from 'react';

export default function CRMOverview() {
  const [kpis, setKpis] = useState<any>(null);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/proxy/v1/dashboard/kpis', { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok || !j?.ok) throw new Error(j?.error || 'Failed to load KPIs');
        setKpis(j.kpis);
      } catch (e: any) {
        setErr(e?.message || 'Failed to load');
      }
    })();
  }, []);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">CRM Overview</h1>
      {err && (
        <div className="text-sm text-red-400 border border-red-500/30 bg-red-500/10 rounded p-2">{err}</div>
      )}
      {!kpis ? (
        <div className="text-sm text-neutral-500">Loading…</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-xl border border-neutral-800 p-3">
            <div className="text-xs text-neutral-400">Calls analyzed</div>
            <div className="text-2xl font-semibold">{kpis.callsAnalyzed}</div>
          </div>
          <div className="rounded-xl border border-neutral-800 p-3">
            <div className="text-xs text-neutral-400">Win rate</div>
            <div className="text-2xl font-semibold">{kpis.winRate}%</div>
          </div>
          <div className="rounded-xl border border-neutral-800 p-3">
            <div className="text-xs text-neutral-400">Avg Score</div>
            <div className="text-2xl font-semibold">{kpis.avgScore}</div>
          </div>
          <div className="rounded-xl border border-neutral-800 p-3">
            <div className="text-xs text-neutral-400">VPS</div>
            <div className="text-2xl font-semibold">{kpis.vps}</div>
          </div>
          <div className="rounded-xl border border-neutral-800 p-3">
            <div className="text-xs text-neutral-400">AHT</div>
            <div className="text-2xl font-semibold">{kpis.aht}s</div>
          </div>
        </div>
      )}
    </div>
  );
}