import { headers } from "next/headers";
import Link from "next/link";

type RunMeta = {
  version?: string;
  total_ms?: number;
  time_budget_ms?: number;
  aborted_reason?: string | null;
  timings?: {
    per_rep?: Array<{
      rep_id: string;
      fetch_contacts_ms?: number;
      processing_ms?: number;
      total_ms?: number;
    }>;
  };
  caps?: {
    contacts_per_rep?: number;
    max_total_contacts?: number;
  };
};

type RunTotals = {
  reps_considered?: number;
  contacts_considered?: number;
  actions_created?: number;
  skipped_dedupe?: number;
  errors?: number;
};

type RunItem = {
  run_id: string;
  mode: string | null;
  started_at: string | null;
  finished_at: string | null;
  totals: RunTotals | null;
  meta: RunMeta;
  source?: string | null;
  is_preview?: boolean;
  executed_from_preview_run_id?: string | null;
  executed_by_user_id?: string | null;
  executed_at?: string | null;
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

function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

async function apiGet(path: string) {
  const h = headers();
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}` as string, {
    headers: {
      "x-user-id": h.get("x-user-id") ?? "",
      "x-org-id": h.get("x-org-id") ?? "",
    },
    cache: "no-store",
  });

  const j = await res.json().catch(() => ({}));
  if (!res.ok || (j as any)?.ok === false) {
    const err = String((j as any)?.error ?? `HTTP ${res.status}`);
    throw new Error(err);
  }
  return j;
}

export default async function ManagerAutoAssignRunsPage({
  searchParams,
}: {
  searchParams?: { limit?: string; page?: string };
}) {
  const limitRaw = Number(searchParams?.limit ?? "25");
  const pageRaw = Number(searchParams?.page ?? "1");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 5), 50) : 25;
  const page = Number.isFinite(pageRaw) ? Math.max(pageRaw, 1) : 1;

  // NOTE: API is currently "limit-only". We do client-side paging until API adds offset/cursor.
  const [r, latestRes] = await Promise.all([
    apiGet(`/v1/crm/manager/auto-assign/runs?limit=${limit * page}`),
    apiGet(`/v1/crm/manager/auto-assign/runs/latest`).catch(() => ({ ok: true, item: null })),
  ]);

  const all: RunItem[] = Array.isArray((r as any)?.items) ? (r as any).items : [];
  const latest: RunItem | null = ((latestRes as any)?.item as any) ?? null;

  const start = (page - 1) * limit;
  const end = start + limit;
  const items = all.slice(start, end);

  const hasPrev = page > 1;
  const hasNext = all.length > end;

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Auto‑Assign runs</h1>
          <div className="text-sm text-neutral-500">
            Showing {items.length ? `${start + 1}–${Math.min(end, all.length)}` : "0"} of {all.length}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/crm/manager/auto-assign" className="text-sm text-blue-600 hover:underline">
            ← Back to overview
          </Link>
        </div>
      </header>

      <section className="rounded border p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Latest run</div>
            <div className="text-xs text-neutral-500">At-a-glance status for the most recent auto-assign run</div>
          </div>
          <Link href="/crm/manager/auto-assign/runs" className="text-sm text-blue-600 hover:underline">
            View all runs →
          </Link>
        </div>

        {!latest ? (
          <div className="mt-3 text-sm text-neutral-500">No runs yet.</div>
        ) : (
          (() => {
            const t = latest.totals ?? {};
            const meta = (latest as any).meta && typeof (latest as any).meta === "object" ? (latest as any).meta : {};
            const totalMs = n((meta as any).total_ms);
            const aborted = String((meta as any).aborted_reason ?? "").trim();

            return (
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded border p-3">
                  <div className="text-xs text-neutral-500">Run</div>
                  <div className="mt-1 flex items-center gap-2">
                    <Link
                      href={`/crm/manager/auto-assign/runs/${latest.run_id}`}
                      className="font-mono text-sm text-blue-600 hover:underline"
                      title={latest.run_id}
                    >
                      {shortId(latest.run_id)}
                    </Link>
                    {latest.is_preview ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                        preview
                      </span>
                    ) : null}
                    {latest.source ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-50 text-neutral-700 border border-neutral-200">
                        {latest.source}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 text-xs text-neutral-600">
                    <span className="text-neutral-500">Mode:</span> {latest.mode ?? "—"}
                  </div>
                  {latest.executed_from_preview_run_id ? (
                    <div className="mt-1 text-xs text-neutral-600">
                      <span className="text-neutral-500">From preview:</span> {shortId(latest.executed_from_preview_run_id)}
                    </div>
                  ) : null}
                </div>

                <div className="rounded border p-3">
                  <div className="text-xs text-neutral-500">Timing</div>
                  <div className="mt-1 text-sm">
                    <span className="text-neutral-600">Total:</span> <span className="font-medium">{totalMs}</span> ms
                  </div>
                  <div className="mt-2 text-xs text-neutral-600">
                    <span className="text-neutral-500">Started:</span> {fmtTs(latest.started_at)}
                  </div>
                  <div className="mt-1 text-xs text-neutral-600">
                    <span className="text-neutral-500">Finished:</span> {fmtTs(latest.finished_at)}
                  </div>
                  {aborted ? <div className="mt-2 text-xs text-amber-700">{aborted}</div> : null}
                </div>

                <div className="rounded border p-3">
                  <div className="text-xs text-neutral-500">Results</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-600">Created</span>
                      <span className="font-medium">{n((t as any).actions_created)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-600">Errors</span>
                      <span className={`font-medium ${n((t as any).errors) ? "text-amber-700" : ""}`}>{n((t as any).errors)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-600">Reps</span>
                      <span className="font-medium">{n((t as any).reps_considered)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-600">Contacts</span>
                      <span className="font-medium">{n((t as any).contacts_considered)}</span>
                    </div>
                    <div className="flex items-center justify-between col-span-2">
                      <span className="text-neutral-600">Skipped (dedupe)</span>
                      <span className="font-medium">{n((t as any).skipped_dedupe)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()
        )}
      </section>

      <div className="flex items-center justify-between">
        <div className="text-sm text-neutral-500">
          Tip: change page size with <code className="text-xs">?limit=10</code>
        </div>
        <div className="flex items-center gap-2">
          <Link
            aria-disabled={!hasPrev}
            className={`text-sm px-3 py-1 rounded border ${hasPrev ? "hover:bg-neutral-50" : "opacity-50 pointer-events-none"}`}
            href={`/crm/manager/auto-assign/runs?limit=${limit}&page=${page - 1}`}
          >
            Prev
          </Link>
          <div className="text-sm text-neutral-600">Page {page}</div>
          <Link
            aria-disabled={!hasNext}
            className={`text-sm px-3 py-1 rounded border ${hasNext ? "hover:bg-neutral-50" : "opacity-50 pointer-events-none"}`}
            href={`/crm/manager/auto-assign/runs?limit=${limit}&page=${page + 1}`}
          >
            Next
          </Link>
        </div>
      </div>

      <section className="rounded border p-4">
        {!items.length && <div className="text-sm text-neutral-500">No runs yet.</div>}

        {items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left text-neutral-600">
                  <th className="py-2 pr-3">Run</th>
                  <th className="py-2 pr-3">Mode</th>
                  <th className="py-2 pr-3">Started</th>
                  <th className="py-2 pr-3">Finished</th>
                  <th className="py-2 pr-3 text-right">Reps</th>
                  <th className="py-2 pr-3 text-right">Contacts</th>
                  <th className="py-2 pr-3 text-right">Created</th>
                  <th className="py-2 pr-3 text-right">Skipped</th>
                  <th className="py-2 pr-3 text-right">Errors</th>
                  <th className="py-2 pr-3 text-right">Total ms</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((x) => {
                  const t = x.totals ?? {};
                  const meta = (x as any).meta && typeof (x as any).meta === "object" ? (x as any).meta : {};
                  const totalMs = n((meta as any).total_ms);
                  const aborted = String((meta as any).aborted_reason ?? "").trim();

                  return (
                    <tr key={x.run_id} className="border-b">
                      <td className="py-2 pr-3 font-mono text-xs">{shortId(x.run_id)}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <span>{x.mode ?? "—"}</span>
                          {x.is_preview ? (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                              preview
                            </span>
                          ) : null}
                          {x.source ? (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-50 text-neutral-700 border border-neutral-200">
                              {x.source}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2 pr-3">{fmtTs(x.started_at)}</td>
                      <td className="py-2 pr-3">{fmtTs(x.finished_at)}</td>
                      <td className="py-2 pr-3 text-right">{n((t as any).reps_considered)}</td>
                      <td className="py-2 pr-3 text-right">{n((t as any).contacts_considered)}</td>
                      <td className="py-2 pr-3 text-right">{n((t as any).actions_created)}</td>
                      <td className="py-2 pr-3 text-right">{n((t as any).skipped_dedupe)}</td>
                      <td className="py-2 pr-3 text-right">{n((t as any).errors)}</td>
                      <td className="py-2 pr-3 text-right">
                        <div className="flex flex-col items-end">
                          <div>{totalMs}</div>
                          {aborted ? <div className="text-[11px] text-amber-700">{aborted}</div> : null}
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        <Link
                          href={`/crm/manager/auto-assign/runs/${x.run_id}`}
                          className="text-blue-600 hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}