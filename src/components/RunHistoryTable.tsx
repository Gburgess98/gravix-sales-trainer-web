"use client";

import * as React from "react";
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
  meta?: any;
  is_preview?: boolean;
  executed_from_preview_run_id?: string | null;
  executed_by_user_id?: string | null;
  executed_at?: string | null;
};

type RunDetailItem = RunListItem & {
  preview?: any;
  reps?: any;
  meta?: any;
};

function shortId(id: string) {
  const s = String(id || "");
  if (!s) return "";
  if (s.length <= 12) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

const RUN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidRunId(id: any) {
  return RUN_ID_RE.test(String(id ?? "").trim());
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

function toEntries(obj: any): Array<[string, number]> {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj)
    .map(([k, v]) => [String(k), Number(v)] as [string, number])
    .filter(([, n]) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b[1] - a[1]);
}

function safeArray<T = any>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

const SKIP_REASON_LABELS: Record<string, string> = {
  dedupe_recent: "Duplicate (recent)",
  no_next_action: "No next action",
  missing_data: "Missing data",
  org_scope_mismatch: "Org scope mismatch",
};

function formatSkipReason(k: string) {
  return SKIP_REASON_LABELS[k] ?? k.replace(/_/g, " ");
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
  const [executeBusy, setExecuteBusy] = useState<Record<string, boolean>>({});
  const [executeMsg, setExecuteMsg] = useState<string | null>(null);
  const [confirmExecuteRunId, setConfirmExecuteRunId] = useState<string | null>(null);

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
            is_preview: Boolean((x as any)?.is_preview ?? (x as any)?.preview ?? false),
            executed_from_preview_run_id: (x as any)?.executed_from_preview_run_id ?? null,
            executed_by_user_id: (x as any)?.executed_by_user_id ?? null,
            executed_at: (x as any)?.executed_at ?? null,
            started_at: x?.started_at ?? null,
            finished_at: x?.finished_at ?? null,
            totals: x?.totals ?? null,
            meta: (x as any)?.meta ?? null,
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
  async function executeFromPreview(runId: string) {
    runId = String(runId ?? "").trim();
    if (!runId || !isValidRunId(runId)) return;

    setExecuteBusy((m) => ({ ...m, [runId]: true }));
    setExecuteMsg(null);
    setApiError(null);

    try {
      const r = await fetch(`/api/proxy/v1/crm/manager/auto-assign/execute-from-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview_run_id: runId }),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok || (j as any)?.ok === false) {
        const cls = classifyApiError(r.status);
        setApiError({
          status: r.status,
          kind: cls.kind,
          title: cls.title,
          hint: cls.hint,
          error: String((j as any)?.error ?? `HTTP ${r.status}`),
        });
        return;
      }

      const created = num((j as any)?.totals?.actions_created);
      const skipped = num((j as any)?.totals?.skipped_dedupe);
      const errors = num((j as any)?.totals?.errors);
      const newRunId = String((j as any)?.run_id ?? "").trim();
      const meta = (j as any)?.meta ?? null;
      const abortedReason = String(meta?.aborted_reason ?? "").trim();

      if (!newRunId && abortedReason === "preview_has_no_actions") {
        setExecuteMsg(`Nothing to execute — preview ${shortId(runId)} had no actions to create.`);
      } else {
        setExecuteMsg(
          `Executed from preview ${shortId(runId)} → ${newRunId ? shortId(newRunId) : "(missing run_id)"} (created: ${created}, skipped: ${skipped}${errors ? `, errors: ${errors}` : ""})`
        );
      }

      await loadList();
    } catch (e: any) {
      setApiError({
        status: 0,
        kind: "network",
        title: "Network error",
        hint: "Couldn’t reach the API. Check proxy/API is running.",
        error: String(e?.message ?? "execute_failed"),
      });
    } finally {
      setExecuteBusy((m) => ({ ...m, [runId]: false }));
    }
  }

  async function loadDetail(runId: string) {
    runId = String(runId ?? "").trim();
    if (!runId || !isValidRunId(runId)) return;
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
          is_preview: Boolean((item as any)?.is_preview ?? (item as any)?.preview ?? false),
          executed_from_preview_run_id: (item as any)?.executed_from_preview_run_id ?? null,
          executed_by_user_id: (item as any)?.executed_by_user_id ?? null,
          executed_at: (item as any)?.executed_at ?? null,
          preview: (item as any)?.preview ?? null,
          started_at: item.started_at ?? null,
          finished_at: item.finished_at ?? null,
          totals: item.totals ?? null,
          reps: item.reps ?? null,
          meta: (item as any)?.meta ?? null,
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
      {confirmExecuteRunId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-neutral-950 border border-neutral-800 rounded p-4 w-full max-w-md space-y-3">
            <div className="text-neutral-200 font-medium">Confirm execute</div>

            <div className="text-sm text-neutral-400">
              This will create CRM actions from the selected preview run. This cannot be undone.
            </div>

            <div className="text-xs text-neutral-500">
              preview_run_id: <span className="font-mono text-neutral-200">{confirmExecuteRunId}</span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmExecuteRunId(null)}
                className="px-3 py-2 rounded border border-neutral-700 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const rid = confirmExecuteRunId;
                  setConfirmExecuteRunId(null);
                  if (rid) await executeFromPreview(rid);
                }}
                className="px-3 py-2 rounded bg-white text-black text-sm font-medium"
              >
                Yes, execute
              </button>
            </div>
          </div>
        </div>
      )}
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

        {executeMsg && (
          <div className="text-xs border border-neutral-700 bg-neutral-950 rounded p-2 text-neutral-200">
            {executeMsg}
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
                    <React.Fragment key={r.run_id}>
                      <tr
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

                            {r.is_preview && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/30 text-emerald-200">preview</span>
                            )}

                            {/* Trust signal: from preview badge */}
                            {!r.is_preview && r.executed_from_preview_run_id && (
                              <span
                                className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/20 text-emerald-200"
                                title={`Executed from preview: ${String(r.executed_from_preview_run_id)}`}
                              >
                                from preview
                              </span>
                            )}

                            {r.source === "cron" && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-900/40 text-blue-200">cron</span>
                            )}
                            {r.source === "manual" && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-200">manual</span>
                            )}

                            {/* Trust signal: executed_at badge */}
                            {r.executed_at && !r.is_preview && (
                              <span
                                className="text-[10px] px-2 py-0.5 rounded border border-neutral-800 text-neutral-300"
                                title={`Executed at: ${fmtTs(r.executed_at)}`}
                              >
                                executed
                              </span>
                            )}

                            {r.is_preview && (r.mode || "").toLowerCase() === "dry_run" && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmExecuteRunId(r.run_id);
                                }}
                                disabled={!!executeBusy[r.run_id]}
                                className="ml-2 text-[11px] px-2 py-0.5 rounded border border-neutral-800 hover:border-neutral-700 disabled:opacity-60"
                                title="Execute using this dry-run preview"
                              >
                                {executeBusy[r.run_id] ? "Executing…" : "Execute"}
                              </button>
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

                              {/* Audit/trust context block */}
                              {(() => {
                                const fromPreview = String((d?.executed_from_preview_run_id ?? r.executed_from_preview_run_id) || "").trim();
                                const executedBy = String((d?.executed_by_user_id ?? r.executed_by_user_id) || "").trim();
                                const executedAt = (d?.executed_at ?? r.executed_at) as string | null | undefined;

                                if (!fromPreview && !executedBy && !executedAt) return null;

                                return (
                                  <div className="border border-neutral-900 rounded p-2">
                                    <div className="text-neutral-300 mb-2">Audit</div>

                                    {fromPreview && (
                                      <div className="text-[11px] text-neutral-400">
                                        <span className="text-neutral-500">executed_from_preview_run_id:</span>{" "}
                                        <span className="font-mono text-neutral-200">{fromPreview}</span>
                                      </div>
                                    )}

                                    {executedBy && (
                                      <div className="text-[11px] text-neutral-400 mt-1">
                                        <span className="text-neutral-500">executed_by_user_id:</span>{" "}
                                        <span className="font-mono text-neutral-200">{executedBy}</span>
                                      </div>
                                    )}

                                    {executedAt && (
                                      <div className="text-[11px] text-neutral-400 mt-1">
                                        <span className="text-neutral-500">executed_at:</span>{" "}
                                        <span className="text-neutral-200">{fmtTs(executedAt)}</span>
                                      </div>
                                    )}

                                    {fromPreview && (
                                      <div className="mt-2 text-[11px] text-neutral-500">
                                        This run was executed from an approved preview (high-trust path).
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* Timings (read-only) */}
                              {(() => {
                                const m = (d as any)?.meta ?? (r as any)?.meta;
                                if (!m || typeof m !== "object") return null;

                                const totalMs = Number((m as any)?.total_ms);
                                const budgetMs = Number((m as any)?.time_budget_ms);
                                const aborted = (m as any)?.aborted_reason;
                                const perRep = Array.isArray((m as any)?.timings?.per_rep)
                                  ? (m as any).timings.per_rep
                                  : [];

                                const hasAny =
                                  Number.isFinite(totalMs) ||
                                  Number.isFinite(budgetMs) ||
                                  aborted != null ||
                                  (perRep?.length ?? 0) > 0;
                                if (!hasAny) return null;

                                const fmtMs = (v: any) => {
                                  const n = Number(v);
                                  return Number.isFinite(n) ? `${n}ms` : "—";
                                };

                                return (
                                  <div className="border border-neutral-900 rounded p-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="text-neutral-300">Timings</div>
                                      <div className="text-[11px] text-neutral-500">(read-only)</div>

                                      {aborted ? (
                                        <span
                                          className="ml-auto text-[10px] px-2 py-0.5 rounded bg-amber-900/20 text-amber-200"
                                          title="Run aborted early to protect performance"
                                        >
                                          aborted: {String(aborted)}
                                        </span>
                                      ) : null}
                                    </div>

                                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                                      <span className="px-2 py-1 rounded border border-neutral-800 bg-neutral-950 text-neutral-200">
                                        total: <span className="text-neutral-200">{fmtMs(totalMs)}</span>
                                      </span>
                                      <span className="px-2 py-1 rounded border border-neutral-800 bg-neutral-950 text-neutral-200">
                                        budget: <span className="text-neutral-200">{fmtMs(budgetMs)}</span>
                                      </span>
                                    </div>

                                    {perRep.length > 0 && (
                                      <div className="mt-3 overflow-x-auto">
                                        <table className="w-full text-[11px]">
                                          <thead className="text-neutral-500">
                                            <tr>
                                              <th className="text-left py-1 pr-3">Rep</th>
                                              <th className="text-right py-1 pr-3">Fetch contacts</th>
                                              <th className="text-right py-1 pr-3">Processing</th>
                                              <th className="text-right py-1">Total</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {perRep.slice(0, 10).map((x: any, i: number) => (
                                              <tr
                                                key={`${r.run_id}_timing_${String(x?.rep_id ?? i)}`}
                                                className="border-t border-neutral-950"
                                              >
                                                <td className="py-1 pr-3 text-neutral-200">
                                                  <span className="font-mono">{String(x?.rep_id ?? "")}</span>
                                                </td>
                                                <td className="py-1 pr-3 text-right text-neutral-200">
                                                  {fmtMs(x?.fetch_contacts_ms)}
                                                </td>
                                                <td className="py-1 pr-3 text-right text-neutral-200">
                                                  {fmtMs(x?.processing_ms)}
                                                </td>
                                                <td className="py-1 text-right text-neutral-200">{fmtMs(x?.total_ms)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>

                                        {perRep.length > 10 ? (
                                          <div className="mt-2 text-[11px] text-neutral-500">Showing first 10 reps.</div>
                                        ) : null}
                                      </div>
                                    )}

                                    <div className="mt-2 text-[11px] text-neutral-500">
                                      Use this to understand where time is spent (DB fetch vs processing). No actions are taken here.
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* UX: preview expanded row hint */}
                              {r.is_preview && (r.mode || "").toLowerCase() === "dry_run" && (
                                <div className="text-[11px] text-neutral-500">
                                  Preview run (dry_run). Use the <span className="text-neutral-300">Execute</span> button on the row to create actions from this preview.
                                </div>
                              )}

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

                              {!isLoadingDetail && d?.reps && Array.isArray(d.reps) && (() => {
                                const reps = safeArray<any>(d.reps);

                                // Aggregate skip reasons across all reps
                                const agg: Record<string, number> = {};
                                for (const rep of reps) {
                                  const by = rep?.skipped_by_reason;
                                  if (!by || typeof by !== "object") continue;
                                  for (const [k, v] of Object.entries(by)) {
                                    const key = String(k);
                                    const n = Number(v);
                                    if (!Number.isFinite(n) || n <= 0) continue;
                                    agg[key] = (agg[key] || 0) + n;
                                  }
                                }

                                const top = toEntries(agg).slice(0, 3);
                                if (top.length === 0) return null;

                                return (
                                  <div className="border border-neutral-900 rounded p-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="text-neutral-300">Top skips</div>
                                      <div className="text-[11px] text-neutral-500">(this run)</div>
                                    </div>

                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {top.map(([k, n]) => (
                                        <span
                                          key={k}
                                          className="text-[11px] px-2 py-1 rounded border border-neutral-800 bg-neutral-950 text-neutral-200"
                                          title={k}
                                        >
                                          <span className="text-neutral-400">{formatSkipReason(k)}</span>
                                          <span className="text-neutral-500"> × </span>
                                          {n}
                                        </span>
                                      ))}
                                    </div>

                                    <div className="mt-2 text-[11px] text-neutral-500">
                                      Skips are usually expected (e.g. dedupe or missing next actions) and prevent duplicate work.
                                    </div>
                                  </div>
                                );
                              })()}

                              {!isLoadingDetail && d?.reps && Array.isArray(d.reps) && (() => {
                                const reps = safeArray<any>(d.reps);
                                const hasDiag = reps.some((x) => x?.skipped_by_reason || x?.skipped_samples);
                                if (!hasDiag) return null;

                                return (
                                  <div className="border border-neutral-900 rounded p-2">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="text-neutral-300">Skip diagnostics</div>
                                      <div className="text-[11px] text-neutral-500">(per rep)</div>
                                    </div>

                                    <div className="space-y-3">
                                      {reps
                                        .map((rep: any, idx: number) => {
                                          const repId = String(rep?.rep_id ?? rep?.id ?? "").trim();
                                          const repName = String(rep?.rep_name ?? rep?.name ?? "Rep").trim();

                                          const entries = toEntries(rep?.skipped_by_reason);
                                          const samples = safeArray<{ contact_id?: string; reason?: string }>(rep?.skipped_samples);

                                          if (!entries.length && !samples.length) return null;

                                          return (
                                            <div key={repId || `${repName}_${idx}`} className="border border-neutral-800 rounded p-2">
                                              <div className="text-xs text-neutral-300">
                                                <span className="text-neutral-200 font-medium">{repName}</span>
                                                {repId ? <span className="text-neutral-500"> • </span> : null}
                                                {repId ? <span className="font-mono text-[11px] text-neutral-400">{repId}</span> : null}
                                              </div>

                                              {entries.length > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                  {entries.map(([k, n]) => (
                                                    <span
                                                      key={k}
                                                      className="text-[11px] px-2 py-1 rounded border border-neutral-800 bg-neutral-950 text-neutral-200"
                                                      title={k}
                                                    >
                                                      <span className="text-neutral-400">{formatSkipReason(k)}</span>
                                                      <span className="text-neutral-500">:</span> {n}
                                                    </span>
                                                  ))}
                                                </div>
                                              )}

                                              {samples.length > 0 && (
                                                <div className="mt-2">
                                                  <div className="text-[11px] text-neutral-500">samples</div>
                                                  <div className="mt-1 space-y-1">
                                                    {samples.slice(0, 5).map((s, sidx) => (
                                                      <div key={`${repId || repName}_${sidx}`} className="text-[11px] text-neutral-300">
                                                        <span className="font-mono text-neutral-200">{shortId(String(s?.contact_id ?? ""))}</span>
                                                        {s?.reason ? <span className="text-neutral-500"> — {formatSkipReason(String(s.reason))}</span> : null}
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })
                                        .filter(Boolean)}
                                    </div>
                                  </div>
                                );
                              })()}

                              {!isLoadingDetail && (!d || !d.reps) && (
                                <div className="text-neutral-500">No per-rep breakdown available for this run.</div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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