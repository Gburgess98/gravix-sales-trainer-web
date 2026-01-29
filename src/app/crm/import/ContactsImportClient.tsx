"use client";

import { useMemo, useState } from "react";

type Row = { first_name?: string; last_name?: string; email?: string; company?: string };

function parseCsv(text: string): Row[] {
  // Minimal CSV parser (handles commas, trims; assumes no quoted commas for v1)
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const out: Row[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((c) => c.trim());
    const obj: any = {};
    headers.forEach((h, i) => (obj[h] = cols[i] || ""));
    out.push({
      first_name: obj.first_name || obj.firstname || "",
      last_name: obj.last_name || obj.lastname || "",
      email: obj.email || "",
      company: obj.company || obj.account || "",
    });
  }
  return out;
}

export default function ContactsImportClient() {
  const [raw, setRaw] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [actioning, setActioning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const valid = useMemo(() => rows.filter((r) => (r.email || "").includes("@")), [rows]);

  async function onFile(file: File) {
    setMsg(null);
    const text = await file.text();
    setRaw(text);
    setRows(parseCsv(text));
  }

  async function importNow() {
    setMsg(null);
    setActioning(true);
    try {
      const res = await fetch("/api/proxy/v1/crm/contacts/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: valid }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setMsg(`Imported ${json.imported} contacts ✅`);
    } catch (e: any) {
      setMsg(`Import failed: ${e?.message || "unknown_error"}`);
    } finally {
      setActioning(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-5">
      <div className="text-sm font-semibold text-neutral-100">CSV Upload</div>
      <div className="mt-1 text-xs text-neutral-400">
        Required column: <span className="text-neutral-200">email</span>. Optional: first_name, last_name, company.
      </div>

      <input
        type="file"
        accept=".csv,text/csv"
        className="mt-4 block w-full text-sm text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-neutral-200 hover:file:bg-neutral-800"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />

      {rows.length ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-xs text-neutral-400">
            Parsed: <span className="text-neutral-200">{rows.length}</span> rows • Valid emails:{" "}
            <span className="text-neutral-200">{valid.length}</span>
          </div>
          <button
            type="button"
            disabled={!valid.length || actioning}
            onClick={importNow}
            className="inline-flex h-9 items-center rounded-lg bg-white px-3 text-xs font-semibold text-black hover:bg-neutral-200 active:scale-[0.98] disabled:opacity-50"
          >
            {actioning ? "Importing…" : "Import"}
          </button>
        </div>
      ) : null}

      {msg ? <div className="mt-4 text-sm text-neutral-200">{msg}</div> : null}

      {valid.length ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-950">
              <tr className="text-xs text-neutral-400">
                <th className="px-3 py-2">First</th>
                <th className="px-3 py-2">Last</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Company</th>
              </tr>
            </thead>
            <tbody className="bg-neutral-950/60">
              {valid.slice(0, 10).map((r, i) => (
                <tr key={i} className="border-t border-neutral-900">
                  <td className="px-3 py-2 text-neutral-200">{r.first_name}</td>
                  <td className="px-3 py-2 text-neutral-200">{r.last_name}</td>
                  <td className="px-3 py-2 text-neutral-200">{r.email}</td>
                  <td className="px-3 py-2 text-neutral-200">{r.company}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {valid.length > 10 ? <div className="px-3 py-2 text-xs text-neutral-500">Showing first 10</div> : null}
        </div>
      ) : null}

      {/* debug */}
      {raw ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-neutral-500">Raw CSV</summary>
          <pre className="mt-2 max-h-56 overflow-auto rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300">
            {raw}
          </pre>
        </details>
      ) : null}
    </div>
  );
}