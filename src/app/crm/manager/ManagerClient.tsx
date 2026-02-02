"use client";

import { useMemo, useState } from "react";

type OverviewRow = {
  rep_id: string;
  rep_name: string;
  counts: { open: number; overdue: number; completed_today: number };
  meta?: any;
};

export default function ManagerClient({ initial }: { initial: any }) {
  const [rows, setRows] = useState<OverviewRow[]>(initial?.items ?? []);
  const [mode] = useState<string>(initial?.mode ?? "unknown");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const totals = useMemo(() => {
    let open = 0, overdue = 0, done = 0;
    for (const r of rows) {
      open += Number(r?.counts?.open ?? 0);
      overdue += Number(r?.counts?.overdue ?? 0);
      done += Number(r?.counts?.completed_today ?? 0);
    }
    return { open, overdue, done };
  }, [rows]);

  async function refresh() {
    const r = await fetch("/api/proxy/v1/crm/manager/overview", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Failed to refresh");
    setRows(j.items ?? []);
  }

  async function runNow(dryRun = false) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/proxy/v1/crm/manager/runner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dry_run: dryRun, limit: 50 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Runner failed");

      // runner returns stats; show something readable
      const created = j?.summary?.created ?? j?.created ?? 0;
      const skipped = j?.summary?.skipped ?? j?.skipped ?? 0;
      setMsg(dryRun ? `Dry run OK (would create: ${created}, skipped: ${skipped})`
                    : `Run OK (created: ${created}, skipped: ${skipped})`);

      await refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Runner error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          disabled={busy}
          onClick={() => runNow(false)}
          className="px-3 py-2 rounded bg-white text-black text-sm font-medium disabled:opacity-60"
        >
          {busy ? "Running…" : "Run auto-assign now"}
        </button>

        <button
          disabled={busy}
          onClick={() => runNow(true)}
          className="px-3 py-2 rounded border border-neutral-700 text-sm disabled:opacity-60"
        >
          Dry run
        </button>

        <div className="text-xs text-neutral-400 ml-auto">
          mode: <span className="text-neutral-200">{mode}</span>
        </div>
      </div>

      <div className="flex gap-3 text-sm">
        <div className="px-3 py-2 rounded border border-neutral-800">
          Open: <span className="font-semibold">{totals.open}</span>
        </div>
        <div className="px-3 py-2 rounded border border-neutral-800">
          Overdue: <span className="font-semibold">{totals.overdue}</span>
        </div>
        <div className="px-3 py-2 rounded border border-neutral-800">
          Done today: <span className="font-semibold">{totals.done}</span>
        </div>
      </div>

      {msg && (
        <div className="text-sm text-neutral-200 border border-neutral-800 rounded p-3">
          {msg}
        </div>
      )}

      <div className="overflow-auto border border-neutral-800 rounded">
        <table className="min-w-[700px] w-full text-sm">
          <thead className="bg-neutral-900/40">
            <tr className="text-left">
              <th className="p-3">Rep</th>
              <th className="p-3">Open</th>
              <th className="p-3">Overdue</th>
              <th className="p-3">Completed Today</th>
              <th className="p-3">Rep ID</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rep_id} className="border-t border-neutral-800">
                <td className="p-3">{r.rep_name}</td>
                <td className="p-3">{r.counts.open}</td>
                <td className="p-3">{r.counts.overdue}</td>
                <td className="p-3">{r.counts.completed_today}</td>
                <td className="p-3 font-mono text-xs text-neutral-400">{r.rep_id}</td>
              </tr>
            ))}

            {!rows.length && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={5}>
                  No reps found (mode={mode})
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}