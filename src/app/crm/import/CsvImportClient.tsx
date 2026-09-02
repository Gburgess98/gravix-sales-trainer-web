"use client";

import { useMemo, useState } from "react";
import { proxyFetch } from "@/lib/api";

type Row = {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
};

type PreviewItem = { email: string; action: "insert" | "update" | "skip_other_user" };
type ImportResp =
  | {
      ok: true;
      dry_run: boolean;
      summary: { inserted: number; updated: number; skipped: number };
      preview?: PreviewItem[];
      errors: { email: string; error: string }[];
    }
  | { ok: false; error: string };

function parseCsv(text: string): string[][] {
  // Minimal CSV parser with quote support (enough for typical uploads).
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  const pushCell = () => {
    row.push(cur.trim());
    cur = "";
  };
  const pushRow = () => {
    // ignore fully empty lines
    const allEmpty = row.every((c) => !String(c ?? "").trim());
    if (!allEmpty) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      // escape quote inside quotes: ""
      const next = text[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (ch === "," || ch === "\t")) {
      pushCell();
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      // handle CRLF
      if (ch === "\r" && text[i + 1] === "\n") i++;
      pushCell();
      pushRow();
      continue;
    }

    cur += ch;
  }

  // flush
  pushCell();
  pushRow();

  return rows;
}

