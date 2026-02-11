import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type RunTotals = {
  reps_considered?: number;
  contacts_considered?: number;
  actions_created?: number;
  skipped_dedupe?: number;
  errors?: number;
};

type PerRepTiming = {
  rep_id?: string;
  fetch_contacts_ms?: number;
  processing_ms?: number;
  total_ms?: number;
};

type RunMeta = {
  version?: string;
  total_ms?: number;
  time_budget_ms?: number;
  aborted_reason?: string | null;
  caps?: {
    contacts_per_rep?: number;
    max_total_contacts?: number;
  };
  timings?: {
    per_rep?: PerRepTiming[];
  };
  preview?: boolean;
  forwarded?: boolean;
  generated_at?: string;
  executed_from_preview?: boolean;
  preview_run_id?: string;
};

type RunRepRow = {
  rep_id?: string;
  rep_name?: string | null;
  created?: number;
  skipped_dedupe?: number;
  contacts_considered?: number;
  errors_sample?: any[];
  skipped_by_reason?: Record<string, number>;
  skipped_samples?: Array<{ contact_id?: string; reason?: string }>;
};

type RunItem = {
  run_id: string;
  mode?: string | null;
  source?: string | null;
  is_preview?: boolean;
  started_at?: string | null;
  finished_at?: string | null;
  totals?: RunTotals | null;
  reps?: RunRepRow[] | null;
  meta?: RunMeta | Record<string, any> | null;
  executed_from_preview_run_id?: string | null;
  executed_by_user_id?: string | null;
  executed_at?: string | null;
};

