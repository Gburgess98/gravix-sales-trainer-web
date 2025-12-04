'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function LeaderboardPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/proxy/v1/dashboard/leaderboard?limit=10', { cache: 'no-store' });
        const j = await r.json();
        if (!j?.ok) throw new Error(j?.error || 'fetch_failed');
        setRows(j.items || []);
      } catch (e: any) {
        setErr(e?.message || 'load_failed');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <h1 className="text-xl font-semibold">Rep Leaderboard</h1>
      {loading && <div className="text-sm text-neutral-400">Loading…</div>}
      {err && <div className="text-sm text-red-400">{err}</div>}
      {!loading && !err && (
        <div className="rounded-lg border border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900/40">
              <tr>
                <th className="text-left px-3 py-2 w-12">#</th>
                <th className="text-left px-3 py-2">Rep</th>
                <th className="text-right px-3 py-2">Avg Score (30d)</th>
                <th className="text-right px-3 py-2">XP</th>
                <th className="text-right px-3 py-2">Completed Drills</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {rows.map((r, i) => (
                <tr key={r.user_id || i}>
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2">
                    <Link href={`/crm/reps/${encodeURIComponent(r.user_id)}`} className="underline">
                      {r.name || r.user_id}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right">{Math.round(r.avg_score ?? 0)}</td>
                  <td className="px-3 py-2 text-right">{r.xp ?? 0}</td>
                  <td className="px-3 py-2 text-right">{r.completed_drills ?? 0}</td>
                  <td className="px-3 py-2 text-right">
                    <Link className="underline" href={`/crm/overview?rep=${encodeURIComponent(r.user_id)}`}>View</Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-4 text-neutral-400">No data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}