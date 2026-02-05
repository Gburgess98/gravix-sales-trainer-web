// src/app/crm/manager/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";
import CrmManagerRunnerClient from "./CrmManagerRunnerClient";

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

export default async function CrmManagerPage() {
  const overview = await loadOverview();

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
              <table className="w-full text-left text-sm">
                <thead className="text-neutral-400">
                  <tr>
                    <th className="py-2 pr-3">Rep</th>
                    <th className="py-2 pr-3">Open</th>
                    <th className="py-2 pr-3">Overdue</th>
                    <th className="py-2 pr-3">Completed today</th>
                  </tr>
                </thead>
                <tbody className="text-neutral-200">
                  {(overview.items ?? []).map((r) => (
                    <tr key={r.rep_id} className="border-t border-neutral-900">
                      <td className="py-2 pr-3">{r.rep_name}</td>
                      <td className="py-2 pr-3">{r.counts?.open ?? 0}</td>
                      <td className="py-2 pr-3">{r.counts?.overdue ?? 0}</td>
                      <td className="py-2 pr-3">{r.counts?.completed_today ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Runner client */}
      <div className="mt-6">
        <CrmManagerRunnerClient initial={overview} />
      </div>
    </div>
  );
}