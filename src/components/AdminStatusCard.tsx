// web/src/components/AdminStatusCard.tsx
'use client';

import { useEffect, useState } from 'react';

type Row = { name: string; ok: boolean; status?: number | null; ms?: number; detail?: string };

export default function AdminStatusCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const t0 = performance.now();
        const r = await fetch('/api/proxy/v1/admin/status', { cache: 'no-store' });
        const ms = Math.round(performance.now() - t0);
        const j = await r.json();
        const rows: Row[] = (j?.checks || []).map((c: any) => ({
          name: c.name,
          ok: !!c.ok,
          status: typeof c.detail === 'number' ? c.detail : r.status,
          ms,
          detail: typeof c.detail === 'string' ? c.detail : '',
        }));
        setRows(rows);
      } catch (e) {
        setRows([{ name: 'status', ok: false, detail: (e as any)?.message || 'error' }]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="rounded-xl border border-neutral-800 p-3">
      <div className="text-sm font-semibold mb-2">System checks</div>
      {loading ? (
        <div className="text-xs text-neutral-500">Checking…</div>
      ) : (
        <ul className="space-y-1">
          {rows.map((r, i) => (
            <li key={i} className="text-xs flex items-center gap-2">
              <span>{r.ok ? '✅' : '❌'}</span>
              <span className="text-neutral-300">{r.name}</span>
              {r.status != null && <span className="text-neutral-500">· {r.status}</span>}
              {r.ms != null && <span className="text-neutral-500">· {r.ms}ms</span>}
              {r.detail && <span className="text-neutral-500">· {r.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}