function isUuidLike(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function shortId(id: string) {
  const s = String(id || "");
  if (!s) return "";
  if (s.length <= 12) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtTs(ts?: string | null) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function safeMeta(m: any): RunMeta {
  return m && typeof m === "object" ? (m as RunMeta) : {};
}

function repLabel(repId: string, reps: RunRepRow[] | null | undefined) {
  const id = String(repId ?? "").trim();
  if (!id) return "—";
  const row = Array.isArray(reps) ? reps.find((r) => String(r?.rep_id ?? "").trim() === id) : null;
  const name = String(row?.rep_name ?? "").trim();
  return name ? `${name} (${shortId(id)})` : shortId(id);
}

async function getRun(runId: string): Promise<RunItem | null> {
  const r = await fetch(`/api/proxy/v1/crm/manager/auto-assign/runs/${runId}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j as any)?.ok === false) return null;
  const item = (j as any)?.item;
  if (!item?.run_id) return null;
  return item as RunItem;
}

export default async function AutoAssignRunDetailPage({
  params,
}: {
  params: { run_id: string };
}) {
  const runId = decodeURIComponent(String(params?.run_id ?? "")).trim();
  if (!runId || !isUuidLike(runId)) notFound();

  const item = await getRun(runId);
  if (!item) notFound();

  const totals = item.totals ?? {};
  const meta = safeMeta(item.meta);
  const perRepRaw = Array.isArray(meta?.timings?.per_rep) ? meta.timings!.per_rep! : [];
  const perRep = [...perRepRaw].sort((a, b) => num((b as any)?.total_ms) - num((a as any)?.total_ms));
  const perRepSumMs = perRep.reduce((acc, t) => acc + num((t as any)?.total_ms), 0);

  const isPreview = Boolean(item.is_preview ?? (meta as any)?.preview ?? false);
  const hasAbort = Boolean(meta?.aborted_reason);

  const created = num((totals as any)?.actions_created);
  const skipped = num((totals as any)?.skipped_dedupe);
  const errors = num((totals as any)?.errors);
  const durationMs = num((meta as any)?.total_ms);
  const durationDenomMs = durationMs > 0 ? durationMs : Math.max(1, perRepSumMs);

  const summaryParts: string[] = [];
  summaryParts.push(isPreview ? "Preview" : "Executed");
  if (item.mode) summaryParts.push(String(item.mode));
  if (!isPreview && (item.executed_from_preview_run_id || (meta as any)?.executed_from_preview)) summaryParts.push("from preview");
  if (created || skipped) summaryParts.push(`${created} created, ${skipped} skipped`);
  if (errors) summaryParts.push(`${errors} errors`);
  if (hasAbort) summaryParts.push("aborted");
  if (durationMs) summaryParts.push(`${durationMs}ms`);
  const summary = summaryParts.join(" • ");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/crm/manager/auto-assign/runs"
          className="text-xs text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
        >
          ← Back to runs
        </Link>
      </div>
      <div className="flex items-start gap-3">
        <div className="space-y-1">
          <div className="text-xs text-neutral-400">
            <Link href="/crm/manager/auto-assign/runs" className="hover:underline">
              ← Back to runs
            </Link>
          </div>
          <h1 className="text-xl font-semibold">Auto-Assign Run</h1>
          <div className="text-sm text-neutral-400 flex flex-wrap items-center gap-2">
            <span>Run ID:</span>
            <span id="run-id-value" className="font-mono text-neutral-200">
              {item.run_id}
            </span>

            <button
              id="copy-run-id"
              type="button"
              className="text-[11px] px-2 py-1 rounded border border-neutral-800 hover:border-neutral-700 text-neutral-200"
              title="Copy run id"
            >
              Copy
            </button>

            <span id="copy-run-id-status" className="text-[11px] text-neutral-500" aria-live="polite" />

            <script
              dangerouslySetInnerHTML={{
                __html: `(() => {
  try {
    const btn = document.getElementById('copy-run-id');
    const el = document.getElementById('run-id-value');
    const status = document.getElementById('copy-run-id-status');
    if (!btn || !el) return;

    btn.addEventListener('click', async () => {
      const text = (el.textContent || '').trim();
      if (!text) return;

      try {
        await navigator.clipboard.writeText(text);
        if (status) status.textContent = 'Copied';
        setTimeout(() => { if (status) status.textContent = ''; }, 1200);
      } catch (e) {
        // Fallback: select text for manual copy
        const r = document.createRange();
        r.selectNodeContents(el);
        const sel = window.getSelection();
        sel && (sel.removeAllRanges(), sel.addRange(r));
        if (status) status.textContent = 'Select + copy';
        setTimeout(() => { if (status) status.textContent = ''; }, 1600);
      }
    });
  } catch (_) {}
})();`,
              }}
            />
          </div>
          <div className="text-sm text-neutral-400">
            <span className="text-neutral-500">Summary:</span> <span className="text-neutral-200">{summary}</span>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap gap-2">
          {isPreview ? (
            <span className="text-[11px] px-2 py-1 rounded bg-emerald-900/30 text-emerald-200 border border-emerald-900/40">
              preview
            </span>
          ) : (
            <span className="text-[11px] px-2 py-1 rounded bg-neutral-900 text-neutral-200 border border-neutral-800">
              executed
            </span>
          )}

          {item.source ? (
            <span className="text-[11px] px-2 py-1 rounded bg-neutral-900 text-neutral-200 border border-neutral-800">
              {String(item.source)}
            </span>
          ) : null}

          {hasAbort ? (
            <span className="text-[11px] px-2 py-1 rounded bg-amber-950/30 text-amber-200 border border-amber-900/40">
              aborted
            </span>
          ) : null}
        </div>
      </div>

      {hasAbort ? (
        <div className="rounded border border-amber-900/40 bg-amber-950/10 p-3">
          <div className="text-amber-200 font-medium">Run aborted</div>
          <div className="text-sm text-amber-100/90 mt-1 font-mono break-words">{String(meta.aborted_reason)}</div>
          <div className="text-xs text-amber-200/70 mt-2">
            This usually means we hit a time budget or safety cap before processing everything.
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded border border-neutral-800 p-3">
          <div className="text-xs text-neutral-500">Mode</div>
          <div className="text-neutral-100 mt-1">{item.mode ?? "—"}</div>

          <div className="text-xs text-neutral-500 mt-2">Started</div>
          <div className="text-neutral-200 mt-1">{fmtTs(item.started_at)}</div>

          <div className="text-xs text-neutral-500 mt-2">Finished</div>
          <div className="text-neutral-200 mt-1">{fmtTs(item.finished_at)}</div>

          {meta?.generated_at ? (
            <>
              <div className="text-xs text-neutral-500 mt-2">Generated</div>
              <div className="text-neutral-200 mt-1">{fmtTs(meta.generated_at)}</div>
            </>
          ) : null}
        </div>

        <div className="rounded border border-neutral-800 p-3">
          <div className="text-xs text-neutral-500">Totals</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded border border-neutral-900 p-2">
              <div className="text-xs text-neutral-500">Reps</div>
              <div className="text-neutral-100">{num((totals as any)?.reps_considered)}</div>
            </div>
            <div className="rounded border border-neutral-900 p-2">
              <div className="text-xs text-neutral-500">Contacts</div>
              <div className="text-neutral-100">{num((totals as any)?.contacts_considered)}</div>
            </div>
            <div className="rounded border border-neutral-900 p-2">
              <div className="text-xs text-neutral-500">Created</div>
              <div className="text-neutral-100">{num((totals as any)?.actions_created)}</div>
            </div>
            <div className="rounded border border-neutral-900 p-2">
              <div className="text-xs text-neutral-500">Skipped</div>
              <div className="text-neutral-100">{num((totals as any)?.skipped_dedupe)}</div>
            </div>
          </div>
          <div className="mt-3 text-sm">
            <span className="text-xs text-neutral-500">Errors:</span>{" "}
            <span className={num((totals as any)?.errors) > 0 ? "text-amber-300" : "text-neutral-100"}>
              {num((totals as any)?.errors)}
            </span>
          </div>
        </div>

        <div className="rounded border border-neutral-800 p-3">
          <div className="text-xs text-neutral-500">Timing</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded border border-neutral-900 p-2">
              <div className="text-xs text-neutral-500">Total</div>
              <div className="text-neutral-100">{meta?.total_ms ? `${meta.total_ms} ms` : "—"}</div>
            </div>
            <div className="rounded border border-neutral-900 p-2">
              <div className="text-xs text-neutral-500">Budget</div>
              <div className="text-neutral-100">{meta?.time_budget_ms ? `${meta.time_budget_ms} ms` : "—"}</div>
            </div>
          </div>

          <div className="text-xs text-neutral-500 mt-3">Caps</div>
          <div className="text-sm text-neutral-200 mt-1">
            contacts_per_rep:{" "}
            <span className="font-mono">
              {meta?.caps?.contacts_per_rep == null ? "—" : num(meta?.caps?.contacts_per_rep)}
            </span>
            {"  "}
            <span className="text-neutral-600">•</span>
            {"  "}
            max_total_contacts:{" "}
            <span className="font-mono">
              {meta?.caps?.max_total_contacts == null ? "—" : num(meta?.caps?.max_total_contacts)}
            </span>
          </div>

          {item.executed_from_preview_run_id || item.executed_at || item.executed_by_user_id ? (
            <div className="mt-3 rounded border border-neutral-900 p-2">
              <div className="text-xs text-neutral-500">Audit</div>
              {item.executed_from_preview_run_id ? (
                <div className="text-xs text-neutral-200 mt-1">
                  from preview: <span className="font-mono">{item.executed_from_preview_run_id}</span>
                </div>
              ) : null}
              {item.executed_by_user_id ? (
                <div className="text-xs text-neutral-200 mt-1">
                  executed_by: <span className="font-mono">{item.executed_by_user_id}</span>
                </div>
              ) : null}
              {item.executed_at ? (
                <div className="text-xs text-neutral-200 mt-1">executed_at: {fmtTs(item.executed_at)}</div>
              ) : null}
            </div>
          ) : null}

          {meta?.executed_from_preview && meta?.preview_run_id ? (
            <div className="mt-3 text-xs text-neutral-400">
              executed_from_preview: <span className="font-mono text-neutral-200">{shortId(String(meta.preview_run_id))}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded border border-neutral-800 p-3">
        <div className="text-neutral-200 font-medium">Per-rep timings</div>
        <div className="text-xs text-neutral-500 mt-1">
          Why the run took time (fetch vs processing). Share is relative to this run’s total_ms.
        </div>

        {perRep.length === 0 ? (
          <div className="text-sm text-neutral-500 mt-3">No timing breakdown available.</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-neutral-400">
                <tr>
                  <th className="text-left py-2 pr-3">Rep</th>
                  <th className="text-right py-2 pr-3">Fetch (ms)</th>
                  <th className="text-right py-2 pr-3">Process (ms)</th>
                  <th className="text-right py-2 pr-3">Total (ms)</th>
                  <th className="text-right py-2">Share</th>
                </tr>
              </thead>
              <tbody>
                {perRep.map((t, idx) => {
                  const fetchMs = num(t?.fetch_contacts_ms);
                  const procMs = num(t?.processing_ms);
                  const totalMs = num(t?.total_ms);
                  const denom = durationDenomMs;
                  const share = Math.min(1, Math.max(0, totalMs / denom));
                  const sharePct = Math.round(share * 100);

                  return (
                    <tr key={`${String(t?.rep_id ?? "rep")}_${idx}`} className="border-t border-neutral-900">
                      <td className="py-2 pr-3 text-neutral-200">
                        <div className="text-sm">{repLabel(String(t?.rep_id ?? ""), item.reps)}</div>
                        <div className="text-xs font-mono text-neutral-500">{String(t?.rep_id ?? "")}</div>
                      </td>
                      <td className="py-2 pr-3 text-right text-neutral-200">{fetchMs}</td>
                      <td className="py-2 pr-3 text-right text-neutral-200">{procMs}</td>
                      <td className="py-2 pr-3 text-right text-neutral-200">{totalMs}</td>
                      <td className="py-2 text-right text-neutral-200">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-neutral-400 tabular-nums">{sharePct}%</span>
                          <span className="inline-flex h-2 w-20 rounded bg-neutral-900 border border-neutral-800 overflow-hidden" aria-hidden="true">
                            <span
                              className="h-full bg-neutral-300/70"
                              style={{ width: `${Math.max(0, Math.min(100, sharePct))}%` }}
                            />
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="mt-2 text-[11px] text-neutral-500">
              total_ms (run): <span className="font-mono text-neutral-300">{durationMs || 0}</span>
              <span className="text-neutral-600"> • </span>
              denom_ms (share): <span className="font-mono text-neutral-300">{durationDenomMs}</span>
              {durationMs <= 0 ? <span className="text-neutral-600"> (fallback: sum of per-rep totals)</span> : null}
            </div>
          </div>
        )}
      </div>

      <div className="rounded border border-neutral-800 p-3">
        <div className="text-neutral-200 font-medium">Per-rep breakdown</div>
        <div className="text-xs text-neutral-500 mt-1">Created/skipped/errors by rep (from the run record)</div>

        {Array.isArray(item.reps) && item.reps.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-neutral-400">
                <tr>
                  <th className="text-left py-2 pr-3">Rep</th>
                  <th className="text-right py-2 pr-3">Contacts</th>
                  <th className="text-right py-2 pr-3">Created</th>
                  <th className="text-right py-2 pr-3">Skipped</th>
                  <th className="text-right py-2">Errors</th>
                </tr>
              </thead>
              <tbody>
                {item.reps.map((r, idx) => (
                  <tr key={`${String(r?.rep_id ?? "rep")}_${idx}`} className="border-t border-neutral-900">
                    <td className="py-2 pr-3 text-neutral-200">
                      <div className="text-sm">{String(r?.rep_name ?? "Rep")}</div>
                      <div className="text-xs font-mono text-neutral-500">{String(r?.rep_id ?? "")}</div>
                    </td>
                    <td className="py-2 pr-3 text-right text-neutral-200">{num(r?.contacts_considered)}</td>
                    <td className="py-2 pr-3 text-right text-neutral-200">{num(r?.created)}</td>
                    <td className="py-2 pr-3 text-right text-neutral-200">{num(r?.skipped_dedupe)}</td>
                    <td className="py-2 text-right text-neutral-200">
                      {Array.isArray(r?.errors_sample) && r.errors_sample.length > 0 ? "⚠" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-neutral-500 mt-3">No per-rep breakdown stored for this run.</div>
        )}
      </div>

      <details className="rounded border border-neutral-800 p-3">
        <summary className="cursor-pointer text-neutral-200 font-medium">Raw run JSON</summary>
        <pre className="mt-3 text-xs overflow-x-auto text-neutral-300 bg-neutral-950 border border-neutral-900 rounded p-3">
          {JSON.stringify(item, null, 2)}
        </pre>
      </details>
    </div>
  );
}