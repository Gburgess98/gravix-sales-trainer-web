// src/app/crm/reps/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchJsonWithRetry } from "@/lib/fetchJsonwithretry";

type RecentCall = {
  id: string;
  created_at: string;
  score_overall: number | null;
  account_id: string | null;
};

type RepSummaryResp = {
  ok: boolean;
  userId: string;
  days: number;
  avg_score: number | null;
  calls: number;
  xp: number;
  topAccount: {
    id: string;
    name?: string | null;
  } | null;
  recent: RecentCall[];
  since: string;
};

type ManagerNudge = {
  contact_id: string;
  priority: number;
  action_counts?: { open?: number; overdue?: number; completed?: number };
  health?: {
    stats?: {
      last_contacted_days?: number | null;
    };
    next_action_severity?: string | null;
  };
};

type ManagerNudgesResp = {
  ok: boolean;
  nudges: ManagerNudge[];
};

function scoreColour(score?: number | null) {
  if (score == null) return "text-zinc-400";
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-amber-300";
  return "text-red-300";
}

export default function RepProfilePage() {
  const params = useParams<{ id: string }>();
  const repId = params?.id;
  const [data, setData] = useState<RepSummaryResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [ignoredNudges, setIgnoredNudges] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    if (!repId) return;

    (async () => {
      try {
        const [resp, nudgesResp] = await Promise.all([
          fetchJsonWithRetry<RepSummaryResp>(
            `/api/proxy/v1/dashboard/rep-summary?userId=${encodeURIComponent(
              String(repId)
            )}&days=90`
          ),
          // Fail-soft: this is optional UI signal; do not block the page.
          fetchJsonWithRetry<ManagerNudgesResp>(
            `/api/proxy/v1/crm/manager/nudges?limit=200`
          ).catch(() => null as any),
        ]);

        if (!alive) return;

        if (!resp || (resp as any).ok === false) {
          setErrorText("Unable to load rep summary.");
        } else {
          setData(resp);
        }

        // Compute an "ignored nudges" count. Definition (simple + stable):
        // - Overdue actions, OR
        // - Not contacted in 7+ days.
        // This is intentionally conservative and fail-soft.
        if (nudgesResp && (nudgesResp as any).ok !== false) {
          const items = Array.isArray((nudgesResp as any).nudges)
            ? ((nudgesResp as any).nudges as ManagerNudge[])
            : [];

          const ignored = items.filter((n) => {
            const overdue = Number(n?.action_counts?.overdue ?? 0);
            const lastDays =
              n?.health?.stats?.last_contacted_days == null
                ? null
                : Number(n.health.stats.last_contacted_days);
            const stale = typeof lastDays === "number" && Number.isFinite(lastDays) && lastDays >= 7;
            return overdue > 0 || stale;
          }).length;

          setIgnoredNudges(ignored);
        } else {
          setIgnoredNudges(null);
        }
      } catch (e) {
        console.error("rep-summary load failed", e);
        if (alive) setErrorText("Something went wrong loading this rep.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [repId]);

  const titleId = data?.userId ?? repId ?? "Unknown rep";

  return (
    <div className="max-w-5xl mx-auto py-10 px-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Rep · Profile</h1>
          <p className="text-sm text-neutral-400 mb-1">
            Snapshot of this rep&apos;s performance over the last 90 days.
          </p>
          <div className="text-xs text-neutral-500">
            Rep ID:{" "}
            <code className="text-neutral-200">
              {titleId}
            </code>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Link
            href={`/crm/actions?repId=${encodeURIComponent(
              String(repId ?? titleId)
            )}&status=open`}
            className="inline-flex items-center rounded-md border border-amber-600/60 bg-amber-600/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-600/20"
          >
            Open CRM Actions
          </Link>

          <Link
            href={`/sparring?repId=${encodeURIComponent(
              String(repId ?? titleId)
            )}&persona=price_sensitive`}
            className="inline-flex items-center rounded-md border border-emerald-600/60 bg-emerald-600/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-600/20"
          >
            AI Sparring
          </Link>
        </div>
      </div>

      {loading && (
        <div className="rounded-lg border border-neutral-800 p-4 text-sm text-neutral-300">
          Loading rep summary…
        </div>
      )}

      {!loading && errorText && (
        <div className="rounded-lg border border-red-700/70 bg-red-900/20 p-4 text-sm text-red-200">
          {errorText}
        </div>
      )}

      {!loading && !errorText && data && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
            <div className="rounded-lg border border-neutral-800 p-4">
              <div className="text-sm opacity-70">Total Calls</div>
              <div className="text-2xl font-semibold tabular-nums">
                {data.calls ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-neutral-800 p-4">
              <div className="text-sm opacity-70">Avg Score</div>
              <div
                className={`text-2xl font-semibold tabular-nums ${scoreColour(
                  data.avg_score
                )}`}
              >
                {typeof data.avg_score === "number"
                  ? Math.round(data.avg_score)
                  : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-neutral-800 p-4">
              <div className="text-sm opacity-70">XP</div>
              <div className="text-2xl font-semibold tabular-nums">
                {data.xp ?? 0} XP
              </div>
            </div>
            <div className="rounded-lg border border-neutral-800 p-4">
              <div className="text-sm opacity-70">Ignored Nudges</div>
              <div className="text-2xl font-semibold tabular-nums">
                {typeof ignoredNudges === "number" ? ignoredNudges : "—"}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Overdue or 7d+ untouched
              </div>
            </div>
          </div>

          {/* Top account */}
          <div className="mb-6 rounded-lg border border-neutral-800 p-4">
            <div className="text-sm opacity-70 mb-1">Top Account</div>
            {data.topAccount ? (
              <Link
                href={`/crm/accounts/${data.topAccount.id}`}
                className="text-sm underline"
              >
                {data.topAccount.name || data.topAccount.id}
              </Link>
            ) : (
              <div className="text-sm text-neutral-400">
                No account data yet.
              </div>
            )}
          </div>

          {/* Recent calls */}
          <div className="rounded-lg border border-neutral-800">
            <div className="px-4 py-3 border-b border-neutral-800 font-medium">
              Recent Calls
            </div>
            <div className="divide-y divide-neutral-800">
              {(!data.recent || data.recent.length === 0) && (
                <div className="px-4 py-4 text-sm text-neutral-400">
                  No recent calls for this rep.
                </div>
              )}
              {data.recent.map((c) => (
                <div
                  key={c.id}
                  className="px-4 py-3 flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-white/90 truncate">
                      Call {c.id.slice(0, 8)}…
                    </div>
                    <div className="text-xs text-white/50">
                      {new Date(c.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className={`text-sm tabular-nums ${scoreColour(
                        c.score_overall
                      )}`}
                    >
                      {typeof c.score_overall === "number"
                        ? Math.round(c.score_overall)
                        : "—"}
                    </div>
                    <Link
                      href={`/calls/${c.id}`}
                      className="text-xs underline text-white/70 hover:text-white"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="mt-6 text-sm">
        <Link
          href="/crm/overview"
          className="text-neutral-300 hover:underline hover:text-white"
        >
          ← Back to Overview
        </Link>
      </div>
    </div>
  );
}