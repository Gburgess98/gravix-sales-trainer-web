"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { WorkspaceTabs } from "@/components/shell/workspace-tabs";
import { fetchJsonWithRetry } from "@/lib/fetchJsonwithretry";

type RepTab = "overview" | "coaching" | "activity";

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
  topAccount: { id: string; name?: string | null } | null;
  recent: RecentCall[];
  since: string;
};

type ManagerNudge = {
  contact_id: string;
  priority: number;
  action_counts?: { open?: number; overdue?: number; completed?: number };
  health?: {
    stats?: { last_contacted_days?: number | null };
    next_action_severity?: string | null;
  };
};

type RepOpenAction = {
  id: string;
  title: string;
  status?: string | null;
  due_at?: string | null;
  created_at?: string | null;
  importance?: string | null;
  contact_id?: string | null;
};

function scoreColour(score?: number | null) {
  if (score == null) return "text-zinc-400";
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-300";
  return "text-red-300";
}

function riskBandClass(band?: string) {
  const b = String(band ?? "").toLowerCase();
  if (b === "at_risk")
    return "border-red-500/30 bg-red-500/10 text-red-300";
  if (b === "watch")
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
}

export default function RepProfilePage() {
  const { id: repId } = useParams() as { id: string };
  const [tab, setTab] = useState<RepTab>("overview");

  const [data, setData] = useState<RepSummaryResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [ignoredNudges, setIgnoredNudges] = useState<number | null>(null);
  const [intelligence, setIntelligence] = useState<any | null>(null);

  const [openActions, setOpenActions] = useState<RepOpenAction[] | null>(null);
  const [loadingOpenActions, setLoadingOpenActions] = useState(false);
  const [openActionsErr, setOpenActionsErr] = useState<string | null>(null);

  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [followUpTitle, setFollowUpTitle] = useState("Follow up");
  const [creatingFollowUp, setCreatingFollowUp] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const [completingIds, setCompletingIds] = useState<Record<string, boolean>>({});
  const [completeErr, setCompleteErr] = useState<string | null>(null);

  const loadOpenActions = useCallback(async (rid: string) => {
    setLoadingOpenActions(true);
    setOpenActionsErr(null);
    try {
      const resp: any = await fetchJsonWithRetry<any>(
        `/api/proxy/v1/crm/actions?repId=${encodeURIComponent(String(rid))}&status=open&limit=5`
      );
      const items: any[] = Array.isArray(resp?.items)
        ? resp.items
        : Array.isArray(resp?.actions)
          ? resp.actions
          : [];

      const shaped: RepOpenAction[] = items
        .map((x: any) => ({
          id: String(x?.id ?? ""),
          title: String(x?.title ?? x?.label ?? "Action").trim() || "Action",
          status: x?.status ?? null,
          due_at: x?.due_at ?? x?.dueAt ?? null,
          created_at: x?.created_at ?? x?.createdAt ?? null,
          importance: x?.importance ?? null,
          contact_id: x?.contact_id ?? x?.contactId ?? null,
        }))
        .filter((x) => Boolean(x.id));

      setOpenActions(shaped);
    } catch (e: any) {
      setOpenActions([]);
      setOpenActionsErr(e?.message ?? "open_actions_failed");
    } finally {
      setLoadingOpenActions(false);
    }
  }, []);

  const createFollowUp = async () => {
    if (!repId) return;
    setCreateErr(null);
    setCreatingFollowUp(true);
    try {
      const payload: any = {
        rep_id: String(repId),
        contact_id: selectedContactId,
        type: "follow_up",
        title: String(followUpTitle || "Follow up").trim() || "Follow up",
        due_at: null,
        importance: "normal",
        meta: { source: "rep_intelligence_inline" },
      };
      if (!payload.contact_id) throw new Error("Select a contact first");

      const r = await fetch(`/api/proxy/v1/crm/actions`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) throw new Error(j?.error ?? "create_action_failed");

      await loadOpenActions(String(repId));
    } catch (e: any) {
      setCreateErr(e?.message ?? "create_action_failed");
    } finally {
      setCreatingFollowUp(false);
    }
  };

  const completeAction = async (actionId: string) => {
    if (!actionId) return;
    setCompleteErr(null);
    setCompletingIds((m) => ({ ...m, [actionId]: true }));
    try {
      const r = await fetch(
        `/api/proxy/v1/crm/actions/${encodeURIComponent(actionId)}/complete`,
        { method: "POST", headers: { accept: "application/json" } }
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) throw new Error(j?.error ?? "action_complete_failed");
      setOpenActions((prev) => (prev ?? []).filter((a) => a.id !== actionId));

      try {
        const intel: any = await fetchJsonWithRetry<any>(
          `/api/proxy/v1/crm/reps/${encodeURIComponent(String(repId))}/intelligence?days=7`
        );
        if (intel?.ok) setIntelligence(intel);
      } catch {}
    } catch (e: any) {
      setCompleteErr(e?.message ?? "action_complete_failed");
    } finally {
      setCompletingIds((m) => {
        const n = { ...m };
        delete n[actionId];
        return n;
      });
    }
  };

  useEffect(() => {
    let alive = true;
    if (!repId) return;

    (async () => {
      try {
        const [summaryResp, nudgesResp, intelligenceResp] = await Promise.all([
          fetchJsonWithRetry<RepSummaryResp>(
            `/api/proxy/v1/dashboard/rep-summary?userId=${encodeURIComponent(String(repId))}&days=90`
          ),
          fetchJsonWithRetry<any>(
            `/api/proxy/v1/crm/manager/nudges?limit=200`
          ).catch(() => null),
          fetchJsonWithRetry<any>(
            `/api/proxy/v1/crm/reps/${encodeURIComponent(String(repId))}/intelligence?days=7`
          ).catch(() => null),
        ]);

        if (!alive) return;

        if (!summaryResp || (summaryResp as any).ok === false) {
          setErrorText("Unable to load rep summary.");
        } else {
          setData(summaryResp);
        }

        if (intelligenceResp && intelligenceResp.ok) {
          setIntelligence(intelligenceResp);
          const top0 = Array.isArray(intelligenceResp?.top_contacts)
            ? intelligenceResp.top_contacts[0]
            : null;
          setSelectedContactId(top0?.contact_id ? String(top0.contact_id) : null);
          await loadOpenActions(String(repId));
        } else {
          setIntelligence(null);
          setSelectedContactId(null);
          setOpenActions(null);
        }

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
            const stale =
              typeof lastDays === "number" && Number.isFinite(lastDays) && lastDays >= 7;
            return overdue > 0 || stale;
          }).length;
          setIgnoredNudges(ignored);
        } else {
          setIgnoredNudges(null);
        }
      } catch (e) {
        console.error("rep profile load failed", e);
        if (alive) setErrorText("Something went wrong loading this rep.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [repId, loadOpenActions]);

  const riskBand = String(intelligence?.risk_summary?.risk_band ?? "");
  const overdueCount = Number(intelligence?.actions?.overdue ?? 0);
  const openCount = Number(intelligence?.actions?.open ?? 0);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <Link
            href="/crm/overview"
            className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            ← CRM
          </Link>
          <h1 className="mt-0.5 text-xl font-semibold text-white">
            {data?.userId ?? repId ?? "Rep"}
          </h1>
          <p className="mt-0.5 text-xs text-neutral-500">90-day performance snapshot</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {riskBand && (
            <span className={`text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${riskBandClass(riskBand)}`}>
              {riskBand === "at_risk" ? "At Risk" : riskBand}
            </span>
          )}
          <Link
            href={`/sparring?repId=${encodeURIComponent(String(repId ?? ""))}&persona=price_sensitive`}
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20 transition-colors"
          >
            AI Sparring →
          </Link>
        </div>
      </div>

      <WorkspaceTabs
        tabs={[
          { id: "overview", label: "Overview" },
          {
            id: "coaching",
            label: "Coaching",
            badge: overdueCount > 0 ? overdueCount : undefined,
          },
          {
            id: "activity",
            label: "Activity",
            badge: data?.recent?.length || undefined,
          },
        ]}
        active={tab}
        onChange={setTab}
      />

      {loading && (
        <div className="rounded-xl border border-neutral-800 px-4 py-5 text-sm text-neutral-400">
          Loading rep data…
        </div>
      )}

      {!loading && errorText && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-4 text-sm text-red-300">
          {errorText}
        </div>
      )}

      {/* ── OVERVIEW ── */}
      {tab === "overview" && !loading && !errorText && data && (
        <div className="space-y-4">
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                Total Calls
              </div>
              <div className="mt-1.5 text-2xl font-semibold text-white tabular-nums">
                {data.calls ?? 0}
              </div>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                Avg Score
              </div>
              <div
                className={`mt-1.5 text-2xl font-semibold tabular-nums ${scoreColour(data.avg_score)}`}
              >
                {typeof data.avg_score === "number" ? Math.round(data.avg_score) : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">XP</div>
              <div className="mt-1.5 text-2xl font-semibold text-white tabular-nums">
                {data.xp ?? 0}
              </div>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                Ignored Nudges
              </div>
              <div
                className={`mt-1.5 text-2xl font-semibold tabular-nums ${
                  typeof ignoredNudges === "number" && ignoredNudges > 0
                    ? "text-red-300"
                    : "text-white"
                }`}
              >
                {typeof ignoredNudges === "number" ? ignoredNudges : "—"}
              </div>
              <div className="mt-0.5 text-[10px] text-neutral-500">overdue / 7d+ stale</div>
            </div>
          </div>

          {/* CRM risk status */}
          {intelligence && (
            <div
              className={`rounded-xl border px-5 py-4 ${
                riskBand === "at_risk"
                  ? "border-red-500/20 bg-red-500/5"
                  : riskBand === "watch"
                    ? "border-amber-500/20 bg-amber-500/5"
                    : "border-emerald-500/20 bg-emerald-500/5"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                    CRM Risk (7d)
                  </div>
                  <div className="mt-1 flex items-center gap-3">
                    <span
                      className={`text-2xl font-semibold ${
                        riskBand === "at_risk"
                          ? "text-red-300"
                          : riskBand === "watch"
                            ? "text-amber-300"
                            : "text-emerald-300"
                      }`}
                    >
                      {Number(intelligence?.risk_summary?.risk_score ?? 0)}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${riskBandClass(riskBand)}`}>
                      {riskBand === "at_risk" ? "At Risk" : riskBand || "Healthy"}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4 text-center">
                  {[
                    { label: "Open", value: openCount, cls: "text-white" },
                    { label: "Overdue", value: overdueCount, cls: overdueCount > 0 ? "text-red-400" : "text-white" },
                    { label: "Completed", value: Number(intelligence?.actions?.completed ?? 0), cls: "text-emerald-400" },
                    { label: "Due Soon", value: Number(intelligence?.actions?.due_soon_3d ?? 0), cls: "text-amber-300" },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <div className="text-[10px] text-neutral-500">{stat.label}</div>
                      <div className={`text-lg font-semibold tabular-nums ${stat.cls}`}>
                        {stat.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {Array.isArray(intelligence?.risk_summary?.reasons) &&
                intelligence.risk_summary.reasons.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {intelligence.risk_summary.reasons.map((r: string, i: number) => (
                      <span
                        key={i}
                        className="rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300"
                      >
                        {String(r)}
                      </span>
                    ))}
                  </div>
                )}
            </div>
          )}

          {/* Top account */}
          {data.topAccount && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                  Top Account
                </div>
                <div className="mt-1 text-sm font-medium text-white">
                  {data.topAccount.name || data.topAccount.id}
                </div>
              </div>
              <Link
                href={`/crm/accounts/${data.topAccount.id}`}
                className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/20 transition-colors shrink-0"
              >
                Open →
              </Link>
            </div>
          )}

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/crm/actions?repId=${encodeURIComponent(String(repId ?? ""))}&status=open`}
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 hover:bg-amber-500/20 transition-colors"
            >
              Open CRM Actions →
            </Link>
            <Link
              href={`/sparring?repId=${encodeURIComponent(String(repId ?? ""))}&persona=price_sensitive`}
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-500/20 transition-colors"
            >
              AI Sparring →
            </Link>
          </div>
        </div>
      )}

      {/* ── COACHING ── */}
      {tab === "coaching" && !loading && (
        <div className="space-y-4">
          {!intelligence ? (
            <div className="rounded-xl border border-neutral-800 px-4 py-5 text-sm text-neutral-400">
              No CRM intelligence data available for this rep.
            </div>
          ) : (
            <>
              {/* Risk summary */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-medium text-neutral-200">CRM Intelligence (7d)</div>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      Risk score: {Number(intelligence?.risk_summary?.risk_score ?? 0)}
                    </div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${riskBandClass(riskBand)}`}>
                    {riskBand === "at_risk" ? "At Risk" : riskBand || "Healthy"}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: "Open", value: openCount },
                    { label: "Overdue", value: overdueCount, highlight: overdueCount > 0 ? "text-red-400" : undefined },
                    { label: "Completed", value: Number(intelligence?.actions?.completed ?? 0) },
                    { label: "Due Soon (3d)", value: Number(intelligence?.actions?.due_soon_3d ?? 0) },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg border border-neutral-800 bg-black/20 px-3 py-2.5">
                      <div className="text-[10px] text-neutral-500">{s.label}</div>
                      <div className={`text-xl font-semibold tabular-nums mt-1 ${s.highlight ?? "text-white"}`}>
                        {s.value}
                      </div>
                    </div>
                  ))}
                </div>

                {Array.isArray(intelligence?.risk_summary?.reasons) &&
                  intelligence.risk_summary.reasons.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {intelligence.risk_summary.reasons.map((r: string, i: number) => (
                        <span
                          key={i}
                          className="rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300"
                        >
                          {String(r)}
                        </span>
                      ))}
                    </div>
                  )}

                {/* Create follow-up */}
                <div className="rounded-lg border border-neutral-800 bg-neutral-900/20 p-3">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <div className="text-xs font-medium text-neutral-200">Create follow-up</div>
                      <div className="text-[11px] text-neutral-500">
                        Fix CRM risk instantly.
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={createFollowUp}
                        disabled={creatingFollowUp}
                        className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-60"
                      >
                        {creatingFollowUp ? "Creating…" : "+ Follow-up"}
                      </button>
                      <Link
                        href={`/crm/actions?repId=${encodeURIComponent(String(repId ?? ""))}&status=open`}
                        className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-900"
                      >
                        All Actions →
                      </Link>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={followUpTitle}
                      onChange={(e) => setFollowUpTitle(e.target.value)}
                      className="flex-1 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 outline-none"
                      placeholder="Follow up"
                    />
                    <select
                      value={selectedContactId ?? ""}
                      onChange={(e) => setSelectedContactId(e.target.value || null)}
                      className="sm:w-64 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none"
                    >
                      <option value="">Select contact…</option>
                      {Array.isArray(intelligence?.top_contacts)
                        ? intelligence.top_contacts.slice(0, 8).map((c: any) => {
                            const cid = String(c?.contact_id ?? "");
                            if (!cid) return null;
                            const label = String(
                              c?.name || c?.email || cid.slice(0, 6) + "…"
                            );
                            return (
                              <option key={cid} value={cid}>
                                {label}
                              </option>
                            );
                          })
                        : null}
                    </select>
                  </div>
                  {createErr && (
                    <div className="mt-2 text-xs text-red-300">{createErr}</div>
                  )}
                </div>
              </div>

              {/* Open actions */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
                  <div className="text-sm font-medium text-white">
                    Open Actions
                    {openCount > 0 && (
                      <span className="ml-2 text-xs text-neutral-500">top 5</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => repId && loadOpenActions(String(repId))}
                    className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                  >
                    Refresh
                  </button>
                </div>

                {loadingOpenActions ? (
                  <div className="px-4 py-4 text-sm text-neutral-400">Loading actions…</div>
                ) : openActionsErr ? (
                  <div className="px-4 py-4 text-sm text-red-300">{openActionsErr}</div>
                ) : (openActions ?? []).length === 0 ? (
                  <div className="px-4 py-4 text-sm text-neutral-400">No open actions.</div>
                ) : (
                  <div className="divide-y divide-neutral-800">
                    {(openActions ?? []).map((a) => (
                      <div
                        key={a.id}
                        className="flex items-start justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm text-neutral-200 truncate">{a.title}</div>
                          <div className="mt-0.5 text-[11px] text-neutral-500">
                            {a.due_at
                              ? `Due: ${new Date(String(a.due_at)).toLocaleString()}`
                              : "No due date"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => completeAction(a.id)}
                            disabled={Boolean(completingIds[a.id])}
                            className="rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-900 disabled:opacity-60"
                          >
                            {completingIds[a.id] ? "Completing…" : "Complete"}
                          </button>
                          <Link
                            href={`/crm/actions?repId=${encodeURIComponent(String(repId ?? ""))}&status=open`}
                            className="rounded-lg border border-neutral-800 px-2.5 py-1 text-xs text-neutral-400 hover:bg-neutral-900"
                          >
                            Open
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {completeErr && (
                  <div className="px-4 py-2 text-xs text-red-300">{completeErr}</div>
                )}
              </div>

              {/* Top contacts */}
              {Array.isArray(intelligence?.top_contacts) &&
                intelligence.top_contacts.length > 0 && (
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-4">
                    <div className="text-xs text-neutral-500 mb-2.5">
                      Top Contacts (by activity)
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {intelligence.top_contacts.map((c: any) => {
                        const cid = String(c?.contact_id ?? "");
                        if (!cid) return null;
                        const label = String(
                          c?.name || c?.email || cid.slice(0, 6) + "…"
                        );
                        return (
                          <Link
                            key={cid}
                            href={`/crm/actions?repId=${encodeURIComponent(String(repId ?? ""))}&contactId=${encodeURIComponent(cid)}&status=open`}
                            className="rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800 transition-colors"
                          >
                            {label}{" "}
                            <span className="text-neutral-500">({Number(c?.count ?? 0)})</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
            </>
          )}
        </div>
      )}

      {/* ── ACTIVITY ── */}
      {tab === "activity" && !loading && data && (
        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
              <div className="text-sm font-medium text-white">Recent Calls</div>
              <span className="text-xs text-neutral-500">{data.recent?.length ?? 0} calls</span>
            </div>
            <div className="divide-y divide-neutral-800">
              {(!data.recent || data.recent.length === 0) ? (
                <div className="px-4 py-5 text-sm text-neutral-400">No recent calls.</div>
              ) : (
                data.recent.map((c) => (
                  <div
                    key={c.id}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm text-white truncate">
                        Call {c.id.slice(0, 8)}…
                      </div>
                      <div className="text-xs text-neutral-500">
                        {new Date(c.created_at).toLocaleString()}
                        {c.account_id && (
                          <span className="ml-2 text-neutral-600">·</span>
                        )}
                        {c.account_id && (
                          <Link
                            href={`/crm/accounts/${c.account_id}`}
                            className="ml-1 text-cyan-500 hover:underline"
                          >
                            Account
                          </Link>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`text-sm font-semibold tabular-nums ${scoreColour(c.score_overall)}`}
                      >
                        {typeof c.score_overall === "number"
                          ? Math.round(c.score_overall)
                          : "—"}
                      </span>
                      <Link
                        href={`/calls/${c.id}`}
                        className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800 transition-colors"
                      >
                        Review →
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
