// src/app/crm/manager/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";
import CrmManagerRunnerClient from "./CrmManagerRunnerClient";

function StatusDot({ colour }: { colour: "red" | "amber" | "green" }) {
  const map = {
    red: "bg-red-500",
    amber: "bg-amber-400",
    green: "bg-green-500",
  };
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${map[colour]}`}
      title={colour}
    />
  );
}

type OverviewRow = {
  rep_id: string;
  rep_name: string;
  counts: { open: number; overdue: number; completed_today: number };
  meta?: any;
};

type RunnerResult = {
  ok: boolean;
  dry_run: boolean;
  limit: number;
  processed: number;
  created: number;
  duplicates: number;
  results: Array<{
    ok: boolean;
    dry_run: boolean;
    contact_id: string;
    health?: any;
    suggestion?: {
      type: string;
      title: string;
      due_at: string;
      importance: string;
      meta?: any;
    };
    created?: boolean;
    duplicate?: boolean;
    created_via?: string;
  }>;
  errors: Array<{ contact_id: string; error: string }>;
};

type LatestRunItem = {
  run_id: string;
  mode?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  totals?: any;
  meta?: any;
};

type LatestRunResponse = {
  ok: boolean;
  item: LatestRunItem | null;
  source?: string;
  error?: string;
};

async function proxyFetch(apiPath: string, init?: RequestInit) {
  const base =
    process.env.NEXT_PUBLIC_WEB_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";

  const cookieHeader = cookies().toString();

  // IMPORTANT: /api/proxy expects a leading slash path (e.g. /v1/...) — do not strip it.
  const safePath = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;

  const res = await fetch(
    `${base}/api/proxy?path=${encodeURIComponent(safePath)}`,
    {
      ...init,
      headers: {
        accept: "application/json",
        ...(init?.headers ?? {}),
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
      cache: "no-store",
    }
  );

  return res;
}

async function loadOverview(): Promise<{ ok: boolean; items: OverviewRow[]; mode?: string; error?: string }> {
  const res = await proxyFetch("/v1/crm/manager/overview");
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, items: [], error: json?.error ?? "overview_failed" };
  }
  return json;
}

async function loadLatestRun(): Promise<LatestRunResponse> {
  const res = await proxyFetch("/v1/crm/manager/auto-assign/runs/latest");
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, item: null, error: json?.error ?? "latest_run_failed" };
  }
  // Normalise shape
  return {
    ok: Boolean(json?.ok),
    item: (json?.item ?? null) as any,
    source: json?.source,
    error: json?.error,
  };
}

export default async function CrmManagerPage() {
  const overview = await loadOverview();
  const latestRun = await loadLatestRun();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-100">CRM Manager</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Overview + run auto-assign across recent contacts (dry-run first, then execute).
          </p>
        </div>

        <Link
          href="/crm/overview"
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
        >
          Back to CRM Overview
        </Link>
      </div>

      {/* Overview table */}
      <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-950">
        <div className="border-b border-neutral-800 px-4 py-3">
          <div className="text-sm font-medium text-neutral-200">
            Rep Overview {overview?.mode ? <span className="text-neutral-500">({overview.mode})</span> : null}
          </div>
        </div>

        <div className="p-4">
          {!overview.ok ? (
            <div className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">
              Failed to load overview: {overview.error ?? "unknown_error"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              {(() => {
                const sortedItems = [...(overview.items ?? [])]
                  .map((row) => {
                    const atRisk =
                      (row.counts?.overdue ?? 0) > 0 || (row.counts?.open ?? 0) > 10;
                    return { ...row, atRisk };
                  })
                  .sort((a, b) => {
                    // 1) atRisk first
                    if (a.atRisk !== b.atRisk) return a.atRisk ? -1 : 1;
                    // 2) overdue desc
                    const od = (b.counts?.overdue ?? 0) - (a.counts?.overdue ?? 0);
                    if (od !== 0) return od;
                    // 3) open desc
                    return (b.counts?.open ?? 0) - (a.counts?.open ?? 0);
                  });
                return (
                  <table className="w-full text-left text-sm">
                    <thead className="text-neutral-400">
                      <tr>
                        <th className="py-2 pr-3">Rep</th>
                        <th className="py-2 pr-3">Open</th>
                        <th className="py-2 pr-3">Overdue</th>
                        <th className="py-2 pr-3">Completed today</th>
                        <th className="py-2 pr-3">At risk</th>
                      </tr>
                    </thead>
                    <tbody className="text-neutral-200">
                      {sortedItems.map((r) => (
                        <tr key={r.rep_id} className="border-t border-neutral-900">
                          <td className="py-2 pr-3">
                            <Link
                              href={`/crm/actions?repId=${r.rep_id}&status=open`}
                              className="underline decoration-neutral-700 hover:decoration-neutral-300"
                            >
                              {r.rep_name}
                            </Link>
                          </td>
                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-2">
                              <span>{r.counts?.open ?? 0}</span>
                            </div>
                          </td>

                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-2">
                              <span>{r.counts?.overdue ?? 0}</span>
                              {(r.counts?.overdue ?? 0) > 0 && <StatusDot colour="red" />}
                            </div>
                          </td>

                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-2">
                              <span>{r.counts?.completed_today ?? 0}</span>
                              {(r.counts?.completed_today ?? 0) > 0 && (
                                <span title="Completed today">✅</span>
                              )}
                            </div>
                          </td>

                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-2">
                              {r.atRisk ? (
                                <>
                                  <StatusDot colour="amber" />
                                  <span className="text-amber-400 text-xs">At risk</span>
                                </>
                              ) : (
                                <span className="text-neutral-500">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Latest run */}
      <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-950">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
          <div className="text-sm font-medium text-neutral-200">Latest Auto-Assign Run</div>
          <div className="flex items-center gap-2">
            <Link
              href="/crm/manager/auto-assign"
              className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
            >
              Open runner
            </Link>
            <Link
              href="/crm/manager/auto-assign/runs"
              className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
            >
              View runs
            </Link>
          </div>
        </div>

        <div className="p-4">
          {!latestRun.ok ? (
            <div className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">
              Failed to load latest run: {latestRun.error ?? "unknown_error"}
            </div>
          ) : !latestRun.item ? (
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-sm text-neutral-200">No runs yet.</div>
              <div className="mt-1 text-sm text-neutral-400">
                Run a preview from the runner to generate your first run history entry.
              </div>
              <div className="mt-3">
                <Link
                  href="/crm/manager/auto-assign"
                  className="inline-flex rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
                >
                  Go to Auto-Assign Runner
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="text-sm text-neutral-200">
                <span className="text-neutral-400">run_id:</span>{" "}
                <Link
                  href={`/crm/manager/auto-assign/runs/${latestRun.item.run_id}`}
                  className="font-mono text-neutral-200 underline decoration-neutral-700 hover:decoration-neutral-300"
                >
                  {latestRun.item.run_id}
                </Link>
              </div>
              <div className="text-sm text-neutral-400">
                mode: <span className="text-neutral-200">{latestRun.item.mode ?? "—"}</span>
              </div>
              <div className="text-sm text-neutral-400">
                started: <span className="text-neutral-200">{latestRun.item.started_at ?? "—"}</span>
              </div>
              <div className="text-sm text-neutral-400">
                finished: <span className="text-neutral-200">{latestRun.item.finished_at ?? "—"}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Runner client */}
      <div className="mt-6">
        {overview.ok ? (
          <CrmManagerRunnerClient initial={overview} />
        ) : null}
      </div>
    </div>
  );
}