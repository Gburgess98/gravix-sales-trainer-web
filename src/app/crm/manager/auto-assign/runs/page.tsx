// src/app/crm/manager/auto-assign/runs/page.tsx
import Link from "next/link";
import { headers } from "next/headers";

type RunTotals = {
  reps_considered?: number;
  contacts_considered?: number;
  actions_created?: number;
  skipped_dedupe?: number;
  errors?: number;
};

type RunMeta = {
  total_ms?: number;
  time_budget_ms?: number;
  aborted_reason?: string | null;
  preview?: boolean;
  executed_from_preview?: boolean;
  preview_run_id?: string;
  generated_at?: string;
};

type RunItem = {
  run_id: string;
  mode?: string | null;
  source?: "cron" | "manual" | null;
  is_preview?: boolean;
  executed_from_preview_run_id?: string | null;
  executed_by_user_id?: string | null;
  executed_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  totals?: RunTotals | null;
  meta?: RunMeta | null;
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

function safeNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function msToHuman(ms: number | null | undefined): string {
  const n = safeNum(ms);
  if (n == null) return "—";
  if (n < 1000) return `${n} ms`;
  const s = n / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}m ${r.toFixed(0)}s`;
}

function asObjMeta(meta: any): RunMeta {
  return meta && typeof meta === "object" ? (meta as RunMeta) : {};
}

function absoluteUrl(path: string) {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${proto}://${host}${p}`;
}

async function getRuns(limit: number): Promise<RunItem[]> {
  const url = absoluteUrl(`/api/proxy/v1/crm/manager/auto-assign/runs?limit=${limit}`);
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  return Array.isArray((json as any)?.items) ? ((json as any).items as RunItem[]) : [];
}

export default async function AutoAssignRunsPage({
  searchParams,
}: {
  searchParams?: { limit?: string };
}) {
  const limitRaw = Number(searchParams?.limit ?? "20");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 5), 50) : 20;

  const runs = await getRuns(limit);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div>
          <h1 className="text-xl font-semibold">Auto-Assign Runs</h1>
          <p className="text-sm text-neutral-400">Historical preview and execution runs</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="text-xs text-neutral-500">Limit</div>
          <div className="flex items-center gap-1">
            {[10, 20, 50].map((n) => (
              <Link
                key={n}
                href={`/crm/manager/auto-assign/runs?limit=${n}`}
                className={`text-xs px-2 py-1 rounded border ${n === limit ? "border-neutral-600 text-neutral-100" : "border-neutral-800 text-neutral-300 hover:border-neutral-700"}`}
              >
                {n}
              </Link>
            ))}
          </div>

          <Link
            href={`/crm/manager/auto-assign/runs?limit=${limit}`}
            className="text-xs px-2 py-1 rounded border border-neutral-800 text-neutral-300 hover:border-neutral-700"
          >
            Refresh
          </Link>
          {runs.length > 0 ? (
            <Link
              href={`/crm/manager/auto-assign/runs/${runs[0].run_id}`}
              className="text-xs px-2 py-1 rounded border border-neutral-800 text-neutral-300 hover:border-neutral-700"
            >
              Open latest
            </Link>
          ) : (
            <span className="text-xs px-2 py-1 rounded border border-neutral-800 text-neutral-600 cursor-not-allowed">
              Open latest
            </span>
          )}
        </div>
      </div>

      <div className="rounded border border-neutral-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-neutral-400">
            <tr>
              <th className="px-3 py-2 text-left">Run</th>
              <th className="px-3 py-2 text-left">Context</th>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">Reps</th>
              <th className="px-3 py-2">Contacts</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Skipped</th>
              <th className="px-3 py-2">Errors</th>
            </tr>
          </thead>

          <tbody>
            {runs.map((r) => {
              const meta = asObjMeta(r.meta);
              const totals = (r.totals ?? {}) as RunTotals;

              const aborted = String(meta.aborted_reason ?? "").trim();
              const isAborted = !!aborted;

              const isPreview = Boolean(r.is_preview ?? meta.preview);
              const executedAt = r.executed_at ?? null;
              const fromPreview = String(r.executed_from_preview_run_id ?? "").trim();

              const errors = safeNum((totals as any).errors);
              const hasErrors = (errors ?? 0) > 0;

              return (
                <tr
                  key={r.run_id}
                  className="border-t border-neutral-800 hover:bg-neutral-900/40"
                >
                  <td className="px-3 py-2 font-mono">
                    <Link
                      href={`/crm/manager/auto-assign/runs/${r.run_id}`}
                      className="hover:underline"
                      title={r.run_id}
                    >
                      {shortId(r.run_id)}
                    </Link>
                  </td>

                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-neutral-200">{r.mode ?? "—"}</span>

                      {isPreview && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/30 text-emerald-200">
                          preview
                        </span>
                      )}

                      {!isPreview && fromPreview && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/20 text-emerald-200"
                          title={`Executed from preview: ${fromPreview}`}
                        >
                          from preview
                        </span>
                      )}

                      {r.source === "cron" && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-900/40 text-blue-200">
                          cron
                        </span>
                      )}
                      {r.source === "manual" && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-200">
                          manual
                        </span>
                      )}

                      {executedAt && !isPreview && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded border border-neutral-800 text-neutral-300"
                          title={`Executed at: ${fmtTs(executedAt)}`}
                        >
                          executed
                        </span>
                      )}

                      {isAborted && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded bg-amber-900/30 text-amber-200"
                          title={aborted}
                        >
                          aborted
                        </span>
                      )}

                      {hasErrors && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded bg-rose-900/30 text-rose-200"
                          title="Errors present"
                        >
                          errors
                        </span>
                      )}

                      {isAborted && (
                        <span className="text-[11px] text-neutral-500">{aborted}</span>
                      )}
                    </div>
                  </td>

                  <td className="px-3 py-2 text-center">{fmtTs(r.started_at)}</td>

                  <td className="px-3 py-2 text-center">
                    {msToHuman(meta.total_ms)}
                  </td>

                  <td className="px-3 py-2 text-center">
                    {safeNum((totals as any).reps_considered) ?? "—"}
                  </td>

                  <td className="px-3 py-2 text-center">
                    {safeNum((totals as any).contacts_considered) ?? "—"}
                  </td>

                  <td className="px-3 py-2 text-center">
                    {safeNum((totals as any).actions_created) ?? "—"}
                  </td>

                  <td className="px-3 py-2 text-center">
                    {safeNum((totals as any).skipped_dedupe) ?? "—"}
                  </td>

                  <td className="px-3 py-2 text-center">
                    {errors == null ? (
                      "—"
                    ) : errors > 0 ? (
                      <span className="text-amber-300" title="Errors present">⚠ {errors}</span>
                    ) : (
                      "0"
                    )}
                  </td>
                </tr>
              );
            })}

            {runs.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-neutral-500">
                  No auto-assign runs yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-neutral-500">
        Tip: Click a run ID to open full details. Duration comes from <span className="font-mono">meta.total_ms</span> when present.
      </div>
    </div>
  );
}