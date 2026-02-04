"use client";

import { useEffect, useMemo, useState } from "react";

// ------------------------------
// Status-aware API error helpers (local)
// ------------------------------

type ApiErrorKind = "auth" | "permission" | "validation" | "server" | "network" | "unknown";

type ApiErr = {
  status: number;
  kind: ApiErrorKind;
  title: string;
  hint: string;
  error: string;
};

function classifyApiError(status: number): { kind: ApiErrorKind; title: string; hint: string } {
  if (status === 401) return { kind: "auth", title: "Auth required", hint: "Missing/expired auth or headers. Refresh and try again." };
  if (status === 403) return { kind: "permission", title: "Permission blocked", hint: "You don’t have access to this org/rep scope." };
  if (status === 422) return { kind: "validation", title: "Invalid request", hint: "The request body was rejected." };
  if (status >= 500) return { kind: "server", title: "Server error", hint: "API failed. Check server logs and retry." };
  return { kind: "unknown", title: "Request failed", hint: "Unexpected failure. Check logs." };
}

type RunTotals = {
  reps_considered?: number;
  contacts_considered?: number;
  actions_created?: number;
  skipped_dedupe?: number;
  errors?: number;
};

type RunListItem = {
  run_id: string;
  mode?: string;
  source?: "cron" | "manual";
  started_at?: string | null;
  finished_at?: string | null;
  totals?: RunTotals | null;
};

type RunDetailItem = RunListItem & {
  reps?: any;
};

