"use client";

import { useEffect, useState } from "react";

type Check = {
  name: string;
  url: string;
  expect: "json_ok" | "json_list" | "http_ok";
};

const CHECKS: Check[] = [
  { name: "Proxy Health", url: "/api/proxy/v1/health", expect: "json_ok" },
  { name: "Calls (paged)", url: "/api/proxy/v1/calls/paged?limit=1", expect: "json_list" },
  { name: "Dashboard KPIs", url: "/api/proxy/v1/dashboard/kpis", expect: "json_ok" },
  { name: "Admin Status", url: "/api/proxy/v1/admin/status", expect: "json_ok" },
];

type Row = {
  name: string;
  ok: boolean;
  status: number | null;
  ms: number;
  detail: string;
};

export default function AdminStatus() {
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    const outs: Row[] = [];
    for (const c of CHECKS) {
      const t0 = performance.now();
      try {
        const r = await fetch(c.url, { cache: "no-store" });
        const ms = Math.round(performance.now() - t0);
        const text = await r.text();
        let body: any = null;
        try { body = JSON.parse(text); } catch {}
        let ok = r.ok;
        if (c.expect === "json_ok") ok = r.ok && body && (body.ok === true || body.ok === "true");
        if (c.expect === "json_list") ok = r.ok && body && (Array.isArray(body.items) || Array.isArray(body.calls));
        const base = r.headers.get("x-proxy-api-base") || "";
        const fb = r.headers.get("x-proxy-api-fallback") || "";
        const extra = [base ? `base=${base}` : "", fb ? `fallback=${fb}` : ""].filter(Boolean).join(" | ");
        outs.push({
          name: c.name,
          ok,
          status: r.status,
          ms,
          detail: (ok ? "" : (text.slice(0, 240) || "Unexpected")) + (extra ? (ok ? `(${extra})` : ` | ${extra}`) : ""),
        });
      } catch (e: any) {
        const ms = Math.round(performance.now() - t0);
        outs.push({ name: c.name, ok: false, status: null, ms, detail: e?.message || String(e) });
      }
    }
    setRows(outs);
    setRunning(false);
  }

  useEffect(() => { run(); }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">System Status</h1>
        <button onClick={run} disabled={running} className="px-3 py-1.5 rounded border">{running ? "Checking…" : "Re-run checks"}</button>
      </div>
      <div className="rounded-2xl border border-neutral-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-neutral-400">
            <tr>
              <th className="text-left p-3">Check</th>
              <th className="text-left p-3">Result</th>
              <th className="text-left p-3">HTTP</th>
              <th className="text-left p-3">Time</th>
              <th className="text-left p-3">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-neutral-800">
                <td className="p-3">{r.name}</td>
                <td className="p-3">{r.ok ? "✅" : "❌"}</td>
                <td className="p-3">{r.status ?? "—"}</td>
                <td className="p-3">{r.ms} ms</td>
                <td className="p-3 text-neutral-400">{r.detail}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={5} className="p-4 text-neutral-500">Running…</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-neutral-500">Tip: open network tab if something is failing to see raw responses.</div>
    </div>
  );
}