// src/app/crm/manager/control-centre/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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

type ReportingSummaryResp = {
  ok: boolean;
  critical_calls_today?: number;
  critical_calls_this_week?: number;
  flagged_calls_this_week?: number;
  flagged_call_rate?: number;
  auto_assignments_created?: number;
  manual_assignments_created?: number;
  assignment_auto_rate?: number;
  assignment_completion_rate?: number;
  weakest_team_skill?: { skill?: string; count?: number } | null;
  weakest_skills?: Array<{ key?: string; label?: string; count?: number }>;
  review_flags_by_type?: Array<{ key?: string; label?: string; count?: number }>;
  review_flags_by_severity?: Array<{ key?: string; label?: string; count?: number }>;
  reps_needing_help?: Array<{
    rep_id: string;
    flagged_calls?: number;
    critical_calls?: number;
    open_assignments?: number;
    avg_score?: number | null;
    weakest_skill?: string | null;
  }>;
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

async function loadReportingSummary(): Promise<ReportingSummaryResp> {
  try {
    const res = await proxyFetch("/v1/dashboard/reporting-summary?days=7");
    const json = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) {
      return { ok: false, error: json?.error ?? "reporting_summary_failed" };
    }

    return {
      ok: Boolean(json?.ok),
      critical_calls_today: Number(json?.critical_calls_today ?? 0),
      critical_calls_this_week: Number(json?.critical_calls_this_week ?? 0),
      flagged_calls_this_week: Number(json?.flagged_calls_this_week ?? 0),
      flagged_call_rate: Number(json?.flagged_call_rate ?? 0),
      auto_assignments_created: Number(json?.auto_assignments_created ?? 0),
      manual_assignments_created: Number(json?.manual_assignments_created ?? 0),
      assignment_auto_rate: Number(json?.assignment_auto_rate ?? 0),
      assignment_completion_rate: Number(json?.assignment_completion_rate ?? 0),
      weakest_team_skill: json?.weakest_team_skill ?? null,
      weakest_skills: Array.isArray(json?.weakest_skills) ? json.weakest_skills : [],
      review_flags_by_type: Array.isArray(json?.review_flags_by_type) ? json.review_flags_by_type : [],
      review_flags_by_severity: Array.isArray(json?.review_flags_by_severity) ? json.review_flags_by_severity : [],
      reps_needing_help: Array.isArray(json?.reps_needing_help) ? json.reps_needing_help : [],
      error: json?.error,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "reporting_summary_failed" };
  }
}

function computeFallbackRiskScore(r: RepRiskRow) {
  const open = Number(r?.counts?.open ?? 0);
  const overdue = Number(r?.counts?.overdue ?? 0);
  // Simple urgency heuristic if API doesn't provide a risk_score.
  return overdue * 100 + open * 10;
}

