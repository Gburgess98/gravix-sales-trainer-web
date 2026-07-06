// src/app/crm/overview/page.tsx
'use client';

export const dynamic = "force-dynamic";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Sparkline from "@/components/Sparkline";
// Alias to avoid clashing with Next.js route option export: `export const dynamic = "force-dynamic"`
import nextDynamic from "next/dynamic";
import clsx from "clsx";
import {
  listCoachAssignments,
  getTopObjections,
  type DashboardKpisResp,
} from "@/lib/api";
import { isOpenPath, guardDisabled } from "@/lib/openRoutes";
import { fetchJsonWithRetry } from "@/lib/fetchJsonwithretry";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// --- Medal helpers (Top Reps UI polish) ---
function rankMedal(rank: number) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return undefined;
}

function scoreColour(score?: number | null) {
  if (score == null) return 'text-zinc-400';
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-amber-300';
  return 'text-red-300';
}

function ScorePill({ score }: { score: number }) {
  const cls = score >= 80
    ? 'bg-green-600/20 text-green-400'
    : score >= 60
      ? 'bg-amber-600/20 text-amber-300'
      : 'bg-red-600/20 text-red-300';
  return <span className={`text-xs px-2 py-1 rounded ${cls}`}>{Math.round(score)}</span>;
}

function pct(n?: number | null) {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

function relTime(iso?: string | null) {
  if (!iso) return '—';
  const t = new Date(String(iso)).getTime();
  if (!isFinite(t)) return '—';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// Types for manager cards
type Assignment = {
  id: string;
  title: string;
  status: 'open' | 'done' | 'completed';
  rep_id?: string | null;
  rep_name?: string | null;
  created_at: string;
  due_at?: string | null;
};
type ObjectionDatum = { objection: string; count: number };

type ManagerTrustResp = {
  ok: true;
  managerId: string;
  trust: {
    overdue: number;
    assigned_7d: number;
    completed_7d: number;
    stale_reps: string[];
  };
};

type CrmActionItem = {
  id: string;
  title: string;
  status?: 'open' | 'done' | 'completed' | string;
  due_at?: string | null;
  created_at?: string | null;
  importance?: 'normal' | 'important' | 'critical' | string | null;
  contact_id?: string | null;
  account_id?: string | null;
  source?: string | null;
};

type CrmActionsResp = {
  ok: true;
  items: CrmActionItem[];
};

type ControlCentreResp = {
  ok: boolean;
  headline?: {
    reps_total?: number;
    reps_at_risk?: number;
    reps_watch?: number;
    overdue_actions_total?: number;
    open_actions_total?: number;
    window_days?: number;
    since?: string;
  };
  reps_at_risk?: any[];
  error?: string;
};

// Recharts (client-only)
const ResponsiveContainer = nextDynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });
const BarChart = nextDynamic(() => import('recharts').then(m => m.BarChart), { ssr: false });
const Bar = nextDynamic(() => import('recharts').then(m => m.Bar), { ssr: false });
const XAxis = nextDynamic(() => import('recharts').then(m => m.XAxis), { ssr: false });
const YAxis = nextDynamic(() => import('recharts').then(m => m.YAxis), { ssr: false });
const Tooltip = nextDynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false });
const Cell = nextDynamic(() => import('recharts').then(m => m.Cell), { ssr: false });
const LineChart = nextDynamic(() => import('recharts').then(m => m.LineChart), { ssr: false });
const Line = nextDynamic(() => import('recharts').then(m => m.Line), { ssr: false });

