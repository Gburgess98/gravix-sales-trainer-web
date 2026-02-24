// src/app/crm/manager/control-centre/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

type Headline = {
  reps_total?: number;
  reps_at_risk?: number;
  reps_watch?: number;
  overdue_actions_total?: number;
  open_actions_total?: number;
  window_days?: number;
  since?: string;
};

type RepRiskRow = {
  rep_id: string;
  rep_name: string;
  risk_band?: "at_risk" | "watch" | "healthy" | string;
  risk_score?: number;
  reasons?: string[];
  counts?: {
    open?: number;
    overdue?: number;
    completed_today?: number;
  };
  meta?: any;
  last_activity_at?: string | null;
};

type ControlCentreResp = {
  ok: boolean;
  headline?: Headline;
  reps_all?: RepRiskRow[];
  reps_at_risk?: RepRiskRow[];
  reps_watch?: RepRiskRow[];
  reps_ok?: RepRiskRow[];
  error?: string;
};

function relTime(iso?: string | null) {
  if (!iso) return "—";
  const t = new Date(String(iso)).getTime();
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function bandPill(band?: string) {
  const b = String(band ?? "").toLowerCase();
  const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";
  if (b === "at_risk" || b === "risk" || b === "red") {
    return { cls: `${base} border-red-500/30 bg-red-500/10 text-red-200`, label: "AT RISK" };
  }
  if (b === "watch" || b === "warning" || b === "amber") {
    return { cls: `${base} border-amber-500/30 bg-amber-500/10 text-amber-200`, label: "WATCH" };
  }
  if (b === "healthy" || b === "green") {
    return { cls: `${base} border-emerald-500/30 bg-emerald-500/10 text-emerald-200`, label: "HEALTHY" };
  }
  return { cls: `${base} border-neutral-700 bg-neutral-900/40 text-neutral-200`, label: (band ? String(band) : "UNKNOWN").toUpperCase() };
}

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

async function loadControlCentre(): Promise<ControlCentreResp> {
  try {
    const res = await proxyFetch("/v1/crm/manager/control-centre?days=7&limit=20");
    const json = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) {
      return { ok: false, error: json?.error ?? "control_centre_failed" };
    }

    return {
      ok: Boolean(json?.ok),
      headline: (json?.headline ?? null) || undefined,
      reps_all: Array.isArray(json?.reps_all) ? json.reps_all : [],
      reps_at_risk: Array.isArray(json?.reps_at_risk) ? json.reps_at_risk : [],
      reps_watch: Array.isArray(json?.reps_watch) ? json.reps_watch : [],
      reps_ok: Array.isArray(json?.reps_ok) ? json.reps_ok : [],
      error: json?.error,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "control_centre_failed" };
  }
}

function computeFallbackRiskScore(r: RepRiskRow) {
  const open = Number(r?.counts?.open ?? 0);
  const overdue = Number(r?.counts?.overdue ?? 0);
  // Simple urgency heuristic if API doesn't provide a risk_score.
  return overdue * 100 + open * 10;
}