function shortId(id: string) {
  const s = String(id || "");
  if (!s) return "";
  if (s.length <= 12) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

function fmtTs(ts?: string | null) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function collectErrorSamples(reps: any): string[] {
  if (!reps || !Array.isArray(reps)) return [];
  const out: string[] = [];
  for (const r of reps) {
    const samples = (r as any)?.errors_sample;
    if (Array.isArray(samples)) {
      for (const s of samples) {
        if (s == null) continue;
        const txt = typeof s === "string" ? s : JSON.stringify(s);
        if (txt && !out.includes(txt)) out.push(txt);
        if (out.length >= 5) return out;
      }
    }
  }
  return out;
}

function hasErrors(totals: any): boolean {
  return num((totals as any)?.errors) > 0;
}

export default function RunHistoryTable({
  limit = 10,
  className,
}: {
  limit?: number;
  className?: string;
}) {
  const [items, setItems] = useState<RunListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<ApiErr | null>(null);

  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, RunDetailItem | null>>({});
  const [detailBusy, setDetailBusy] = useState<Record<string, boolean>>({});

  const safeLimit = useMemo(() => {
    const n = Number(limit);
    if (!Number.isFinite(n)) return 10;
    return Math.min(Math.max(n, 1), 50);
  }, [limit]);

  async function loadList() {
    setBusy(true);
    setApiError(null);
    try {
      const r = await fetch(`/api/proxy/v1/crm/manager/auto-assign/runs?limit=${safeLimit}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) {
        const cls = classifyApiError(r.status);
        setApiError({
          status: r.status,
          kind: cls.kind,
          title: cls.title,
          hint: cls.hint,
          error: String(j?.error ?? `HTTP ${r.status}`),
        });
        setItems([]);
        return;
      }
      const rows = Array.isArray(j?.items) ? j.items : [];
      setItems(
        rows
          .map((x: any) => ({
            run_id: String(x?.run_id ?? "").trim(),
            mode: x?.mode,
            source: x?.source === "cron" ? "cron" : x?.source === "manual" ? "manual" : undefined,
            started_at: x?.started_at ?? null,
            finished_at: x?.finished_at ?? null,
            totals: x?.totals ?? null,
          }))
          .filter((x: RunListItem) => !!x.run_id)
      );
    } catch (e: any) {
      setApiError({
        status: 0,
        kind: "network",
        title: "Network error",
        hint: "Couldn’t reach the API. Check proxy/API is running.",
        error: String(e?.message ?? "failed_to_load"),
      });
      setItems([]);
    } finally {
      setBusy(false);
    }
  }

  async function loadDetail(runId: string) {
    if (!runId) return;
    // already loaded
    if (detail[runId]) return;

    setDetailBusy((m) => ({ ...m, [runId]: true }));
    try {
      const r = await fetch(`/api/proxy/v1/crm/manager/auto-assign/runs/${runId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) {
        throw new Error(String(j?.error ?? `http_${r.status}`));
      }

      const item = j?.item;
      if (!item?.run_id) {
        setDetail((m) => ({ ...m, [runId]: null }));
        return;
      }

      setDetail((m) => ({
        ...m,
        [runId]: {
          run_id: String(item.run_id),
          mode: item.mode,
          source: item.source === "cron" ? "cron" : item.source === "manual" ? "manual" : undefined,
          started_at: item.started_at ?? null,
          finished_at: item.finished_at ?? null,
          totals: item.totals ?? null,
          reps: item.reps ?? null,
        },
      }));
    } catch (e: any) {
      const cls = classifyApiError(500);
      setApiError({
        status: 500,
        kind: cls.kind,
        title: cls.title,
        hint: cls.hint,
        error: String(e?.message ?? "failed_to_load_detail"),
      });
      // Fail silent: keep row collapsible even if details fail.
      setDetail((m) => ({ ...m, [runId]: null }));
    } finally {
      setDetailBusy((m) => ({ ...m, [runId]: false }));
    }
  }

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeLimit]);

  const header = (
    <div className="flex items-center gap-3">
      <div className="text-neutral-200 font-medium">Auto-assign run history</div>
      <button
        type="button"
        onClick={() => loadList()}
        disabled={busy}
        className="ml-auto text-xs px-2 py-1 rounded border border-neutral-800 hover:border-neutral-700 disabled:opacity-60"
      >
        {busy ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );

  return (
    <div className={className ?? ""}>
      <div className="border border-neutral-800 rounded p-3 space-y-3">
        {header}

        {apiError && (
          <div className="text-xs border border-neutral-700 bg-neutral-900 rounded p-2">
            <div className="text-neutral-100 font-medium">
              {apiError.title} {apiError.status > 0 ? `(${apiError.status})` : ""}
            </div>
            <div className="text-neutral-300 mt-1">{apiError.hint}</div>
            <div className="text-neutral-400 mt-1 font-mono break-all">{apiError.error}</div>
          </div>
        )}

        {!apiError && items.length === 0 && !busy && (
          <div className="text-sm text-neutral-400">No runs yet.</div>
        )}

        {items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-neutral-400">
                <tr>
                  <th className="text-left py-2 pr-3">Run</th>
                  <th className="text-left py-2 pr-3">Mode</th>
                  <th className="text-left py-2 pr-3">Started</th>
                  <th className="text-right py-2 pr-3">Reps</th>
                  <th className="text-right py-2 pr-3">Contacts</th>
                  <th className="text-right py-2 pr-3">Created</th>
                  <th className="text-right py-2 pr-3">Skipped</th>
                  <th className="text-right py-2">Errors</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => {
                  const t = r.totals ?? {};
                  const isOpen = openRunId === r.run_id;
                  const isLoadingDetail = !!detailBusy[r.run_id];
                  const d = detail[r.run_id];

                  return (
                    <>
                      <tr
                        key={r.run_id}
                        className="border-t border-neutral-900 hover:bg-neutral-950/30 cursor-pointer"
                        onClick={async () => {
                          const next = isOpen ? null : r.run_id;
                          setOpenRunId(next);
                          if (next) await loadDetail(next);
                        }}
                        title="Click to expand"
                      >
                        <td className="py-2 pr-3 font-mono text-xs text-neutral-200">
                          {shortId(r.run_id)}
                        </td>
                        <td className="py-2 pr-3 text-neutral-200">
                          <span className="inline-flex items-center gap-2">
                            <span>{r.mode ?? "—"}</span>
                            {r.source === "cron" && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-900/40 text-blue-200">cron</span>
                            )}
                            {r.source === "manual" && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-200">manual</span>
                            )}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-neutral-300">{fmtTs(r.started_at)}</td>
                        <td className="py-2 pr-3 text-right text-neutral-200">{num((t as any)?.reps_considered)}</td>
                        <td className="py-2 pr-3 text-right text-neutral-200">{num((t as any)?.contacts_considered)}</td>
                        <td className="py-2 pr-3 text-right text-neutral-200">{num((t as any)?.actions_created)}</td>
                        <td className="py-2 pr-3 text-right text-neutral-200">{num((t as any)?.skipped_dedupe)}</td>
                        <td className="py-2 text-right text-neutral-200">
                          <span className="inline-flex items-center justify-end gap-1">
                            {hasErrors(t) && <span className="text-amber-300" title="Errors present">⚠️</span>}
                            <span>{num((t as any)?.errors)}</span>
                          </span>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="border-t border-neutral-900">
                          <td colSpan={8} className="py-3">
                            <div className="text-xs text-neutral-400 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <div>
                                  <span className="text-neutral-500">run_id:</span>{" "}
                                  <span className="font-mono text-neutral-200">{r.run_id}</span>
                                </div>
                                <div className="text-neutral-500">•</div>
                                <div>
                                  <span className="text-neutral-500">finished:</span>{" "}
                                  <span className="text-neutral-200">{fmtTs(r.finished_at)}</span>
                                </div>
                                {r.source && (
                                  <>
                                    <div className="text-neutral-500">•</div>
                                    <div>
                                      <span className="text-neutral-500">source:</span>{" "}
                                      <span className="text-neutral-200">{r.source}</span>
                                    </div>
                                  </>
                                )}
                                {isLoadingDetail && (
                                  <div className="ml-auto text-neutral-500">Loading details…</div>
                                )}
                              </div>

                              {!isLoadingDetail && d?.reps && Array.isArray(d.reps) && (() => {
                                const samples = collectErrorSamples(d.reps);
                                if (samples.length === 0) return null;
                                return (
                                  <div className="border border-amber-900/40 bg-amber-950/10 rounded p-2">
                                    <div className="text-amber-200 mb-2">Errors (sample)</div>
                                    <ul className="list-disc pl-5 space-y-1 text-amber-100/90">
                                      {samples.map((s, idx) => (
                                        <li key={idx} className="font-mono break-words">{s}</li>
                                      ))}
                                    </ul>
                                  </div>
                                );
                              })()}

                              {!isLoadingDetail && d?.reps && Array.isArray(d.reps) && (
                                <div className="border border-neutral-900 rounded p-2">
                                  <div className="text-neutral-300 mb-2">Per-rep breakdown</div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead className="text-neutral-500">
                                        <tr>
                                          <th className="text-left py-1 pr-3">Rep</th>
                                          <th className="text-right py-1 pr-3">Contacts</th>
                                          <th className="text-right py-1 pr-3">Created</th>
                                          <th className="text-right py-1">Skipped</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(d.reps as any[]).map((x: any, i: number) => (
                                          <tr key={`${r.run_id}_${i}`} className="border-t border-neutral-950">
                                            <td className="py-1 pr-3 text-neutral-200">{String(x?.rep_name ?? x?.rep_id ?? "Rep")}</td>
                                            <td className="py-1 pr-3 text-right text-neutral-200">{num(x?.contacts_considered ?? x?.contacts_processed)}</td>
                                            <td className="py-1 pr-3 text-right text-neutral-200">{num(x?.created)}</td>
                                            <td className="py-1 text-right text-neutral-200">{num(x?.skipped_dedupe ?? x?.skipped)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {!isLoadingDetail && (!d || !d.reps) && (
                                <div className="text-neutral-500">No per-rep breakdown available for this run.</div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}