function normaliseReasonLabel(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const cleaned = raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const map: Array<[RegExp, string]> = [
    [/objection/, "Objection handling"],
    [/weak close|closing|close/, "Closing"],
    [/discovery/, "Discovery"],
    [/intro|opening|opener/, "Intro"],
    [/follow up|follow-up/, "Follow-up discipline"],
    [/inactive|stale|no activity/, "Inactivity"],
    [/overdue/, "Overdue actions"],
    [/workload|too many open|open action/, "Workload"],
    [/pricing|price/, "Price objection"],
    [/next step|next-step/, "Next steps"],
  ];

  for (const [pattern, label] of map) {
    if (pattern.test(cleaned)) return label;
  }

  return cleaned
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function collectRepReasons(r: RepRiskRow): string[] {
  const direct = Array.isArray(r?.reasons) ? r.reasons : [];
  const metaReasons = Array.isArray((r as any)?.meta?.reasons) ? (r as any).meta.reasons : [];
  return [...direct, ...metaReasons]
    .map((x) => normaliseReasonLabel(String(x || "")))
    .filter(Boolean);
}

function titleCase(value: string) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function pickPrimaryIssueLabel(r: RepRiskRow): string {
  const explicit =
    String((r as any)?.recurring_objection ?? "").trim() ||
    String((r as any)?.top_objection ?? "").trim() ||
    String((r as any)?.primary_objection ?? "").trim();

  if (explicit) return explicit.toLowerCase();

  const reasons = collectRepReasons(r);
  const picked = reasons.find((reason) => {
    const lowered = reason.toLowerCase();
    return (
      lowered.includes("objection") ||
      lowered.includes("price") ||
      lowered.includes("closing") ||
      lowered.includes("discovery") ||
      lowered.includes("intro") ||
      lowered.includes("next steps")
    );
  });

  if (picked) return picked.toLowerCase();
  return reasons[0] ? String(reasons[0]).toLowerCase() : "";
}

function inferWeakestSkill(r: RepRiskRow): string {
  const direct = String((r as any)?.weakest_skill ?? (r as any)?.meta?.weakest_skill ?? "").trim();
  if (direct && direct.toLowerCase() !== "unknown") return direct;

  const breakdown = (r as any)?.skill_breakdown ?? (r as any)?.meta?.skill_breakdown;
  if (breakdown && typeof breakdown === "object") {
    const labelMap: Record<string, string> = {
      intro: "Intro",
      discovery: "Discovery",
      objection: "Objection handling",
      close: "Closing",
      closing: "Closing",
      price_handling: "Price handling",
      follow_up: "Follow-up discipline",
      execution: "Execution",
    };

    const scored = Object.entries(breakdown)
      .map(([key, value]) => ({ key, value: Number(value) }))
      .filter((x) => Number.isFinite(x.value) && labelMap[x.key]);

    if (scored.length) {
      scored.sort((a, b) => a.value - b.value);
      return labelMap[scored[0].key];
    }
  }

  const reasons = collectRepReasons(r);
  const joined = reasons.join(" | ").toLowerCase();

  if (joined.includes("objection")) return "Objection handling";
  if (joined.includes("closing") || joined.includes("next steps")) return "Closing";
  if (joined.includes("discovery")) return "Discovery";
  if (joined.includes("intro")) return "Intro";
  if (joined.includes("price objection")) return "Price handling";
  if (joined.includes("follow-up")) return "Follow-up discipline";
  if (joined.includes("inactivity")) return "Consistency";
  if (joined.includes("workload") || joined.includes("overdue actions")) return "Execution";

  const overdue = Number(r?.counts?.overdue ?? 0);
  const open = Number(r?.counts?.open ?? 0);

  if (overdue > 0) return "Execution";
  if (open > 6) return "Prioritisation";
  if (open > 0) return "Follow-up discipline";
  return "Unknown";
}

function recommendManagerAction(r: RepRiskRow) {
  const overdue = Number(r?.counts?.overdue ?? 0);
  const open = Number(r?.counts?.open ?? 0);
  const weak = inferWeakestSkill(r);
  const joined = collectRepReasons(r).join(" | ").toLowerCase();

  if (overdue > 0) return "Clear overdue actions first";
  if (joined.includes("objection")) return "Assign objection drill";
  if (weak === "Closing") return "Review weak close calls";
  if (weak === "Discovery") return "Coach discovery questions";
  if (weak === "Intro") return "Tighten opener";
  if (open > 6) return "Reduce workload and re-prioritise";
  if (weak === "Follow-up discipline") return "Set follow-up target";
  return "Review recent calls";
}

function recommendAssignment(r: RepRiskRow) {
  const weak = inferWeakestSkill(r);
  const joined = collectRepReasons(r).join(" | ").toLowerCase();

  if (joined.includes("price objection") || weak === "Price handling") {
    return "Assign: Price objection drill";
  }
  if (joined.includes("objection") || weak === "Objection handling") {
    return "Assign: Objection handling drill";
  }
  if (weak === "Closing" || joined.includes("next steps")) {
    return "Assign: Closing practice (next steps + urgency)";
  }
  if (weak === "Discovery") {
    return "Assign: Discovery question drill";
  }
  if (weak === "Intro") {
    return "Assign: Opener improvement drill";
  }
  if (weak === "Follow-up discipline" || weak === "Execution") {
    return "Assign: Follow-up task";
  }
  return "Assign: Review last 3 calls + feedback summary";
}

import { StatCard } from '@/components/ui/stat-card';
import { RiskBadge } from '@/components/ui/status-badge';

// Server action: best-effort create a rep follow-up task (fail-soft)
async function createRepFollowUpAction(formData: FormData) {
  "use server";

  const rep_id = String(formData.get("rep_id") ?? "").trim();
  const rep_name = String(formData.get("rep_name") ?? "Rep").trim() || "Rep";
  const filter = String(formData.get("filter") ?? "all").trim() || "all";

  if (!rep_id) {
    redirect(`/crm/manager/control-centre?filter=${encodeURIComponent(filter)}`);
  }

  try {
    // NOTE: This is best-effort. If your API enforces contact_id, it may reject.
    // We still fail-soft and return the user back to the page.
    await proxyFetch("/v1/crm/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rep_id,
        type: "follow_up",
        title: `Manager follow-up – ${rep_name}`,
        due_at: null,
        importance: "important",
        meta: { source: "manager_control_centre" },
      }),
    });
  } catch {
    // fail-soft
  }

  redirect(`/crm/manager/control-centre?filter=${encodeURIComponent(filter)}`);
}