export default async function ControlCentrePage({
  searchParams,
}: {
  searchParams?: { filter?: string };
}) {
  const data = await loadControlCentre();

  const headline = data.headline ?? {};
  const windowDays = Number(headline.window_days ?? 7);

  const combined: Array<
    RepRiskRow & { _band: "at_risk" | "watch" | "healthy" | "unknown"; _score: number }
  > = [];

  for (const x of data.reps_all ?? []) {
    const s = Number((x as any)?.risk_score);
    const bandRaw = String((x as any)?.risk_band ?? "unknown").toLowerCase();

    const band: "at_risk" | "watch" | "healthy" | "unknown" =
      bandRaw === "at_risk"
        ? "at_risk"
        : bandRaw === "watch"
          ? "watch"
          : bandRaw === "healthy"
            ? "healthy"
            : "unknown";

    combined.push({
      ...(x as any),
      _band: band,
      _score: Number.isFinite(s) ? s : computeFallbackRiskScore(x),
    });
  }

  // Highest risk first, then overdue, then open.
  combined.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    const bo = Number(b?.counts?.overdue ?? 0);
    const ao = Number(a?.counts?.overdue ?? 0);
    if (bo !== ao) return bo - ao;
    const bopen = Number(b?.counts?.open ?? 0);
    const aopen = Number(a?.counts?.open ?? 0);
    return bopen - aopen;
  });

  const activeFilter = String(searchParams?.filter ?? "all").toLowerCase();

  const filtered =
    activeFilter === "at_risk"
      ? combined.filter((r) => r._band === "at_risk")
      : activeFilter === "watch"
        ? combined.filter((r) => r._band === "watch")
        : activeFilter === "healthy"
          ? combined.filter((r) => r._band === "healthy")
          : combined;

  const repsTotal = Number(headline.reps_total ?? combined.length ?? 0);
  const repsRisk = Number(headline.reps_at_risk ?? 0);
  const repsWatch = Number(headline.reps_watch ?? 0);
  const openTotal = Number(headline.open_actions_total ?? 0);
  const overdueTotal = Number(headline.overdue_actions_total ?? 0);

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-100">Manager Control Centre</h1>
          <p className="mt-1 text-sm text-neutral-400">
            The highest-impact fixes first — risk signals across the last {windowDays} days.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/crm/manager"
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            ← Back to Manager
          </Link>
          <Link
            href="/crm/overview"
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
          >
            CRM Overview
          </Link>
        </div>
      </div>

      {!data.ok ? (
        <div className="rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-200">
          Failed to load control centre: {data.error ?? "unknown_error"}
        </div>
      ) : (
        <>
          {/* Headline */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs text-neutral-500">Reps tracked</div>
              <div className="mt-1 text-2xl font-semibold text-neutral-100">{repsTotal}</div>
            </div>
            <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-4">
              <div className="text-xs text-red-200/70">At risk</div>
              <div className="mt-1 text-2xl font-semibold text-red-100">{repsRisk}</div>
            </div>
            <div className="rounded-xl border border-amber-900/40 bg-amber-950/15 p-4">
              <div className="text-xs text-amber-200/70">Watch</div>
              <div className="mt-1 text-2xl font-semibold text-amber-100">{repsWatch}</div>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs text-neutral-500">Open actions</div>
              <div className="mt-1 text-2xl font-semibold text-neutral-100">{openTotal}</div>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs text-neutral-500">Overdue actions</div>
              <div className="mt-1 text-2xl font-semibold text-neutral-100">{overdueTotal}</div>
            </div>
          </div>

          {/* Decision table */}
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: "all", label: "All" },
              { key: "at_risk", label: "At Risk" },
              { key: "watch", label: "Watch" },
              { key: "healthy", label: "Healthy" },
            ].map((f) => {
              const isActive = activeFilter === f.key;
              return (
                <Link
                  key={f.key}
                  href={`/crm/manager/control-centre?filter=${f.key}`}
                  className={
                    "rounded-full border px-3 py-1 text-xs font-semibold transition " +
                    (isActive
                      ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-200"
                      : "border-neutral-800 bg-neutral-950 text-neutral-300 hover:bg-neutral-900")
                  }
                >
                  {f.label}
                </Link>
              );
            })}
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-neutral-100">Highest risk first</div>
                <div className="text-xs text-neutral-500">
                  Click a rep to act — open actions, overdue, and the top reasons.
                </div>
              </div>
              <div className="text-xs text-neutral-500">Showing {Math.min(filtered.length, 20)} reps</div>
            </div>

            {filtered.length === 0 ? (
              <div className="p-4 text-sm text-neutral-400">No reps flagged in this window.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-neutral-500">
                    <tr className="border-b border-neutral-900">
                      <th className="px-4 py-3 text-left font-medium">Rep</th>
                      <th className="px-4 py-3 text-left font-medium">Urgency</th>
                      <th className="px-4 py-3 text-right font-medium">Risk</th>
                      <th className="px-4 py-3 text-right font-medium">Overdue</th>
                      <th className="px-4 py-3 text-right font-medium">Open</th>
                      <th className="px-4 py-3 text-right font-medium">Done today</th>
                      <th className="px-4 py-3 text-left font-medium">Top reasons</th>
                      <th className="px-4 py-3 text-right font-medium">Quick actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 20).map((r) => {
                      const repId = String(r?.rep_id ?? "");
                      const repName = String(r?.rep_name ?? "Rep");

                      const pill = bandPill(r?.risk_band ?? r._band);

                      const open = Number(r?.counts?.open ?? 0);
                      const overdue = Number(r?.counts?.overdue ?? 0);
                      const doneToday = Number(r?.counts?.completed_today ?? 0);

                      const reasons: string[] = Array.isArray(r?.reasons)
                        ? r.reasons
                        : Array.isArray((r as any)?.meta?.reasons)
                          ? (r as any).meta.reasons
                          : [];
                      const topReasons = reasons.filter(Boolean).slice(0, 3);

                      const primaryReason =
                        String((r as any)?.reason ?? "").trim() ||
                        (overdue > 0
                          ? "Overdue actions building up"
                          : open > 6
                            ? "High action load"
                            : open > 0
                              ? "Activity imbalance"
                              : "");

                      const lastActivity =
                        (r as any)?.last_activity_at ??
                        (r as any)?.meta?.last_activity_at ??
                        null;

                      const inactiveDays =
                        lastActivity && Number.isFinite(new Date(String(lastActivity)).getTime())
                          ? Math.floor((Date.now() - new Date(String(lastActivity)).getTime()) / (1000 * 60 * 60 * 24))
                          : null;

                      const showInactive = typeof inactiveDays === "number" && inactiveDays > 7;

                      // Urgency label tuned for manager actionability.
                      const urgency = overdue > 0 ? "Needs attention" : open > 6 ? "High workload" : open > 0 ? "In progress" : "Clear";
                      const urgencyCls =
                        overdue > 0
                          ? "border-red-500/30 bg-red-500/10 text-red-200"
                          : open > 6
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                            : open > 0
                              ? "border-neutral-700 bg-neutral-900/40 text-neutral-200"
                              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";

                      const rowHref = repId ? `/crm/reps/${encodeURIComponent(repId)}` : "/crm/reps";
                      const actionsHref = repId
                        ? `/crm/actions?repId=${encodeURIComponent(repId)}&status=open`
                        : "/crm/actions";

                      return (
                        <tr
                          key={repId || repName}
                          className="border-b border-neutral-900 hover:bg-neutral-900/40"
                        >
                          {/* Click-anywhere row: put a link over the rep cell and style it like a row anchor */}
                          <td className="px-4 py-3">
                            <div className="min-w-0">
                              <Link
                                href={rowHref}
                                className="block truncate font-medium text-neutral-100 hover:underline"
                              >
                                {repName}
                              </Link>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                                <span>Last activity: {relTime(lastActivity)}</span>
                                <span className={pill.cls}>{pill.label}</span>
                                {showInactive ? (
                                  <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-200">
                                    Inactive
                                  </span>
                                ) : null}
                              </div>
                              {primaryReason ? (
                                <div className="mt-1 text-xs font-medium text-neutral-300">
                                  {primaryReason}
                                </div>
                              ) : null}
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <span
                              className={
                                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                                urgencyCls
                              }
                            >
                              {urgency}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-right">
                            {(() => {
                              const score = Math.round(Number(r._score ?? 0));
                              const cls =
                                score > 150
                                  ? "text-red-300"
                                  : score >= 80
                                    ? "text-amber-300"
                                    : "text-neutral-100";
                              return (
                                <span className={`font-semibold ${cls}`}>
                                  {score}
                                </span>
                              );
                            })()}
                          </td>

                          <td className="px-4 py-3 text-right">
                            <span
                              className={
                                overdue > 0
                                  ? "rounded-md bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-200"
                                  : "text-neutral-200"
                              }
                            >
                              {overdue}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-right text-neutral-200">{open}</td>

                          <td className="px-4 py-3 text-right">
                            <span
                              className={
                                doneToday > 0
                                  ? "rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-200"
                                  : "text-neutral-200"
                              }
                            >
                              {doneToday}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            {topReasons.length ? (
                              <div className="flex flex-wrap gap-2">
                                {topReasons.map((x, i) => (
                                  <span
                                    key={i}
                                    className="rounded-full border border-neutral-800 bg-neutral-900/40 px-2 py-0.5 text-[11px] text-neutral-200"
                                  >
                                    {String(x)}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div className="text-xs text-neutral-500">—</div>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              {/* Inline create follow-up */}
                              <form
                                method="POST"
                                action={`/api/proxy?path=${encodeURIComponent("/v1/crm/actions")}`}
                              >
                                <input type="hidden" name="rep_id" value={repId} />
                                <input
                                  type="hidden"
                                  name="title"
                                  value={`Follow up with rep – ${repName}`}
                                />
                                <input type="hidden" name="importance" value="important" />
                                <button
                                  type="submit"
                                  className="rounded-md bg-emerald-600/20 px-2 py-1 text-xs font-semibold text-emerald-200 hover:bg-emerald-600/30"
                                >
                                  + Follow-up
                                </button>
                              </form>

                              {/* Clear oldest overdue (if any) */}
                              {overdue > 0 ? (
                                <form
                                  method="POST"
                                  action={`/api/proxy?path=${encodeURIComponent("/v1/crm/actions/complete-oldest")}`}
                                >
                                  <input type="hidden" name="rep_id" value={repId} />
                                  <button
                                    type="submit"
                                    className="rounded-md bg-red-600/20 px-2 py-1 text-xs font-semibold text-red-200 hover:bg-red-600/30"
                                  >
                                    ✓ Clear overdue
                                  </button>
                                </form>
                              ) : null}

                              <Link
                                href={actionsHref}
                                className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
                              >
                                Open actions
                              </Link>

                              <Link
                                href={rowHref}
                                className="rounded-md bg-indigo-600/20 px-2 py-1 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30"
                              >
                                View
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="text-xs text-neutral-500">
            Tip: the defaults are tuned for urgency (risk score → overdue → open). When you add more reps, this becomes your daily prioritisation engine.
          </div>
        </>
      )}
    </div>
  );
}