export default function CrmOverviewPage() {
  // Mark this route as "open" for auth guards (debug-only — no control flow changes here)
  const __crmPathname = '/crm/overview';
  const __isOpen = guardDisabled() || isOpenPath(__crmPathname);
  useEffect(() => {
    try {
      // Helpful when tracking redirect loops in staging
      console.debug('[CRM Overview] open-route check:', { path: __crmPathname, isOpen: __isOpen });
    } catch { }
  }, [__isOpen]);
  const [trends, setTrends] = useState<DashboardKpisResp | null>(null);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [objections, setObjections] = useState<ObjectionDatum[] | null>(null);
  const [loadingA, setLoadingA] = useState(true);
  const [loadingO, setLoadingO] = useState(true);
  const [sumOpen, setSumOpen] = useState<number>(0);
  const [sumDueSoon, setSumDueSoon] = useState<number>(0);
  const [sumDone7d, setSumDone7d] = useState<number>(0);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(true);
  const [trust, setTrust] = useState<ManagerTrustResp | null>(null);
  const [loadingTrust, setLoadingTrust] = useState<boolean>(true);
  const [todayActions, setTodayActions] = useState<CrmActionItem[] | null>(null);
  const [loadingTodayActions, setLoadingTodayActions] = useState<boolean>(true);
  const [nudges, setNudges] = useState<any[] | null>(null);
  const [loadingNudges, setLoadingNudges] = useState<boolean>(true);
  const [controlCentre, setControlCentre] = useState<ControlCentreResp | null>(null);
  const [loadingControlCentre, setLoadingControlCentre] = useState<boolean>(true);
  // --- Day 65 Reporting ---
  const [reporting, setReporting] = useState<any>(null);
  const [flagsSummary, setFlagsSummary] = useState<any>(null);
  const [loadingFlags, setLoadingFlags] = useState<boolean>(true);
  const [loadingReporting, setLoadingReporting] = useState<boolean>(true);

  // 🔥 Assign drill from section (Day 65)
  async function assignDrillFromSection(section: string) {
    try {
      await fetchJsonWithRetry('/api/proxy/v1/assignments', {
        method: 'POST',
        body: JSON.stringify({
          title: `Improve ${section}`,
          type: 'drill',
          meta: {
            source: 'flags',
            section,
          },
        }),
      });
      console.debug('[CRM Overview] Drill assigned for section:', section);
    } catch (e) {
      console.debug('[CRM Overview] Failed to assign drill', e);
    }
  }
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoadingReporting(true);
      try {
        const resp = await fetchJsonWithRetry<any>(
          '/api/proxy/v1/dashboard/reporting-summary?days=7'
        );

        if (!alive) return;
        setReporting(resp);
      } catch (e) {
        if (alive) setReporting(null);
        console.debug('[CRM Overview] Reporting load failed', e);
      } finally {
        if (alive) setLoadingReporting(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoadingFlags(true);
      try {
        const resp = await fetchJsonWithRetry<any>(
          '/api/proxy/v1/dashboard/flags-summary?days=7'
        );

        if (!alive) return;
        setFlagsSummary(resp);
      } catch (e) {
        if (alive) setFlagsSummary(null);
        console.debug('[CRM Overview] Flags summary load failed', e);
      } finally {
        if (alive) setLoadingFlags(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);
  // --- Day 53 Analytics ---
  const [analyticsSummary, setAnalyticsSummary] = useState<any | null>(null);
  const [stageConversion, setStageConversion] = useState<Record<string, number> | null>(null);
  const [scoreTrend, setScoreTrend] = useState<{ date: string, avg_score: number }[] | null>(null);
  const [activityByRep, setActivityByRep] = useState<any[] | null>(null);
  const [analyticsDays, setAnalyticsDays] = useState<number>(30);
  const [analyticsRep, setAnalyticsRep] = useState<string | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState<boolean>(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingTodayActions(true);
      try {
        // Prefer the aggregated CRM actions endpoint (Day 32). If it doesn't exist yet, fail soft.
        const resp: any = await fetchJsonWithRetry<any>(
          '/api/proxy/v1/crm/actions?scope=rep&window=today&limit=12'
        );

        if (!alive) return;

        const items: any[] = Array.isArray(resp?.items)
          ? resp.items
          : (Array.isArray(resp?.actions) ? resp.actions : []);

        const shaped: CrmActionItem[] = items.map((x: any) => ({
          id: String(x.id ?? ''),
          title: String(x.title ?? x.label ?? x.task ?? 'Action'),
          status: (x.status ?? 'open') as any,
          due_at: x.due_at ?? x.dueAt ?? null,
          created_at: x.created_at ?? x.createdAt ?? null,
          importance: x.importance ?? null,
          contact_id: x.contact_id ?? x.contactId ?? null,
          account_id: x.account_id ?? x.accountId ?? null,
          source: x.source ?? (x.meta?.source ?? null),
        })).filter((x) => x.id);

        // Sort by due date (soonest first), then created
        shaped.sort((a, b) => {
          const ad = a.due_at ? new Date(String(a.due_at)).getTime() : Number.POSITIVE_INFINITY;
          const bd = b.due_at ? new Date(String(b.due_at)).getTime() : Number.POSITIVE_INFINITY;
          if (ad !== bd) return ad - bd;
          const ac = a.created_at ? new Date(String(a.created_at)).getTime() : 0;
          const bc = b.created_at ? new Date(String(b.created_at)).getTime() : 0;
          return bc - ac;
        });

        setTodayActions(shaped);
      } catch (e: any) {
        // Expected while API stabilises — do not crash the overview.
        if (alive) setTodayActions([]);
        console.debug('[CRM Overview] Today actions load failed', e);
      } finally {
        if (alive) setLoadingTodayActions(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoadingNudges(true);
      try {
        // Best-effort: do not block the overview if this fails.
        const resp: any = await fetchJsonWithRetry<any>(
          '/api/proxy/v1/crm/manager/nudges?limit=5'
        );

        if (!alive) return;

        const items: any[] = Array.isArray(resp?.nudges)
          ? resp.nudges
          : (Array.isArray(resp?.items) ? resp.items : []);

        setNudges(items);
      } catch (e: any) {
        if (alive) setNudges([]);
        console.debug('[CRM Overview] Nudges load failed', e);
      } finally {
        if (alive) setLoadingNudges(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoadingControlCentre(true);
      try {
        // Best-effort: do not block the overview if this fails.
        const resp: any = await fetchJsonWithRetry<any>(
          '/api/proxy/v1/crm/manager/control-centre?days=7&limit=20'
        );

        if (!alive) return;

        // Tolerate shape differences
        const shaped: ControlCentreResp = {
          ok: Boolean(resp?.ok),
          headline: resp?.headline ?? resp?.summary ?? resp?.stats ?? undefined,
          reps_at_risk: Array.isArray(resp?.reps_at_risk) ? resp.reps_at_risk : [],
          error: resp?.error,
        };

        setControlCentre(shaped);
      } catch (e: any) {
        if (alive) setControlCentre({ ok: false, error: e?.message ?? 'control_centre_failed' });
        console.debug('[CRM Overview] Control centre load failed', e);
      } finally {
        if (alive) setLoadingControlCentre(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Manager banner: attempt to fetch a broad sample (API may require a target; handle 400 gracefully)
        const res: any = await listCoachAssignments({ limit: 100 } as any);
        if (!alive) return;

        // Normalise rows array
        const rows: any[] = Array.isArray(res?.items)
          ? res.items
          : (Array.isArray(res) ? res : (res?.assignments ?? []));

        const now = Date.now();
        const week = 7 * 864e5;

        const open = rows.filter(x => (x?.status === 'open')).length;

        const dueSoon = rows.filter(x => {
          if (x?.status === 'done' || x?.status === 'completed') return false;
          if (!x?.due_at) return false;
          const due = new Date(x.due_at).getTime();
          if (!isFinite(due)) return false;
          return due >= now && (due - now) <= week;
        }).length;

        const done7d = rows.filter(x => {
          const done = (x?.status === 'done' || x?.status === 'completed');
          if (!done) return false;
          const t = new Date(x?.updated_at ?? x?.completed_at ?? x?.created_at).getTime();
          if (!isFinite(t)) return false;
          return (now - t) <= week;
        }).length;

        setSumOpen(open);
        setSumDueSoon(dueSoon);
        setSumDone7d(done7d);
      } catch (e: any) {
        // If the backend enforces a filter (400), show zeros instead of error overlay
        if (e?.status === 400) {
          setSumOpen(0);
          setSumDueSoon(0);
          setSumDone7d(0);
        } else {
          console.debug('Assignments summary load failed', e);
          setSumOpen(0);
          setSumDueSoon(0);
          setSumDone7d(0);
        }
      } finally {
        if (alive) setLoadingSummary(false);
      }
    })();
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingTrust(true);
      try {
        const resp = await fetchJsonWithRetry<ManagerTrustResp>(
          "/api/proxy/v1/assignments/manager/trust"
        );
        if (!alive) return;
        // tolerate any shape issues
        if (resp && (resp as any).ok) setTrust(resp);
        else setTrust(null);
      } catch (e) {
        if (alive) setTrust(null);
        console.debug("Manager trust load failed", e);
      } finally {
        if (alive) setLoadingTrust(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const resp = await fetchJsonWithRetry<DashboardKpisResp>(
          "/api/proxy/v1/dashboard/kpis?days=90"
        );
        if (!alive) return;
        if (resp && (resp as any).ok !== false) {
          setTrends(resp);
        }
      } catch (e) {
        if (alive) {
          setTrends({
            ok: false as any,
            total_calls: 0,
            avg_score_overall: null,
            conversion_rate_90d: null as any,
            callsAnalyzed: [],
            avgScore: [],
            winRate: [],
            top_accounts: [],
            top_reps: [],
            since: new Date().toISOString(),
          } as any);
        }
        console.error("getDashboardKpis via proxy failed", e);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // --- Day 53 Analytics Loader ---
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoadingAnalytics(true);

      try {
        const summary = await fetchJsonWithRetry<any>(
          `/api/proxy/v1/crm/analytics/summary?days=${analyticsDays}${analyticsRep ? `&repId=${analyticsRep}` : ""}`
        );

        const stages = await fetchJsonWithRetry<any>(
          `/api/proxy/v1/crm/analytics/stage-conversion?days=${analyticsDays}`
        );

        const trend = await fetchJsonWithRetry<any>(
          `/api/proxy/v1/crm/analytics/score-trend?days=${analyticsDays}`
        );

        const repActivity = await fetchJsonWithRetry<any>(
          `/api/proxy/v1/crm/analytics/activity-by-rep?days=${analyticsDays}`
        );

        if (!alive) return;

        setAnalyticsSummary(summary);
        setStageConversion(stages?.stages ?? {});
        setScoreTrend(trend?.trend ?? []);
        setActivityByRep(repActivity?.reps ?? []);

      } catch (e) {
        console.debug("Analytics load failed", e);
        if (alive) {
          setAnalyticsSummary(null);
          setStageConversion(null);
          setScoreTrend(null);
          setActivityByRep(null);
        }
      } finally {
        if (alive) setLoadingAnalytics(false);
      }
    })();

    return () => { alive = false; };
  }, [analyticsDays, analyticsRep]);
  useEffect(() => {
    let alive = true;
    // Load assignments (requires one of callId/accountId/contactId/assigneeUserId|repId). If no rep filter, skip.
    (async () => {
      try {
        if (!repFilter) {
          // Backend requires a target; without a rep, show none (manager view will come later via a different endpoint)
          setAssignments([]);
          return;
        }
        const res = await listCoachAssignments({ limit: 5, status: 'open', repId: String(repFilter) as any });
        if (!alive) return;
        const rows = Array.isArray((res as any)?.items)
          ? (res as any).items
          : (Array.isArray(res) ? res : (res?.assignments ?? []));
        setAssignments(rows);
      } catch (e: any) {
        // Avoid Next.js dev error overlay for expected 400s from API guard
        if (e?.status === 400) {
          setAssignments([]);
        } else {
          console.debug('Assignments load failed', e);
          setAssignments([]);
        }
      } finally {
        if (alive) setLoadingA(false);
      }
    })();
    (async () => {
      try {
        const res: any =
          typeof (getTopObjections as any) === "function"
            ? await (getTopObjections as any)({ limit: 8 })
            : { ok: true, items: [] };
        if (!alive) return;

        let rows: ObjectionDatum[] = [];
        const items = Array.isArray((res as any)?.items) ? (res as any).items : null;

        if (Array.isArray(res)) {
          // Already an array of { objection, count } or similar
          rows = (res as any[]).map((x: any) => ({
            objection: x.objection ?? x.key ?? x.name ?? 'Unknown',
            count: typeof x.count === 'number' ? x.count : (typeof x.value === 'number' ? x.value : 0),
          }));
        } else if (Array.isArray(res?.top)) {
          // Preferred shape: { top: [{ key, count }] }
          rows = res.top.map((x: any) => ({
            objection: x.key ?? x.objection ?? x.name ?? 'Unknown',
            count: typeof x.count === 'number' ? x.count : (typeof x.value === 'number' ? x.value : 0),
          }));
        } else if (Array.isArray(items)) {
          rows = items.map((x: any) => ({
            objection: x.objection ?? x.key ?? x.name ?? 'Unknown',
            count: typeof x.count === 'number' ? x.count : (typeof x.value === 'number' ? x.value : 0),
          }));
        }

        setObjections(rows);
      } catch (e) {
        if (alive) setObjections([]);
        console.error('Failed to load top objections', e);
      } finally {
        if (alive) setLoadingO(false);
      }
    })();
    return () => { alive = false; };
  }, []);
  const search = useSearchParams();
  const repFilter = search.get('rep');
  const topRepsAll = Array.isArray((trends as any)?.top_reps) ? (trends as any).top_reps : [];
  const topReps = repFilter ? topRepsAll.filter((r: any) => String(r.user_id) === String(repFilter)) : topRepsAll;
  return (
    <div className="max-w-5xl mx-auto py-10 px-6">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="text-xl font-semibold">Overview</h1>
          <p className="opacity-80">Snapshot of recent team performance based on analysed calls.</p>
        </div>

        <Link
          href="/crm/manager"
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
        >
          Manager
        </Link>
      </div>
      {/* Manager Assignments Summary */}
      <div className="mt-3 mb-5 rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-2 text-sm text-neutral-300 flex flex-wrap gap-4">
        {loadingSummary ? (
          <div className="h-5 w-64 animate-pulse rounded bg-white/10" />
        ) : (
          <>
            <span>🟡 Open: <span className="tabular-nums">{sumOpen}</span></span>
            <span>🕑 Due soon: <span className="tabular-nums">{sumDueSoon}</span></span>
            <span>✅ Completed 7d: <span className="tabular-nums">{sumDone7d}</span></span>
          </>
        )}
      </div>

      {/* 🔥 Manager Reporting (Day 65) */}
      <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="text-sm font-semibold text-neutral-100 mb-2">Performance Signals</div>

        {/* 🔥 Flag Intelligence (NEW) */}
        <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          <div className="text-sm font-semibold text-neutral-100 mb-2">
            Flag Intelligence (7d)
          </div>

          {loadingFlags ? (
            <div className="h-16 animate-pulse rounded-xl bg-white/10" />
          ) : !flagsSummary?.ok ? (
            <div className="text-sm text-neutral-400">No flag data.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">

                <div className="rounded-lg border border-white/10 p-2">
                  <div className="text-white/50">Total Flags</div>
                  <div className="text-lg font-semibold text-amber-300">
                    {flagsSummary.total_flags ?? 0}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 p-2">
                  <div className="text-white/50">Critical</div>
                  <div className="text-lg font-semibold text-red-300">
                    {flagsSummary.critical_flags ?? 0}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 p-2">
                  <div className="text-white/50">Low Score</div>
                  <div className="text-lg font-semibold text-orange-300">
                    {flagsSummary.low_score_flags ?? 0}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 p-2">
                  <div className="text-white/50">Top Issue</div>
                  <div className="text-sm font-semibold text-white/80">
                    {flagsSummary.top_flag_type ?? "—"}
                  </div>
                </div>

              </div>

              {/* 🔥 Section Breakdown + Actions */}
              {flagsSummary?.sections?.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs text-white/50 mb-2">Weakness Breakdown</div>

                  <div className="space-y-2">
                    {flagsSummary.sections.map((s: any, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2"
                      >
                        <div className="text-sm text-white/80">
                          {s.section}
                          <span className="ml-2 text-xs text-white/40">
                            ({s.count})
                          </span>
                        </div>

                        <button
                          onClick={() => assignDrillFromSection(s.section)}
                          className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20"
                        >
                          Assign drill
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {loadingReporting ? (
          <div className="h-16 animate-pulse rounded-xl bg-white/10" />
        ) : !reporting?.ok ? (
          <div className="text-sm text-neutral-400">No reporting data available.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">

            <div className="rounded-lg border border-white/10 p-2">
              <div className="text-white/50">Critical Today</div>
              <div className="text-lg font-semibold text-red-300">
                {reporting.critical_calls_today ?? 0}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 p-2">
              <div className="text-white/50">Flagged (7d)</div>
              <div className="text-lg font-semibold text-amber-300">
                {reporting.flagged_calls_this_week ?? 0}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 p-2">
              <div className="text-white/50">Auto Assign</div>
              <div className="text-lg font-semibold text-sky-300">
                {reporting.auto_assignments_created ?? 0}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 p-2">
              <div className="text-white/50">Completion</div>
              <div className="text-lg font-semibold text-emerald-300">
                {reporting.assignment_completion_rate ?? 0}%
              </div>
            </div>

            <div className="rounded-lg border border-white/10 p-2">
              <div className="text-white/50">Weakest Skill</div>
              <div className="text-sm font-semibold text-white/80">
                {reporting.weakest_team_skill?.skill ?? '—'}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 p-2">
              <div className="text-white/50">Reps Needing Help</div>
              <div className="text-lg font-semibold text-red-200">
                {(reporting.reps_needing_help ?? []).length}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Control Centre teaser (manager system feature, fail-soft) */}
      <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-neutral-100">Control Centre</div>
              {loadingControlCentre ? null : (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70 tabular-nums">
                  {Number(controlCentre?.headline?.window_days ?? 7)}d window
                </span>
              )}
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/60">
                Manager view
              </span>
            </div>
            <div className="mt-0.5 text-xs text-neutral-400">
              One place to see which reps need attention — based on overdue work, open workload, and recent activity.
            </div>
          </div>

          <div className="shrink-0">
            <Link
              href="/crm/manager/control-centre"
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10"
            >
              Open Control Centre
            </Link>
          </div>
        </div>

        {loadingControlCentre ? (
          <div className="mt-3 h-12 animate-pulse rounded-xl bg-white/10" />
        ) : !controlCentre?.ok ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-sm text-white/80">Control Centre unavailable right now.</div>
            <div className="mt-1 text-xs text-white/55">{String(controlCentre?.error ?? 'control_centre_failed')}</div>
          </div>
        ) : (
          (() => {
            const h = controlCentre?.headline ?? {};
            const repsTotal = Number(h.reps_total ?? 0);
            const atRisk = Number(h.reps_at_risk ?? 0);
            const watch = Number(h.reps_watch ?? 0);
            const overdue = Number(h.overdue_actions_total ?? 0);
            const open = Number(h.open_actions_total ?? 0);

            const atRiskCls = atRisk > 0 ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-white/10 bg-white/5 text-white/70';
            const watchCls = watch > 0 ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-white/10 bg-white/5 text-white/70';
            const overdueCls = overdue > 0 ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-white/10 bg-white/5 text-white/70';

            return (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] border tabular-nums ${atRiskCls}`}>
                  At risk {atRisk}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] border tabular-nums ${watchCls}`}>
                  Watch {watch}
                </span>
                <span className="rounded-full px-2 py-0.5 text-[11px] border border-white/10 bg-white/5 text-white/70 tabular-nums">
                  Reps {repsTotal}
                </span>

                <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] border tabular-nums ${overdueCls}`}>
                  Overdue actions {overdue}
                </span>
                <span className="rounded-full px-2 py-0.5 text-[11px] border border-white/10 bg-white/5 text-white/70 tabular-nums">
                  Open actions {open}
                </span>
              </div>
            );
          })()
        )}
      </div>

      {/* Nudges (system feature, fail-soft) */}
      <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-neutral-100">Nudges</div>
              {!loadingNudges ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70 tabular-nums">
                  {nudges?.length ?? 0}
                </span>
              ) : null}
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/60">
                Manager signal
              </span>
            </div>
            <div className="mt-0.5 text-xs text-neutral-400">
              The system’s best guess at who needs attention next — ranked by overdue work, staleness, and open actions.
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <Link
              href="/crm/manager"
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10"
            >
              Manager
            </Link>
            <Link
              href="/crm/manager/nudges"
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10"
            >
              View all
            </Link>
          </div>
        </div>

        {/* Summary strip */}
        {loadingNudges ? (
          <div className="mt-3 h-10 animate-pulse rounded-xl bg-white/10" />
        ) : (
          (() => {
            const items = Array.isArray(nudges) ? nudges : [];
            const counts = items.reduce(
              (acc: any, n: any) => {
                const band = String(n?.health?.band ?? "").toLowerCase();
                if (band === "at_risk" || band === "critical" || band === "hot") acc.at_risk += 1;
                else if (band === "watch" || band === "warm" || band === "warning") acc.watch += 1;
                else if (band === "healthy") acc.healthy += 1;
                else acc.unknown += 1;
                return acc;
              },
              { at_risk: 0, watch: 0, healthy: 0, unknown: 0 }
            );

            const overdueTotal = items.reduce((s: number, n: any) => s + Number(n?.action_counts?.overdue ?? 0), 0);
            const openTotal = items.reduce((s: number, n: any) => s + Number(n?.action_counts?.open ?? 0), 0);

            return (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full px-2 py-0.5 text-[11px] border border-red-500/30 bg-red-500/10 text-red-200 tabular-nums">
                  At risk {counts.at_risk}
                </span>
                <span className="rounded-full px-2 py-0.5 text-[11px] border border-amber-500/30 bg-amber-500/10 text-amber-200 tabular-nums">
                  Watch {counts.watch}
                </span>
                <span className="rounded-full px-2 py-0.5 text-[11px] border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 tabular-nums">
                  Healthy {counts.healthy}
                </span>
                {counts.unknown ? (
                  <span className="rounded-full px-2 py-0.5 text-[11px] border border-white/10 bg-white/5 text-white/60 tabular-nums">
                    Other {counts.unknown}
                  </span>
                ) : null}

                <span className="ml-auto rounded-full px-2 py-0.5 text-[11px] border border-white/10 bg-white/5 text-white/60 tabular-nums">
                  Overdue {overdueTotal}
                </span>
                <span className="rounded-full px-2 py-0.5 text-[11px] border border-white/10 bg-white/5 text-white/60 tabular-nums">
                  Open {openTotal}
                </span>
              </div>
            );
          })()
        )}

        {loadingNudges ? (
          <div className="mt-3 h-28 animate-pulse rounded-xl bg-white/10" />
        ) : !nudges || nudges.length === 0 ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-sm text-white/80">No nudges right now.</div>
            <div className="mt-1 text-xs text-white/55">
              When contacts have open or overdue actions, or go stale, they’ll show up here automatically.
            </div>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10">
            {nudges.slice(0, 5).map((n: any) => {
              const contactId = String(n?.contact_id ?? "");
              const name = String(n?.name ?? n?.contact_name ?? "Contact").trim();
              const email = n?.email ? String(n.email) : "";
              const company = n?.company ? String(n.company) : "";
              const priority = typeof n?.priority === "number" ? n.priority : Number(n?.priority ?? 0);

              const bandRaw = String(n?.health?.band ?? "").toLowerCase();
              const band = bandRaw || "unknown";
              const bandCls =
                band === "hot" || band === "critical" || band === "at_risk"
                  ? "border-red-500/30 bg-red-500/10 text-red-200"
                  : band === "warm" || band === "watch" || band === "warning"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                    : band === "healthy"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                      : "border-white/10 bg-white/5 text-white/70";

              const score = typeof n?.health?.score === "number" ? n.health.score : null;

              const open = typeof n?.action_counts?.open === "number" ? n.action_counts.open : Number(n?.action_counts?.open ?? 0);
              const overdue = typeof n?.action_counts?.overdue === "number" ? n.action_counts.overdue : Number(n?.action_counts?.overdue ?? 0);

              const lastDays =
                typeof n?.health?.stats?.last_contacted_days === "number" ? n.health.stats.last_contacted_days : null;
              const lastTouched = n?.last_contacted_at ?? n?.last_touched_at ?? null;

              const nextAction = String(n?.health?.next_action ?? "").trim();
              const reasons: string[] = Array.isArray(n?.health?.reasons)
                ? n.health.reasons.map((x: any) => String(x)).filter(Boolean)
                : [];

              const href = contactId ? `/crm/contacts/${encodeURIComponent(contactId)}` : null;

              const touchedLabel =
                lastDays == null
                  ? `Touched: ${relTime(lastTouched)}`
                  : lastDays === 0
                    ? "Touched: today"
                    : `Touched: ${lastDays}d`;

              const urgencyLabel = overdue > 0 ? `Overdue ${overdue}` : open > 0 ? `${open} open` : "No open";
              const urgencyCls =
                overdue > 0
                  ? "border-red-500/30 bg-red-500/10 text-red-200"
                  : open > 0
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                    : "border-white/10 bg-white/5 text-white/70";

              const RowWrap: any = href ? Link : "div";
              const rowProps = href
                ? { href, className: "block px-3 py-2 hover:bg-white/[0.03]" }
                : { className: "px-3 py-2" };

              return (
                <li key={contactId || `${name}-${email}-${company}`}>
                  <RowWrap {...rowProps}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="truncate text-sm text-white/90">{name}</div>
                          {company ? <span className="truncate text-xs text-white/50">· {company}</span> : null}
                        </div>

                        <div className="mt-0.5 truncate text-xs text-white/50">{email ? email : "—"}</div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] border uppercase ${bandCls}`}>{band}</span>

                          <span className={`rounded-full px-2 py-0.5 text-[11px] border tabular-nums ${urgencyCls}`}>{urgencyLabel}</span>

                          {score != null ? (
                            <span className="rounded-full px-2 py-0.5 text-[11px] border border-white/10 bg-white/5 text-white/70 tabular-nums">
                              Score {Math.round(score)}
                            </span>
                          ) : null}

                          <span className="rounded-full px-2 py-0.5 text-[11px] border border-white/10 bg-white/5 text-white/70 tabular-nums">
                            {touchedLabel}
                          </span>

                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] border border-white/10 bg-white/5 text-white/60 tabular-nums"
                            title="Priority score (higher = more urgent)"
                          >
                            P{isFinite(priority) ? Math.round(priority) : 0}
                          </span>
                        </div>

                        {nextAction ? (
                          <div className="mt-2 text-xs text-white/75">
                            <span className="text-white/50">Next:</span> {nextAction}
                          </div>
                        ) : null}

                        {reasons.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {reasons.slice(0, 2).map((r: any, idx: number) => (
                              <span
                                key={`${contactId || name}-r-${idx}`}
                                className="text-[11px] rounded-full px-2 py-0.5 border border-white/10 bg-white/5 text-white/55"
                              >
                                {String(r)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-[11px] text-white/40">Actions</div>
                        <div className="mt-1 text-xs text-white/70 tabular-nums">{open}/{overdue}</div>
                      </div>
                    </div>
                  </RowWrap>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-3 flex items-center justify-between text-xs text-white/50">
          <div>
            Nudges update automatically as you log notes, complete actions, and touch contacts.
          </div>
          <Link href="/crm/manager/nudges" className="underline hover:text-white/70">
            Open full nudges →
          </Link>
        </div>
      </div>

      {/* Rep Home: Today's Actions (CORE WIN) */}
      <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-neutral-200">Today’s Actions</div>
          <Link href="/crm/contacts/import" className="text-xs underline opacity-80 hover:opacity-100">
            Import leads
          </Link>
        </div>

        {loadingTodayActions ? (
          <div className="mt-3 h-20 animate-pulse rounded-xl bg-white/10" />
        ) : !todayActions || todayActions.length === 0 ? (
          <div className="mt-3 text-sm text-neutral-400">
            No actions queued. Open a contact and hit <span className="text-neutral-200">Auto-Assign</span>.
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {todayActions.slice(0, 8).map((a) => {
              const due = a.due_at ? new Date(String(a.due_at)) : null;
              const dueLabel = due && isFinite(due.getTime()) ? due.toLocaleString() : null;
              const imp = (a.importance ?? 'normal') as string;
              const impCls =
                imp === 'critical'
                  ? 'border-red-500/40 text-red-300 bg-red-500/10'
                  : imp === 'important'
                    ? 'border-amber-500/40 text-amber-300 bg-amber-500/10'
                    : 'border-white/10 text-white/60 bg-white/5';

              const status = (a.status ?? 'open') as string;
              const statusCls =
                status === 'done' || status === 'completed'
                  ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                  : 'border-sky-500/30 text-sky-300 bg-sky-500/10';

              const href = a.contact_id ? `/crm/contacts/${encodeURIComponent(String(a.contact_id))}` : null;

              return (
                <li key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm text-white/90 truncate">
                      {href ? (
                        <Link href={href} className="underline">
                          {a.title}
                        </Link>
                      ) : (
                        a.title
                      )}
                    </div>
                    <div className="text-xs text-white/50 truncate">
                      {dueLabel ? `Due: ${dueLabel}` : 'No due date'}
                      {a.source ? ` · ${a.source}` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={clsx('text-xs rounded-full px-2 py-0.5 border whitespace-nowrap', impCls)}>
                      {imp}
                    </span>
                    <span className={clsx('text-xs rounded-full px-2 py-0.5 border whitespace-nowrap', statusCls)}>
                      {status}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Total Calls */}
        <div className="rounded-lg border border-neutral-800 p-4">
          <div className="text-sm opacity-70">Total Calls</div>
          <div className="text-2xl font-semibold">{typeof trends?.total_calls === 'number' ? trends.total_calls : '—'}</div>
          <div className="mt-2">
            <Sparkline className="text-emerald-400" data={trends?.callsAnalyzed} />
          </div>
        </div>

        {/* Conversion (90d) */}
        <div className="rounded-lg border border-neutral-800 p-4">
          <div className="text-sm opacity-70">Conversion (90d)</div>
          <div className="text-2xl font-semibold">{pct((trends as any)?.conversion_rate_90d)}</div>
          <div className="mt-2">
            <Sparkline className="text-sky-400" data={(trends as any)?.winRate} />
          </div>
        </div>

        {/* Avg. Coaching Score */}
        <div className="rounded-lg border border-neutral-800 p-4">
          <div className="text-sm opacity-70">Avg. Coaching Score</div>
          <div className="text-2xl font-semibold">{typeof trends?.avg_score_overall === 'number' ? Math.round(trends.avg_score_overall) : '—'}</div>
          <div className="mt-2">
            <Sparkline className="text-amber-400" data={trends?.avgScore} />
          </div>
        </div>
      </div>

      {/* Manager Trust (optional surface) */}
      <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-200">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-medium">Manager Trust</div>
          <Link
            href="/admin/assignments"
            className="text-xs underline opacity-80 hover:opacity-100"
          >
            Open assignments admin
          </Link>
        </div>

        {loadingTrust ? (
          <div className="mt-2 h-5 w-64 animate-pulse rounded bg-white/10" />
        ) : !trust?.trust ? (
          <div className="mt-2 text-sm text-neutral-400">No trust signal available.</div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-neutral-300">
            <span>
              🔴 Overdue: <span className="tabular-nums">{trust.trust.overdue ?? 0}</span>
            </span>
            <span>
              ✅ Completed (7d): <span className="tabular-nums">{trust.trust.completed_7d ?? 0}</span>
            </span>
            <span>
              💤 Stale reps: <span className="tabular-nums">{(trust.trust.stale_reps || []).length}</span>
            </span>
          </div>
        )}
      </div>

      {/* Manager Cards: Assignments + Top Objections */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Assignments Overview */}
        <div className="rounded-lg border border-neutral-800 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm opacity-70">Recent Assignments</div>
            <Link href="/assignments" className="text-xs underline opacity-80 hover:opacity-100">View all</Link>
          </div>
          <div className="mt-3 space-y-2">
            {loadingA ? (
              <div className="h-24 animate-pulse rounded-xl bg-white/10" />
            ) : !assignments || assignments.length === 0 ? (
              <div className="text-sm text-neutral-400">No open assignments.</div>
            ) : (
              <ul className="space-y-2">
                {assignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2">
                    <div className="text-sm min-w-0">
                      <div className="text-white/90 truncate">{a.title || 'Coaching task'}</div>
                      <div className="text-white/50">
                        {a.rep_name ? `@${a.rep_name} • ` : ''}
                        {new Date(a.created_at).toLocaleString()}
                        {a.due_at ? ` • due ${new Date(a.due_at).toLocaleDateString()}` : ''}
                      </div>
                    </div>
                    <span className={clsx(
                      'text-xs rounded-full px-2 py-0.5 border whitespace-nowrap ml-2',
                      (a.status === 'done' || a.status === 'completed')
                        ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                        : 'border-amber-500/40 text-amber-300 bg-amber-500/10'
                    )}>
                      {a.status}
                    </span>
                    <Link href={`/assignments/${a.id}`} className="text-sm text-white/70 hover:underline ml-3 shrink-0">Open</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Top Objections */}
        <div className="rounded-lg border border-neutral-800 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm opacity-70">Top Objections</div>
            <span className="text-xs text-white/50">Last period</span>
          </div>
          <div className="mt-3 h-64">
            {loadingO ? (
              <div className="h-full animate-pulse rounded-xl bg-white/10" />
            ) : !objections || objections.length === 0 ? (
              <div className="text-sm text-neutral-400">No objections logged.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={objections} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <XAxis
                    dataKey="objection"
                    tick={{ fontSize: 11, fill: '#bbb' }}
                    angle={-25}
                    textAnchor="end"
                    interval={0}
                    height={50}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#bbb' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                  <Bar dataKey="count" fill="#60a5fa" radius={[4, 4, 0, 0]}>
                    {objections.map((_, idx) => (
                      <Cell key={idx} fill={idx < 3 ? ['#22c55e', '#eab308', '#f43f5e'][idx] : '#60a5fa'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
      {/* Top Accounts by Avg Score */}
      <div className="mt-6">
        <div className="rounded-lg border border-neutral-800">
          <div className="px-4 py-3 border-b border-neutral-800 font-medium">Top Accounts by Avg Score</div>
          <div className="divide-y divide-neutral-800">
            {(trends?.top_accounts?.length ?? 0) === 0 && (
              <div className="px-4 py-4 text-sm text-neutral-400">No data yet.</div>
            )}
            {(trends?.top_accounts ?? []).map((a: any, idx: number) => (
              <div key={a.account_id || a.id || String(idx)} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 text-center text-xs text-neutral-400">#{idx + 1}</div>
                  <Link href={`/crm/accounts/${a.account_id ?? a.id}`} className="truncate underline">
                    {a.name ?? a.account_id ?? 'Unnamed Account'}
                  </Link>
                </div>
                <div className={`text-sm tabular-nums ${scoreColour(a.avg_score)}`} title={`Avg Score ${a.avg_score ?? '—'}`}>
                  {typeof a.avg_score === 'number' ? Math.round(a.avg_score) : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Reps by Avg Score */}
      {repFilter ? (
        <div className="mt-2 mb-2 text-xs text-neutral-400">
          Filtering by rep: <code className="text-neutral-200">{repFilter}</code>
          {' '}· <Link className="underline" href="/crm/overview">Reset</Link>
        </div>
      ) : null}
      <div className="mt-6">
        <div className="rounded-lg border border-neutral-800">
          <div className="px-4 py-3 border-b border-neutral-800 font-medium">
            Top Reps by Avg Score {repFilter ? <span className="text-xs text-neutral-500">(filtered)</span> : null}
          </div>
          <div className="divide-y divide-neutral-800">
            {(Array.isArray(topRepsAll) ? topRepsAll : []).length === 0 && (
              <div className="px-4 py-4 text-sm text-neutral-400">No data yet.</div>
            )}

            {(topReps.length > 0 ? topReps : []).map((r: any, idx: number) => {
              const isActive = repFilter && String(repFilter) === String(r.user_id);
              const rank = idx + 1;
              const medal = rankMedal(rank);
              return (
                <Link
                  key={r.user_id || String(idx)}
                  href={`/crm/reps/${encodeURIComponent(r.user_id)}`}
                  className={`px-4 py-3 flex items-center justify-between hover:bg-neutral-900 ${isActive ? 'bg-neutral-900 border-l-2 border-sky-500' : ''}`}
                  title={isActive ? 'Active filter: this rep' : 'Filter by this rep'}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 text-center text-lg" aria-hidden>
                      {medal ? medal : <span className="text-xs text-neutral-500">#{rank}</span>}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate">{r.name ?? 'Rep'}</div>
                      <div className="text-xs text-neutral-500 truncate" title={`Calls: ${r.calls ?? '—'} · XP: ${r.xp ?? '—'}`}>
                        Calls: {r.calls ?? '—'} · XP: {r.xp ?? '—'}
                      </div>
                    </div>
                  </div>
                  <div className={`text-sm tabular-nums ${scoreColour(r.avg_score)}`} title={`Avg Score ${r.avg_score ?? '—'}`}>
                    {typeof r.avg_score === 'number' ? Math.round(r.avg_score) : '—'}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---------------- CRM Analytics (Day 53) ---------------- */}
      <div className="mt-8 rounded-xl border border-neutral-800 p-4">

        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-medium text-neutral-200">CRM Analytics</div>

          <div className="flex items-center gap-2 text-xs">
            <select
              value={analyticsDays}
              onChange={(e) => setAnalyticsDays(Number(e.target.value))}
              className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1"
            >
              <option value={7}>7d</option>
              <option value={30}>30d</option>
              <option value={90}>90d</option>
            </select>

            <input
              placeholder="Rep ID"
              value={analyticsRep ?? ""}
              onChange={(e) => setAnalyticsRep(e.target.value || null)}
              className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1"
            />
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">

          <div className="border border-neutral-800 rounded p-3">
            <div className="text-xs text-neutral-400">Opportunities</div>
            <div className="text-xl font-semibold">{analyticsSummary?.opportunities ?? '—'}</div>
          </div>

          <div className="border border-neutral-800 rounded p-3">
            <div className="text-xs text-neutral-400">Won</div>
            <div className="text-xl font-semibold">{analyticsSummary?.won ?? '—'}</div>
          </div>

          <div className="border border-neutral-800 rounded p-3">
            <div className="text-xs text-neutral-400">Conversion</div>
            <div className="text-xl font-semibold">{analyticsSummary?.conversion_rate ?? '—'}%</div>
          </div>

          <div className="border border-neutral-800 rounded p-3">
            <div className="text-xs text-neutral-400">Avg Score</div>
            <div className="text-xl font-semibold">{analyticsSummary?.avg_score ?? '—'}</div>
          </div>

        </div>

        {/* Conversion by stage */}
        <div className="mb-6">
          <div className="text-sm mb-2 text-neutral-300">Conversion by Stage</div>
          <div className="flex flex-wrap gap-2">
            {stageConversion && Object.entries(stageConversion).map(([stage, count]) => (
              <span key={stage} className="text-xs border border-neutral-700 rounded px-2 py-1">
                {stage}: {count}
              </span>
            ))}
          </div>
        </div>

        {/* Score trend */}
        <div className="mb-6 h-48">
          <div className="text-sm mb-2 text-neutral-300">Avg Score Trend</div>

          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={scoreTrend ?? []}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#bbb" }} />
              <YAxis tick={{ fontSize: 11, fill: "#bbb" }} />
              <Tooltip contentStyle={{ backgroundColor: "#111", border: "1px solid #333" }} />

              <Line
                type="monotone"
                dataKey="avg_score"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Activity by rep */}
        <div>
          <div className="text-sm mb-2 text-neutral-300">Activity by Rep</div>

          <div className="space-y-1">
            {(activityByRep ?? []).slice(0, 6).map((r: any) => (
              <div key={r.rep_id} className="flex justify-between text-xs border border-neutral-800 rounded px-2 py-1">
                <span>{r.rep_name ?? r.rep_id}</span>
                <span>{r.activities_completed}/{r.activities_created}</span>
              </div>
            ))}
          </div>

        </div>

      </div>

      {/* Secondary row of stubs (optional) */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-neutral-800 p-4">
          <div className="text-sm opacity-70">Avg. Handle Time</div>
          <div className="text-2xl font-semibold">—</div>
          <div className="mt-2"><Sparkline className="text-neutral-300" data={trends?.aht} /></div>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <div className="text-sm opacity-70">Objection Wins</div>
          <div className="text-2xl font-semibold">—</div>
          <div className="mt-2"><Sparkline className="text-emerald-400" /></div>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <div className="text-sm opacity-70">Follow-ups Sent</div>
          <div className="text-2xl font-semibold">—</div>
          <div className="mt-2"><Sparkline className="text-sky-400" /></div>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <div className="text-sm opacity-70">Rep Activity</div>
          <div className="text-2xl font-semibold">—</div>
          <div className="mt-2"><Sparkline className="text-amber-400" /></div>
        </div>
      </div>
    </div>
  );
}