// Server action: best-effort complete the most urgent open action for a rep (fail-soft)
async function completeRepTopAction(formData: FormData) {
  "use server";

  const rep_id = String(formData.get("rep_id") ?? "").trim();
  const filter = String(formData.get("filter") ?? "all").trim() || "all";

  if (!rep_id) {
    redirect(`/crm/manager/control-centre?filter=${encodeURIComponent(filter)}`);
  }

  try {
    // 1) Find the most urgent open action for this rep (best-effort)
    const listRes = await proxyFetch(
      `/v1/crm/actions?repId=${encodeURIComponent(rep_id)}&status=open&limit=1`,
      { method: "GET" }
    );
    const listJson = (await listRes.json().catch(() => ({}))) as any;

    const items: any[] = Array.isArray(listJson?.items)
      ? listJson.items
      : Array.isArray(listJson?.actions)
        ? listJson.actions
        : [];

    const actionId = String(items?.[0]?.id ?? "").trim();
    if (!actionId) {
      // Nothing to complete
      redirect(`/crm/manager/control-centre?filter=${encodeURIComponent(filter)}`);
    }

    // 2) Complete it
    await proxyFetch(`/v1/crm/actions/${encodeURIComponent(actionId)}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch {
    // fail-soft
  }

  redirect(`/crm/manager/control-centre?filter=${encodeURIComponent(filter)}`);
}

export default async function ControlCentrePage({
  searchParams,
}: {
  searchParams?: { filter?: string };
}) {
  const [data, reporting] = await Promise.all([
    loadControlCentre(),
    loadReportingSummary(),
  ]);

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
  const reportingByRep = new Map(
    (reporting.reps_needing_help ?? []).map((r) => [String(r.rep_id), r])
  );

  const recurringReasonCounts = Array.from(
    combined.reduce((acc, rep) => {
      const key = pickPrimaryIssueLabel(rep);
      if (!key) return acc;
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map<string, number>())
  ).sort((a, b) => b[1] - a[1]);

  const recurringObjections = recurringReasonCounts
    .filter(([label]) =>
      [
        "Objection handling",
        "Closing",
        "Discovery",
        "Intro",
        "Price objection",
        "Next steps",
      ].includes(label)
    )
    .slice(0, 6);

  const recurringOperationalIssues = recurringReasonCounts
    .filter(([label]) => !recurringObjections.some(([picked]) => picked === label))
    .slice(0, 6);

  const weakestSkills = Array.from(
    combined.reduce((acc, rep) => {
      const key = inferWeakestSkill(rep);
      if (!key || key === "Unknown") return acc;
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map<string, number>())
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const actionQueue = filtered.slice(0, 5).map((rep) => {
    const repId = String(rep.rep_id ?? "");
    const reportRow = reportingByRep.get(repId);
    const reportedWeakestSkill = String(reportRow?.weakest_skill ?? "").trim();
    const weakestSkill = reportedWeakestSkill || inferWeakestSkill(rep);

    return {
      rep_id: repId,
      rep_name: String(rep.rep_name ?? "Rep"),
      action: recommendManagerAction({ ...(rep as any), weakest_skill: weakestSkill }),
      weakest_skill: weakestSkill,
      overdue: Number(rep?.counts?.overdue ?? 0),
      open: Number(rep?.counts?.open ?? reportRow?.open_assignments ?? 0),
      flagged_calls: Number(reportRow?.flagged_calls ?? 0),
      critical_calls: Number(reportRow?.critical_calls ?? 0),
      avg_score: typeof reportRow?.avg_score === "number" ? reportRow.avg_score : null,
      rowHref: rep.rep_id ? `/crm/reps/${encodeURIComponent(String(rep.rep_id))}` : "/crm/reps",
      actionsHref: rep.rep_id
        ? `/crm/actions?repId=${encodeURIComponent(String(rep.rep_id))}&status=open`
        : "/crm/actions",
    };
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Coaching</p>
          <h1 className="mt-0.5 text-xl font-semibold text-white">Control Centre</h1>
          <p className="mt-0.5 text-sm text-neutral-400">
            Answer 3 questions fast: who needs help, what they are bad at, what to assign next.
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
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <StatCard label="Reps tracked" value={repsTotal} />
            <StatCard label="At risk" value={repsRisk} variant="danger" />
            <StatCard label="Watch" value={repsWatch} variant="warning" />
            <StatCard label="Overdue actions" value={overdueTotal} variant={overdueTotal > 0 ? "danger" : "default"} />
            <StatCard label="Open actions" value={openTotal} />
            <StatCard label="Critical calls today" value={reporting.critical_calls_today ?? 0} variant={reporting.critical_calls_today ? "danger" : "default"} />
            <StatCard label="Flagged calls 7d" value={reporting.flagged_calls_this_week ?? 0} variant={reporting.flagged_calls_this_week ? "warning" : "default"} />
            <StatCard label="Auto assignments" value={reporting.auto_assignments_created ?? 0} variant="info" />
          </div>

          {/* Daily control centre insights */}
          <div className="grid gap-4 xl:grid-cols-3 items-stretch">
            <div className="flex h-full flex-col rounded-xl border border-neutral-800 bg-neutral-950">
              <div className="min-h-[76px] border-b border-neutral-800 px-4 py-3">
                <div className="text-sm font-semibold text-neutral-100">1. Who needs help?</div>
                <div className="text-xs text-neutral-500">Top five reps to coach right now.</div>
              </div>
              <div className="flex-1 p-4 space-y-3">
                {actionQueue.length === 0 ? (
                  <div className="text-sm text-neutral-400">No reps need intervention right now.</div>
                ) : (
                  actionQueue.map((item, idx) => {
                    const source = filtered[idx] ?? ({} as RepRiskRow);
                    const sourceScore = Number((source as any)?._score ?? 0);
                    const isCritical = item.critical_calls > 0 || item.overdue > 0 || sourceScore >= 150;
                    const urgencyLabel = isCritical ? "Critical" : "Watch";
                    const urgencyCls = isCritical ? "text-red-300" : "text-amber-300";

                    return (
                      <div key={`${item.rep_id}-${idx}`} className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-neutral-100">{item.rep_name}</div>
                            <div className="mt-1 text-xs text-neutral-400">
                              Weakest skill: <span className="text-neutral-200">{item.weakest_skill}</span>
                            </div>
                            <div className="mt-1 text-[11px] text-neutral-500">
                              Flags: <span className="text-neutral-300">{item.flagged_calls}</span>
                              <span className="mx-1 text-neutral-700">•</span>
                              Critical: <span className="text-red-200">{item.critical_calls}</span>
                              {typeof item.avg_score === "number" ? (
                                <>
                                  <span className="mx-1 text-neutral-700">•</span>
                                  Avg: <span className="text-neutral-300">{item.avg_score}</span>
                                </>
                              ) : null}
                            </div>
                          </div>
                          <div className="text-right text-[11px] text-neutral-500">
                            <div>Overdue: <span className="text-neutral-200">{item.overdue}</span></div>
                            <div>Open: <span className="text-neutral-200">{item.open}</span></div>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <div className="text-xs font-medium text-amber-200">{item.action}</div>
                          <div className={`text-[11px] font-semibold uppercase tracking-wide ${urgencyCls}`}>
                            {urgencyLabel}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            href={item.rowHref}
                            className="rounded-md bg-indigo-600/20 px-2 py-1 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30"
                          >
                            View rep
                          </Link>
                          <Link
                            href={item.actionsHref}
                            className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
                          >
                            Open actions
                          </Link>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div className="flex h-full flex-col rounded-xl border border-neutral-800 bg-neutral-950">
              <div className="min-h-[76px] border-b border-neutral-800 px-4 py-3">
                <div className="text-sm font-semibold text-neutral-100">2. What are they bad at?</div>
                <div className="text-xs text-neutral-500">Most repeated weaknesses and objections across flagged reps.</div>
              </div>
              <div className="flex-1 p-4 space-y-3">
                {recurringObjections.length === 0 ? (
                  recurringOperationalIssues.length === 0 ? (
                    <div className="text-sm text-neutral-400">No recurring objections detected yet.</div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-xs uppercase tracking-wide text-neutral-500">Operational signals</div>
                      {recurringOperationalIssues.map(([label, count]) => (
                        <div key={label} className="space-y-1">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-neutral-200">{titleCase(label)}</span>
                            <span className="text-xs font-semibold text-neutral-400">{count}</span>
                          </div>
                          <div className="h-2 rounded-full bg-neutral-900 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-neutral-500/70"
                              style={{ width: `${Math.min(100, Math.max(8, count * 14))}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  recurringObjections.map(([label, count]) => (
                    <div key={label} className="space-y-1">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-neutral-200">{titleCase(label)}</span>
                        <span className="text-xs font-semibold text-neutral-400">{count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-neutral-900 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-400/70"
                          style={{ width: `${Math.min(100, Math.max(8, count * 14))}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex h-full flex-col rounded-xl border border-neutral-800 bg-neutral-950">
              <div className="min-h-[76px] border-b border-neutral-800 px-4 py-3">
                <div className="text-sm font-semibold text-neutral-100">3. What should I assign?</div>
                <div className="text-xs text-neutral-500">Translate the coaching gap into the clearest next drill or action.</div>
              </div>
              <div className="flex-1 p-4 space-y-3">
                {actionQueue.length === 0 ? (
                  <div className="text-sm text-neutral-400">No assignment recommendations available yet.</div>
                ) : (
                  actionQueue.map((item, idx) => (
                    <div
                      key={`${item.rep_id}-${idx}`}
                      className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-neutral-100">{item.rep_name}</div>
                          <div className="mt-1 text-[11px] text-neutral-500">
                            Weakest skill: <span className="text-neutral-300">{item.weakest_skill}</span>
                          </div>
                          <div className="mt-1 text-[11px] text-neutral-500">
                            Critical calls: <span className="text-red-200">{item.critical_calls}</span>
                            <span className="mx-1 text-neutral-700">•</span>
                            Flagged: <span className="text-neutral-300">{item.flagged_calls}</span>
                          </div>
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          Open: <span className="text-neutral-200">{item.open}</span>
                        </div>
                      </div>
                      <div className="mt-2 text-sm font-semibold text-indigo-200">
                        {recommendAssignment(filtered[idx] ?? ({} as RepRiskRow))}
                      </div>
                      <div className="mt-1 text-[11px] text-neutral-500">Suggested next coaching action</div>
                    </div>
                  ))
                )}
              </div>
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
                <table className="w-full table-fixed text-sm">
                  <thead className="text-xs text-neutral-500">
                    <tr className="border-b border-neutral-900">
                      <th className="w-[24%] px-4 py-3 text-left font-medium">Rep</th>
                      <th className="w-[10%] px-4 py-3 text-left font-medium">Urgency</th>
                      <th className="w-[7%] px-4 py-3 text-right font-medium">Risk</th>
                      <th className="w-[7%] px-4 py-3 text-right font-medium">Overdue</th>
                      <th className="w-[7%] px-4 py-3 text-right font-medium">Open</th>
                      <th className="w-[8%] px-4 py-3 text-right font-medium">Done today</th>
                      <th className="w-[18%] px-4 py-3 text-left font-medium">Top reasons</th>
                      <th className="w-[19%] px-4 py-3 text-right font-medium">Quick actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 20).map((r) => {
                      const repId = String(r?.rep_id ?? "");
                      const repName = String(r?.rep_name ?? "Rep");

                      const riskBand = String(r?.risk_band ?? r._band ?? "unknown");

                      const open = Number(r?.counts?.open ?? 0);
                      const overdue = Number(r?.counts?.overdue ?? 0);
                      const doneToday = Number(r?.counts?.completed_today ?? 0);

                      const reasons: string[] = Array.isArray(r?.reasons)
                        ? r.reasons
                        : Array.isArray((r as any)?.meta?.reasons)
                          ? (r as any).meta.reasons
                          : [];
                      const topReasons = reasons.filter(Boolean).slice(0, 3);
                      const weakestSkill = inferWeakestSkill(r);
                      const recommendedAssignment = recommendAssignment(r);

                      const primaryReason =
                        String((r as any)?.reason ?? "").trim() ||
                        (overdue > 0
                          ? "Overdue actions building up"
                          : open > 6
                            ? "High action load"
                            : open > 0
                              ? "Activity imbalance"
                              : "");

                      const activityLabel =
                        String((r as any)?.activity_label ?? (r as any)?.meta?.activity_label ?? "").trim() ||
                        "No activity data";

                      const activityScore = Number(
                        (r as any)?.activity_score ?? (r as any)?.meta?.activity_score ?? 0
                      );

                      const lastActivity =
                        (r as any)?.meta?.last_active_at ??
                        (r as any)?.last_activity_at ??
                        null;

                      const lastLoginAt = (r as any)?.meta?.last_login_at ?? null;
                      const lastCallAt = (r as any)?.meta?.last_call_at ?? null;

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
                            <div className="min-w-0 max-w-[320px]">
                              <Link
                                href={rowHref}
                                className="block truncate font-medium text-neutral-100 hover:underline"
                              >
                                {repName}
                              </Link>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                                <span>Activity: {activityLabel}</span>
                                <RiskBadge band={riskBand} />
                                {activityScore > 0 ? (
                                  <span className="rounded-full border border-neutral-700 bg-neutral-900/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-200">
                                    Score {Math.round(activityScore)}
                                  </span>
                                ) : null}
                                {showInactive ? (
                                  <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-200">
                                    Inactive
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1 text-[11px] text-neutral-500">
                                Last call: <span className="text-neutral-300">{relTime(lastCallAt)}</span>
                                <span className="mx-1 text-neutral-700">•</span>
                                Last login: <span className="text-neutral-300">{relTime(lastLoginAt)}</span>
                              </div>
                              {primaryReason ? (
                                <div className="mt-1 text-xs font-medium text-neutral-300">
                                  {primaryReason}
                                </div>
                              ) : null}
                              {weakestSkill && weakestSkill !== "Unknown" ? (
                                <>
                                  <div className="mt-1 text-[11px] text-neutral-500">
                                    Weakest skill: <span className="text-neutral-300">{weakestSkill}</span>
                                  </div>
                                  <div className="mt-1 text-[11px] text-neutral-500">
                                    Assign next: <span className="text-neutral-300">{recommendedAssignment}</span>
                                  </div>
                                </>
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

                          <td className="px-4 py-3 align-top">
                            <div className="flex flex-wrap justify-end gap-2 max-w-[260px] ml-auto">
                              {/* Inline create follow-up (best-effort, fail-soft) */}
                              <form action={createRepFollowUpAction}>
                                <input type="hidden" name="rep_id" value={repId} />
                                <input type="hidden" name="rep_name" value={repName} />
                                <input type="hidden" name="filter" value={activeFilter} />
                                <button
                                  type="submit"
                                  className="rounded-md bg-emerald-600/20 px-2 py-1 text-xs font-semibold text-emerald-200 hover:bg-emerald-600/30"
                                >
                                  + Follow-up
                                </button>
                              </form>

                              {/* Best-effort: complete top open action for this rep (fail-soft) */}
                              <form action={completeRepTopAction}>
                                <input type="hidden" name="rep_id" value={repId} />
                                <input type="hidden" name="filter" value={activeFilter} />
                                <button
                                  type="submit"
                                  className="rounded-md bg-amber-600/20 px-2 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-600/30"
                                  title="Completes the most urgent open action for this rep (best-effort)"
                                >
                                  ✓ Complete top
                                </button>
                              </form>

                              {/* View scoped open actions */}
                              <Link
                                href={actionsHref}
                                className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
                              >
                                Open actions
                              </Link>

                              {/* Deep rep view */}
                              <Link
                                href={rowHref}
                                className="rounded-md bg-indigo-600/20 px-2 py-1 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30"
                              >
                                View
                              </Link>
                              <Link
                                href={repId
                                  ? `/admin/assignments?repId=${encodeURIComponent(repId)}&repName=${encodeURIComponent(repName)}&source=control-centre`
                                  : "/admin/assignments"
                                }
                                className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
                              >
                                Assign drill
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