function normaliseHeader(h: string) {
  return h
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function toRows(table: string[][]): { rows: Row[]; errors: string[] } {
  const errors: string[] = [];
  if (!table.length) return { rows: [], errors: ["CSV is empty"] };

  const header = table[0].map(normaliseHeader);
  const idx = (k: string) => header.indexOf(k);

  const emailIdx = idx("email");
  const firstIdx = idx("first_name") !== -1 ? idx("first_name") : idx("firstname");
  const lastIdx = idx("last_name") !== -1 ? idx("last_name") : idx("lastname");
  const companyIdx = idx("company");

  if (emailIdx === -1) {
    errors.push('Missing required column: "email"');
    return { rows: [], errors };
  }

  const out: Row[] = [];
  for (let r = 1; r < table.length; r++) {
    const line = table[r];
    const email = String(line[emailIdx] ?? "").trim().toLowerCase();
    if (!email) continue;

    const row: Row = {
      email,
      first_name: firstIdx !== -1 ? (String(line[firstIdx] ?? "").trim() || null) : null,
      last_name: lastIdx !== -1 ? (String(line[lastIdx] ?? "").trim() || null) : null,
      company: companyIdx !== -1 ? (String(line[companyIdx] ?? "").trim() || null) : null,
    };

    // very light email validation (API will enforce)
    if (!email.includes("@") || !email.includes(".")) {
      errors.push(`Row ${r + 1}: invalid email "${email}"`);
      continue;
    }

    out.push(row);
  }

  if (!out.length) errors.push("No valid rows found (need at least one row with a valid email).");
  return { rows: out, errors };
}

export default function CsvImportClient() {
  const [raw, setRaw] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [dryRun, setDryRun] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [serverResp, setServerResp] = useState<ImportResp | null>(null);

  const parsed = useMemo(() => {
    if (!raw.trim()) return { rows: [] as Row[], errors: [] as string[] };
    const table = parseCsv(raw);
    return toRows(table);
  }, [raw]);

  const previewRows = parsed.rows.slice(0, 25);

  async function hitImport(isDryRun: boolean) {
    setBusy(true);
    setServerResp(null);
    try {
      const resp = await proxyFetch("/v1/crm/contacts/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dry_run: isDryRun, rows: parsed.rows }),
      });
      const json = (await resp.json()) as ImportResp;
      setServerResp(json);
    } catch (e: any) {
      setServerResp({ ok: false, error: e?.message ?? "request_failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium text-neutral-900">Upload CSV</div>
            <div className="mt-1 text-xs text-neutral-500">
              Required: <span className="font-medium">email</span>. Optional: first_name, last_name, company.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50">
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setFileName(f.name);
                  const text = await f.text();
                  setRaw(text);
                  setServerResp(null);
                }}
              />
              Choose file
            </label>

            <label className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-900">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
              />
              Dry-run (preview)
            </label>

            <button
              onClick={() => hitImport(dryRun)}
              disabled={busy || parsed.errors.length > 0 || parsed.rows.length === 0}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Working…" : dryRun ? "Run Preview" : "Import Now"}
            </button>
          </div>
        </div>

        <div className="mt-4 text-xs text-neutral-500">
          {fileName ? (
            <span>
              File: <span className="font-medium text-neutral-800">{fileName}</span>
            </span>
          ) : (
            <span>No file selected yet.</span>
          )}
        </div>
      </div>

      {/* Client-side validation */}
      {parsed.errors.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="text-sm font-semibold text-amber-900">Fix these before import</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {parsed.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Preview table */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-sm font-semibold text-neutral-900">Preview</div>
            <div className="mt-1 text-xs text-neutral-500">
              {parsed.rows.length} valid row(s). Showing first {previewRows.length}.
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-neutral-500">
              <tr className="[&>th]:pb-2 [&>th]:pr-4">
                <th>Email</th>
                <th>First</th>
                <th>Last</th>
                <th>Company</th>
              </tr>
            </thead>
            <tbody className="text-neutral-900">
              {previewRows.map((r, i) => (
                <tr key={`${r.email}-${i}`} className="border-t border-neutral-100">
                  <td className="py-2 pr-4 font-medium">{r.email}</td>
                  <td className="py-2 pr-4">{r.first_name ?? ""}</td>
                  <td className="py-2 pr-4">{r.last_name ?? ""}</td>
                  <td className="py-2 pr-4">{r.company ?? ""}</td>
                </tr>
              ))}
              {previewRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-sm text-neutral-500">
                    Upload a CSV to see preview.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Server response */}
      {serverResp && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-neutral-900">Result</div>

          {"ok" in serverResp && serverResp.ok ? (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-neutral-200 p-3">
                  <div className="text-xs text-neutral-500">Inserted</div>
                  <div className="text-lg font-semibold">{serverResp.summary.inserted}</div>
                </div>
                <div className="rounded-xl border border-neutral-200 p-3">
                  <div className="text-xs text-neutral-500">Updated</div>
                  <div className="text-lg font-semibold">{serverResp.summary.updated}</div>
                </div>
                <div className="rounded-xl border border-neutral-200 p-3">
                  <div className="text-xs text-neutral-500">Skipped</div>
                  <div className="text-lg font-semibold">{serverResp.summary.skipped}</div>
                </div>
              </div>

              {serverResp.dry_run && serverResp.preview?.length ? (
                <div className="rounded-xl border border-neutral-200 p-3">
                  <div className="text-xs font-semibold text-neutral-700">Dry-run preview</div>
                  <div className="mt-2 space-y-1 text-sm text-neutral-700">
                    {serverResp.preview.slice(0, 25).map((p, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="font-medium">{p.email}</span>
                        <span className="text-xs text-neutral-500">{p.action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {serverResp.errors?.length ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <div className="text-xs font-semibold text-rose-900">Errors</div>
                  <div className="mt-2 space-y-1 text-sm text-rose-900">
                    {serverResp.errors.slice(0, 25).map((e, i) => (
                      <div key={i} className="flex items-start justify-between gap-3">
                        <span className="font-medium">{e.email}</span>
                        <span className="text-xs">{e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-emerald-700">All good.</div>
              )}

              {/* Convenience: flip from dry-run to import */}
              {serverResp.dry_run && (
                <button
                  onClick={() => {
                    setDryRun(false);
                    hitImport(false);
                  }}
                  disabled={busy || parsed.errors.length > 0 || parsed.rows.length === 0}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Import these rows
                </button>
              )}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              {(serverResp as any).error ?? "unknown_error"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}