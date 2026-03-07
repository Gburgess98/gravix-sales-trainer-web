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
  const [intelligence, setIntelligence] = useState<any | null>(null);

  const [openActions, setOpenActions] = useState<RepOpenAction[] | null>(null);
  const [loadingOpenActions, setLoadingOpenActions] = useState<boolean>(false);
  const [openActionsErr, setOpenActionsErr] = useState<string | null>(null);

  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [followUpTitle, setFollowUpTitle] = useState<string>("Follow up");
  const [creatingFollowUp, setCreatingFollowUp] = useState<boolean>(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const [completingIds, setCompletingIds] = useState<Record<string, boolean>>({});
  const [completeErr, setCompleteErr] = useState<string | null>(null);

  const loadOpenActions = async (rid: string) => {
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
  };

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

      if (!payload.contact_id) {
        throw new Error("Select a contact first");
      }

      const r = await fetch(`/api/proxy/v1/crm/actions`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) {
        throw new Error(j?.error ?? "create_action_failed");
      }

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
      if (!r.ok || j?.ok === false) {
        throw new Error(j?.error ?? "action_complete_failed");
      }

      setOpenActions((prev) => (prev ?? []).filter((a) => a.id !== actionId));

      // Best-effort: refresh intelligence counts
      try {
        const intel: any = await fetchJsonWithRetry<any>(
          `/api/proxy/v1/crm/reps/${encodeURIComponent(String(repId))}/intelligence?days=7`
        );
        if (intel?.ok) setIntelligence(intel);
      } catch { }
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
            `/api/proxy/v1/dashboard/rep-summary?userId=${encodeURIComponent(
              String(repId)
            )}&days=90`
          ),
          fetchJsonWithRetry<ManagerNudgesResp>(
            `/api/proxy/v1/crm/manager/nudges?limit=200`
          ).catch(() => null as any),
          fetchJsonWithRetry<any>(
            `/api/proxy/v1/crm/reps/${encodeURIComponent(
              String(repId)
            )}/intelligence?days=7`
          ).catch(() => null as any),
        ]);

        if (!alive) return;

        if (!summaryResp || (summaryResp as any).ok === false) {
          setErrorText("Unable to load rep summary.");
        } else {
          setData(summaryResp);
        }

        // --- Intelligence state ---
        if (intelligenceResp && intelligenceResp.ok) {
          setIntelligence(intelligenceResp);
        } else {
          setIntelligence(null);
        }

        if (intelligenceResp && intelligenceResp.ok) {
          const top0 = Array.isArray((intelligenceResp as any)?.top_contacts)
            ? (intelligenceResp as any).top_contacts[0]
            : null;
          const cid = top0?.contact_id ? String(top0.contact_id) : null;
          setSelectedContactId(cid);

          await loadOpenActions(String(repId));
        } else {
          setSelectedContactId(null);
          setOpenActions(null);
        }

        // --- Ignored nudges calculation ---
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
              typeof lastDays === "number" &&
              Number.isFinite(lastDays) &&
              lastDays >= 7;
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

                   {intelligence && (
            <div className="mb-6 rounded-lg border border-neutral-800 p-5 bg-neutral-950">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-medium text-neutral-200">CRM Intelligence (7d)</div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    Risk score: {Number(intelligence?.risk_summary?.risk_score ?? 0)}
                  </div>
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-xs uppercase tracking-wide font-medium ${
                    intelligence?.risk_summary?.risk_band === "at_risk"
                      ? "bg-red-600/20 text-red-300"
                      : intelligence?.risk_summary?.risk_band === "watch"
                        ? "bg-amber-600/20 text-amber-300"
                        : "bg-green-600/20 text-green-300"
                  }`}
                >
                  {String(intelligence?.risk_summary?.risk_band ?? "healthy")}
                </span>
              </div>

              {/* Actions Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-5">
                <div>
                  <div className="text-xs text-neutral-400">Open</div>
                  <div className="text-xl font-semibold">{Number(intelligence?.actions?.open ?? 0)}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-400">Overdue</div>
                  <div className="text-xl font-semibold text-red-400">{Number(intelligence?.actions?.overdue ?? 0)}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-400">Completed</div>
                  <div className="text-xl font-semibold">{Number(intelligence?.actions?.completed ?? 0)}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-400">Due Soon (3d)</div>
                  <div className="text-xl font-semibold">{Number(intelligence?.actions?.due_soon_3d ?? 0)}</div>
                </div>
              </div>

              {/* Risk Reasons */}
              {Array.isArray(intelligence?.risk_summary?.reasons) && intelligence.risk_summary.reasons.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {intelligence.risk_summary.reasons.map((r: string, i: number) => (
                    <span key={i} className="px-2 py-1 rounded bg-neutral-800 text-xs text-neutral-300">
                      {String(r)}
                    </span>
                  ))}
                </div>
              )}

              {/* Inline Create Follow-up */}
              <div className="mb-4 rounded-lg border border-neutral-800 bg-neutral-900/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-neutral-200">Create follow-up</div>
                    <div className="text-[11px] text-neutral-500">Fix risk instantly from this page.</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={createFollowUp}
                      disabled={creatingFollowUp}
                      className="rounded-md border border-emerald-600/60 bg-emerald-600/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-600/20 disabled:opacity-60"
                    >
                      {creatingFollowUp ? "Creating…" : "+ Follow-up"}
                    </button>
                    <Link
                      href={`/crm/actions?repId=${encodeURIComponent(String(repId ?? ""))}&status=open`}
                      className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-900"
                    >
                      View Open Actions
                    </Link>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <div className="text-[11px] text-neutral-500 mb-1">Title</div>
                    <input
                      value={followUpTitle}
                      onChange={(e) => setFollowUpTitle(e.target.value)}
                      className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600"
                      placeholder="Follow up"
                    />
                  </div>
                  <div className="sm:w-72">
                    <div className="text-[11px] text-neutral-500 mb-1">Contact</div>
                    <select
                      value={selectedContactId ?? ""}
                      onChange={(e) => setSelectedContactId(e.target.value || null)}
                      className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
                    >
                      <option value="">Select…</option>
                      {Array.isArray(intelligence?.top_contacts)
                        ? intelligence.top_contacts.slice(0, 8).map((c: any) => {
                            const cid = String(c?.contact_id ?? "");
                            if (!cid) return null;
                            const label = String(c?.name || c?.email || cid.slice(0, 6) + "…");
                            return (
                              <option key={cid} value={cid}>
                                {label}
                              </option>
                            );
                          })
                        : null}
                    </select>
                  </div>
                </div>

                {createErr ? <div className="mt-2 text-xs text-red-300">{createErr}</div> : null}
              </div>

              {/* Open Actions (top 5) with Complete */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-neutral-400">Open actions (top 5)</div>
                  <button
                    type="button"
                    onClick={() => repId && loadOpenActions(String(repId))}
                    className="text-[11px] text-neutral-400 hover:text-neutral-200 underline"
                  >
                    Refresh
                  </button>
                </div>

                {loadingOpenActions ? (
                  <div className="text-sm text-neutral-400">Loading actions…</div>
                ) : openActionsErr ? (
                  <div className="text-sm text-red-300">Failed to load actions: {openActionsErr}</div>
                ) : (openActions ?? []).length === 0 ? (
                  <div className="text-sm text-neutral-400">No open actions found.</div>
                ) : (
                  <div className="space-y-2">
                    {(openActions ?? []).map((a) => (
                      <div
                        key={a.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="text-sm text-neutral-200 truncate">{a.title}</div>
                          <div className="mt-0.5 text-[11px] text-neutral-500">
                            {a.due_at ? `Due: ${new Date(String(a.due_at)).toLocaleString()}` : "No due date"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => completeAction(a.id)}
                            disabled={Boolean(completingIds[a.id])}
                            className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-900 disabled:opacity-60"
                          >
                            {completingIds[a.id] ? "Completing…" : "Complete"}
                          </button>
                          <Link
                            href={`/crm/actions?repId=${encodeURIComponent(String(repId ?? ""))}&status=open`}
                            className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-900"
                          >
                            Open
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {completeErr ? <div className="mt-2 text-xs text-red-300">{completeErr}</div> : null}
              </div>

              {/* Top Contacts */}
              {Array.isArray(intelligence?.top_contacts) && intelligence.top_contacts.length > 0 && (
                <div>
                  <div className="text-xs text-neutral-400 mb-2">Top Contacts (by activity)</div>
                  <div className="flex flex-wrap gap-2">
                    {intelligence.top_contacts.map((c: any) => {
                      const cid = String(c?.contact_id ?? "");
                      if (!cid) return null;
                      const label = String(c?.name || c?.email || cid.slice(0, 6) + "…");
                      return (
                        <Link
                          key={cid}
                          href={`/crm/actions?repId=${encodeURIComponent(String(repId ?? ""))}&contactId=${encodeURIComponent(cid)}&status=open`}
                          className="px-2 py-1 rounded bg-blue-600/10 text-blue-300 text-xs hover:bg-blue-600/20"
                        >
                          {label} ({Number(c?.count ?? 0)})
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

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