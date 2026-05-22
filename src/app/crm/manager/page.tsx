// src/app/crm/manager/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";
import ManagerClient from "./ManagerClient";


type OverviewRow = {
  rep_id: string;
  rep_name: string;
  counts: { open: number; overdue: number; completed_today: number };
  meta?: any;
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

  const managerInitial = overview?.ok
    ? overview
    : { ok: true, items: [], mode: "fallback", error: overview?.error };

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-white">Team</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Overview + run auto-assign across recent contacts (dry-run first, then execute).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/crm/manager/control-centre"
            className="rounded-lg bg-indigo-600/20 px-3 py-2 text-sm font-semibold text-indigo-200 hover:bg-indigo-600/30"
          >
            Open Control Centre
          </Link>

          <Link
            href="/crm/overview"
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            Back to CRM Overview
          </Link>
        </div>
      </div>

      {!overview.ok ? (
        <div className="mt-6 rounded-lg border border-amber-800 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
          Manager overview failed to load: {overview.error ?? "overview_failed"}. Core manager controls are still available below.
        </div>
      ) : null}

      {/* Manager client */}
      <div className="mt-6">
        <ManagerClient initial={managerInitial} />
      </div>
    </div>
  );
}