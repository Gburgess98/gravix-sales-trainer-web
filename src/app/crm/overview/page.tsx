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
  type DashboardKpisResp,
} from "@/lib/api";
import { isOpenPath, guardDisabled } from "@/lib/openRoutes";
import { fetchJsonWithRetry } from "@/lib/fetchJsonwithretry";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";

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

// Display-only label — never surface a raw UUID; ids stay intact in state/URLs.
function repShort(id: string, name?: string | null) {
  const n = (name ?? '').trim();
  return n || `Rep ${String(id).slice(0, 6)}`;
}

// Guard sparkline inputs — the KPI series come from a tolerant endpoint shape.
function numericSeries(xs: unknown): number[] {
  return Array.isArray(xs) ? xs.filter((n): n is number => typeof n === 'number' && isFinite(n)) : [];
}

const SELECT_CLASS =
  'rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200 shadow-md shadow-black/20 focus:border-brand-500/50 focus:outline-none';

const TILE_CLASS = 'rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2.5';
const TILE_LABEL = 'text-[10px] uppercase tracking-[0.12em] text-neutral-500';
const CHIP_CLASS =
  'inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-950/80 px-2.5 py-1 text-[11px] text-neutral-400 tabular-nums';

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
        // Day 232 — the API has no objection-aggregation endpoint yet, so this
        // panel keeps its honest empty state rather than importing a phantom
        // helper (the old getTopObjections import never existed in lib/api and
        // only produced build warnings). Wire a real helper here when the
        // endpoint ships.
        const res: any = { ok: true, items: [] };
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
    <PageContainer>
      {/* INTELLIGENCE HERO */}
      <div className="relative overflow-hidden rounded-2xl border border-brand-500/15 bg-neutral-950 shadow-lg shadow-black/30">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_130%_at_85%_-30%,rgba(99,102,241,0.18),transparent_60%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_80%_at_0%_110%,rgba(99,102,241,0.07),transparent_55%)]"
        />
        <div className="relative px-6 py-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-brand-300">
            Gravix Intelligence
          </div>
          <PageHeader
            className="mt-1.5"
            title="Overview"
            subtitle="Snapshot of recent team performance based on analysed calls."
            actions={
              <Link href="/crm/manager" className={buttonClasses('ghost', 'md')}>
                Manager workspace
              </Link>
            }
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {loadingSummary ? (
              <div className="h-6 w-64 animate-pulse rounded-full bg-neutral-900" />
            ) : (
              <>
                <span className={CHIP_CLASS}>
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warning-500" />
                  Open {sumOpen}
                </span>
                <span className={CHIP_CLASS}>
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent-500" />
                  Due soon {sumDueSoon}
                </span>
                <span className={CHIP_CLASS}>
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success-500" />
                  Completed 7d {sumDone7d}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* KPI STRIP */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="relative col-span-2 overflow-hidden rounded-xl border border-brand-500/20 bg-brand-500/5 px-5 py-4 shadow-md shadow-black/20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_120%_at_100%_-20%,rgba(99,102,241,0.12),transparent_60%)]"
          />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-brand-300">
                Avg coaching score
              </div>
              <div className="mt-1 text-4xl font-semibold tabular-nums text-white">
                {typeof trends?.avg_score_overall === 'number' ? Math.round(trends.avg_score_overall) : '—'}
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">
                Across analysed calls · last 90 days
              </div>
            </div>
            <Sparkline
              className="text-brand-400"
              values={numericSeries(trends?.avgScore)}
              width={120}
              height={36}
            />
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800/70 bg-neutral-950 px-4 py-3 shadow-md shadow-black/20">
          <div className={TILE_LABEL}>Total calls</div>
          <div className="mt-1.5 text-2xl font-semibold tabular-nums text-white">
            {typeof trends?.total_calls === 'number' ? trends.total_calls : '—'}
          </div>
          <div className="mt-2">
            <Sparkline className="text-neutral-500" values={numericSeries(trends?.callsAnalyzed)} />
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800/70 bg-neutral-950 px-4 py-3 shadow-md shadow-black/20">
          <div className={TILE_LABEL}>Conversion (90d)</div>
          <div className="mt-1.5 text-2xl font-semibold tabular-nums text-white">
            {pct((trends as any)?.conversion_rate_90d)}
          </div>
          <div className="mt-2">
            <Sparkline className="text-neutral-500" values={numericSeries((trends as any)?.winRate)} />
          </div>
        </div>
      </div>

      {/* PERFORMANCE SIGNALS */}
      <SectionCard
        variant="ai"
        eyebrow="Signals"
        title="Performance signals"
        subtitle="Flags and coaching output across the team · last 7 days"
        padded
      >
        <div>
          <div className={TILE_LABEL}>Flag intelligence</div>

          {loadingFlags ? (
            <div className="mt-2 h-16 animate-pulse rounded-lg bg-neutral-900/60" />
          ) : !flagsSummary?.ok ? (
            <p className="mt-2 text-xs text-neutral-500">
              No flags in this window — flags appear when reviewed calls surface risks.
            </p>
          ) : (
            <>
              <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className={TILE_CLASS}>
                  <div className={TILE_LABEL}>Total flags</div>
                  <div className="mt-0.5 text-lg font-semibold tabular-nums text-warning-300">
                    {flagsSummary.total_flags ?? 0}
                  </div>
                </div>
                <div className={TILE_CLASS}>
                  <div className={TILE_LABEL}>Critical</div>
                  <div className="mt-0.5 text-lg font-semibold tabular-nums text-danger-300">
                    {flagsSummary.critical_flags ?? 0}
                  </div>
                </div>
                <div className={TILE_CLASS}>
                  <div className={TILE_LABEL}>Low score</div>
                  <div className="mt-0.5 text-lg font-semibold tabular-nums text-warning-200">
                    {flagsSummary.low_score_flags ?? 0}
                  </div>
                </div>
                <div className={TILE_CLASS}>
                  <div className={TILE_LABEL}>Top issue</div>
                  <div className="mt-0.5 truncate text-sm font-semibold text-neutral-200">
                    {flagsSummary.top_flag_type ?? '—'}
                  </div>
                </div>
              </div>

              {flagsSummary?.sections?.length > 0 && (
                <div className="mt-4">
                  <div className={TILE_LABEL}>Weakness breakdown</div>
                  <div className="mt-2 space-y-2">
                    {flagsSummary.sections.map((s: any, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2"
                      >
                        <div className="text-sm text-neutral-200">
                          {s.section}
                          <span className="ml-2 text-xs text-neutral-500">({s.count})</span>
                        </div>
                        <button
                          onClick={() => assignDrillFromSection(s.section)}
                          className={buttonClasses('ghost')}
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

        <div className="mt-5 border-t border-brand-500/10 pt-4">
          <div className={TILE_LABEL}>Coaching output</div>

          {loadingReporting ? (
            <div className="mt-2 h-16 animate-pulse rounded-lg bg-neutral-900/60" />
          ) : !reporting?.ok ? (
            <p className="mt-2 text-xs text-neutral-500">
              Reporting builds automatically as calls are analysed and coaching is assigned.
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <div className={TILE_CLASS}>
                <div className={TILE_LABEL}>Critical today</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-danger-300">
                  {reporting.critical_calls_today ?? 0}
                </div>
              </div>
              <div className={TILE_CLASS}>
                <div className={TILE_LABEL}>Flagged (7d)</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-warning-300">
                  {reporting.flagged_calls_this_week ?? 0}
                </div>
              </div>
              <div className={TILE_CLASS}>
                <div className={TILE_LABEL}>Auto-assigned</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-brand-300">
                  {reporting.auto_assignments_created ?? 0}
                </div>
              </div>
              <div className={TILE_CLASS}>
                <div className={TILE_LABEL}>Completion</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-success-300">
                  {reporting.assignment_completion_rate ?? 0}%
                </div>
              </div>
              <div className={TILE_CLASS}>
                <div className={TILE_LABEL}>Weakest skill</div>
                <div className="mt-0.5 truncate text-sm font-semibold text-neutral-200">
                  {reporting.weakest_team_skill?.skill ?? '—'}
                </div>
              </div>
              <div className={TILE_CLASS}>
                <div className={TILE_LABEL}>Reps needing help</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-danger-200">
                  {(reporting.reps_needing_help ?? []).length}
                </div>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* CONTROL CENTRE */}
      <SectionCard
        title="Control Centre"
        subtitle="Which reps need attention — overdue work, open workload, and recent activity · manager view"
        actions={
          <Link href="/crm/manager/control-centre" className={buttonClasses('secondary')}>
            Open Control Centre
          </Link>
        }
        padded
      >
        {loadingControlCentre ? (
          <div className="h-8 animate-pulse rounded-lg bg-neutral-900/60" />
        ) : !controlCentre?.ok ? (
          <div>
            <div className="text-sm text-neutral-300">Control Centre unavailable right now.</div>
            <div className="mt-1 text-xs text-neutral-500" title={String(controlCentre?.error ?? '')}>
              It will load again once team data is reachable for this account.
            </div>
          </div>
        ) : (
          (() => {
            const h = controlCentre?.headline ?? {};
            const repsTotal = Number(h.reps_total ?? 0);
            const atRisk = Number(h.reps_at_risk ?? 0);
            const watch = Number(h.reps_watch ?? 0);
            const overdue = Number(h.overdue_actions_total ?? 0);
            const open = Number(h.open_actions_total ?? 0);

            const atRiskCls =
              atRisk > 0
                ? 'inline-flex items-center rounded-full border border-danger-500/30 bg-danger-500/10 px-2.5 py-1 text-[11px] text-danger-200 tabular-nums'
                : CHIP_CLASS;
            const watchCls =
              watch > 0
                ? 'inline-flex items-center rounded-full border border-warning-500/30 bg-warning-500/10 px-2.5 py-1 text-[11px] text-warning-200 tabular-nums'
                : CHIP_CLASS;
            const overdueCls =
              overdue > 0
                ? 'inline-flex items-center rounded-full border border-danger-500/30 bg-danger-500/10 px-2.5 py-1 text-[11px] text-danger-200 tabular-nums'
                : CHIP_CLASS;

            return (
              <div className="flex flex-wrap gap-2">
                <span className={atRiskCls}>At risk {atRisk}</span>
                <span className={watchCls}>Watch {watch}</span>
                <span className={CHIP_CLASS}>Reps {repsTotal}</span>
                <span className={CHIP_CLASS}>
                  {Number(controlCentre?.headline?.window_days ?? 7)}d window
                </span>

                <span className={`ml-auto ${overdueCls}`}>Overdue actions {overdue}</span>
                <span className={CHIP_CLASS}>Open actions {open}</span>
              </div>
            );
          })()
        )}
      </SectionCard>

      {/* NUDGES */}
      <SectionCard
        title="Nudges"
        subtitle="Who needs attention next — ranked by overdue work, staleness, and open actions."
        actions={
          <>
            <Link href="/crm/manager" className={buttonClasses('ghost')}>
              Manager
            </Link>
            <Link href="/crm/manager/nudges" className={buttonClasses('ghost')}>
              View all
            </Link>
          </>
        }
        padded
      >
        {loadingNudges ? (
          <div className="h-10 animate-pulse rounded-lg bg-neutral-900/60" />
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
              <div className="flex flex-wrap gap-2">
                <span className={CHIP_CLASS}>Tracked {items.length}</span>
                <span className="inline-flex items-center rounded-full border border-danger-500/30 bg-danger-500/10 px-2.5 py-1 text-[11px] text-danger-200 tabular-nums">
                  At risk {counts.at_risk}
                </span>
                <span className="inline-flex items-center rounded-full border border-warning-500/30 bg-warning-500/10 px-2.5 py-1 text-[11px] text-warning-200 tabular-nums">
                  Watch {counts.watch}
                </span>
                <span className="inline-flex items-center rounded-full border border-success-500/20 bg-success-500/10 px-2.5 py-1 text-[11px] text-success-300 tabular-nums">
                  Healthy {counts.healthy}
                </span>
                {counts.unknown ? (
                  <span className={CHIP_CLASS}>Other {counts.unknown}</span>
                ) : null}

                <span className={`ml-auto ${CHIP_CLASS}`}>Overdue {overdueTotal}</span>
                <span className={CHIP_CLASS}>Open {openTotal}</span>
              </div>
            );
          })()
        )}

        {loadingNudges ? (
          <div className="mt-3 h-28 animate-pulse rounded-lg bg-neutral-900/60" />
        ) : !nudges || nudges.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              message="No nudges right now"
              sub="When contacts have open or overdue actions, or go stale, they’ll show up here automatically."
            />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-800 overflow-hidden rounded-lg border border-neutral-800">
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
                  ? "border-danger-500/30 bg-danger-500/10 text-danger-200"
                  : band === "warm" || band === "watch" || band === "warning"
                    ? "border-warning-500/30 bg-warning-500/10 text-warning-200"
                    : band === "healthy"
                      ? "border-success-500/20 bg-success-500/10 text-success-300"
                      : "border-neutral-800 bg-neutral-950/80 text-neutral-400";

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
                  ? "border-danger-500/30 bg-danger-500/10 text-danger-200"
                  : open > 0
                    ? "border-warning-500/30 bg-warning-500/10 text-warning-200"
                    : "border-neutral-800 bg-neutral-950/80 text-neutral-400";

              const RowWrap: any = href ? Link : "div";
              const rowProps = href
                ? { href, className: "block px-3 py-2 hover:bg-neutral-900/40 transition-colors" }
                : { className: "px-3 py-2" };

              return (
                <li key={contactId || `${name}-${email}-${company}`}>
                  <RowWrap {...rowProps}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="truncate text-sm text-neutral-100">{name}</div>
                          {company ? <span className="truncate text-xs text-neutral-500">· {company}</span> : null}
                        </div>

                        <div className="mt-0.5 truncate text-xs text-neutral-500">{email ? email : "—"}</div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] border uppercase ${bandCls}`}>{band}</span>

                          <span className={`rounded-full px-2 py-0.5 text-[11px] border tabular-nums ${urgencyCls}`}>{urgencyLabel}</span>

                          {score != null ? (
                            <span className="rounded-full px-2 py-0.5 text-[11px] border border-neutral-800 bg-neutral-950/80 text-neutral-400 tabular-nums">
                              Score {Math.round(score)}
                            </span>
                          ) : null}

                          <span className="rounded-full px-2 py-0.5 text-[11px] border border-neutral-800 bg-neutral-950/80 text-neutral-400 tabular-nums">
                            {touchedLabel}
                          </span>

                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] border border-neutral-800 bg-neutral-950/80 text-neutral-500 tabular-nums"
                            title="Priority score (higher = more urgent)"
                          >
                            P{isFinite(priority) ? Math.round(priority) : 0}
                          </span>
                        </div>

                        {nextAction ? (
                          <div className="mt-2 text-xs text-neutral-300">
                            <span className="text-neutral-500">Next:</span> {nextAction}
                          </div>
                        ) : null}

                        {reasons.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {reasons.slice(0, 2).map((r: any, idx: number) => (
                              <span
                                key={`${contactId || name}-r-${idx}`}
                                className="text-[11px] rounded-full px-2 py-0.5 border border-neutral-800 bg-neutral-950/80 text-neutral-500"
                              >
                                {String(r)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-[11px] text-neutral-600">Actions</div>
                        <div className="mt-1 text-xs text-neutral-400 tabular-nums">{open}/{overdue}</div>
                      </div>
                    </div>
                  </RowWrap>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
          <div>
            Nudges update automatically as you log notes, complete actions, and touch contacts.
          </div>
          <Link href="/crm/manager/nudges" className="hover:text-neutral-300 transition-colors">
            Open full nudges →
          </Link>
        </div>
      </SectionCard>

      {/* TODAY'S ACTIONS */}
      <SectionCard
        title="Today’s actions"
        subtitle="Queued CRM actions for today"
        actions={
          <Link href="/crm/contacts/import" className={buttonClasses('ghost')}>
            Import leads
          </Link>
        }
        padded
      >
        {loadingTodayActions ? (
          <div className="h-20 animate-pulse rounded-lg bg-neutral-900/60" />
        ) : !todayActions || todayActions.length === 0 ? (
          <EmptyState
            message="No actions queued"
            sub="Open a contact and use Auto-Assign to generate follow-ups."
          />
        ) : (
          <ul className="space-y-2">
            {todayActions.slice(0, 8).map((a) => {
              const due = a.due_at ? new Date(String(a.due_at)) : null;
              const dueLabel = due && isFinite(due.getTime()) ? due.toLocaleString() : null;
              const imp = (a.importance ?? 'normal') as string;
              const impCls =
                imp === 'critical'
                  ? 'border-danger-500/40 text-danger-300 bg-danger-500/10'
                  : imp === 'important'
                    ? 'border-warning-500/40 text-warning-300 bg-warning-500/10'
                    : 'border-neutral-800 text-neutral-400 bg-neutral-950/80';

              const status = (a.status ?? 'open') as string;
              const statusCls =
                status === 'done' || status === 'completed'
                  ? 'border-success-500/40 text-success-300 bg-success-500/10'
                  : 'border-brand-500/30 text-brand-300 bg-brand-500/10';

              const href = a.contact_id ? `/crm/contacts/${encodeURIComponent(String(a.contact_id))}` : null;

              return (
                <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm text-neutral-100 truncate">
                      {href ? (
                        <Link href={href} className="hover:text-brand-300 transition-colors">
                          {a.title}
                        </Link>
                      ) : (
                        a.title
                      )}
                    </div>
                    <div className="text-xs text-neutral-500 truncate">
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
      </SectionCard>

      {/* MANAGER TRUST */}
      <SectionCard
        title="Manager trust"
        subtitle="Assignment follow-through across the team"
        actions={
          <Link href="/admin/assignments" className={buttonClasses('ghost')}>
            Assignments admin
          </Link>
        }
        padded
      >
        {loadingTrust ? (
          <div className="h-5 w-64 animate-pulse rounded bg-neutral-900/60" />
        ) : !trust?.trust ? (
          <p className="text-xs text-neutral-500">
            No trust signal yet — it builds as assignments are completed.
          </p>
        ) : (
          <div className="flex flex-wrap gap-4 text-sm text-neutral-300">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-danger-500" />
              Overdue: <span className="tabular-nums">{trust.trust.overdue ?? 0}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success-500" />
              Completed (7d): <span className="tabular-nums">{trust.trust.completed_7d ?? 0}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-neutral-600" />
              Stale reps: <span className="tabular-nums">{(trust.trust.stale_reps || []).length}</span>
            </span>
          </div>
        )}
      </SectionCard>

      {/* ASSIGNMENTS + OBJECTIONS */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          title="Recent assignments"
          subtitle="Latest coaching work across the team"
          actions={
            <Link href="/assignments" className={buttonClasses('ghost')}>
              View all
            </Link>
          }
          padded
        >
          {loadingA ? (
            <div className="h-24 animate-pulse rounded-lg bg-neutral-900/60" />
          ) : !assignments || assignments.length === 0 ? (
            <EmptyState
              message="No open assignments"
              sub="Assignments appear here as coaching work is created."
            />
          ) : (
            <ul className="space-y-2">
              {assignments.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2">
                  <div className="text-sm min-w-0">
                    <div className="text-neutral-100 truncate">{a.title || 'Coaching task'}</div>
                    <div className="text-neutral-500">
                      {a.rep_name ? `${a.rep_name} · ` : ''}
                      {new Date(a.created_at).toLocaleString()}
                      {a.due_at ? ` · due ${new Date(a.due_at).toLocaleDateString()}` : ''}
                    </div>
                  </div>
                  <span className={clsx(
                    'text-xs rounded-full px-2 py-0.5 border whitespace-nowrap ml-2',
                    (a.status === 'done' || a.status === 'completed')
                      ? 'border-success-500/40 text-success-300 bg-success-500/10'
                      : 'border-brand-500/30 text-brand-300 bg-brand-500/10'
                  )}>
                    {a.status}
                  </span>
                  <Link href={`/assignments/${a.id}`} className="text-sm text-neutral-400 hover:text-brand-300 transition-colors ml-3 shrink-0">Open</Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Top objections" subtitle="Most frequent objections · last period">
          <div className="px-5 py-4 h-64">
            {loadingO ? (
              <div className="h-full animate-pulse rounded-lg bg-neutral-900/60" />
            ) : !objections || objections.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <EmptyState
                  message="No objections logged"
                  sub="Objections build here as calls are analysed."
                />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={objections} margin={{ top: 10, right: 8, left: -8, bottom: 20 }}>
                  <XAxis
                    dataKey="objection"
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    angle={-25}
                    textAnchor="end"
                    interval={0}
                    height={50}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #333', borderRadius: '8px' }} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                  <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
      </div>

      {/* TOP ACCOUNTS + TOP REPS */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Top accounts" subtitle="By average call score">
          <div className="divide-y divide-neutral-800">
            {(trends?.top_accounts?.length ?? 0) === 0 && (
              <EmptyState
                message="No account scores yet"
                sub="Accounts rank here as their calls are scored."
              />
            )}
            {(trends?.top_accounts ?? []).map((a: any, idx: number) => (
              <div key={a.account_id || a.id || String(idx)} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 text-center" aria-hidden>
                    <span className={`text-xs tabular-nums ${idx < 3 ? 'text-brand-300 font-semibold' : 'text-neutral-500'}`}>#{idx + 1}</span>
                  </div>
                  <Link href={`/crm/accounts/${a.account_id ?? a.id}`} className="truncate text-neutral-100 hover:text-brand-300 transition-colors">
                    {a.name ?? 'Unnamed account'}
                  </Link>
                </div>
                <div className={`text-sm tabular-nums ${scoreColour(a.avg_score)}`} title={`Avg Score ${a.avg_score ?? '—'}`}>
                  {typeof a.avg_score === 'number' ? Math.round(a.avg_score) : '—'}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Top reps"
          subtitle={repFilter ? 'Filtered to one rep' : 'By average call score'}
          actions={
            repFilter ? (
              <Link href="/crm/overview" className={buttonClasses('ghost')}>
                Reset filter
              </Link>
            ) : undefined
          }
        >
          <div className="divide-y divide-neutral-800">
            {(Array.isArray(topRepsAll) ? topRepsAll : []).length === 0 && (
              <EmptyState
                message="No rep scores yet"
                sub="Reps rank here as their calls are scored."
              />
            )}

            {(topReps.length > 0 ? topReps : []).map((r: any, idx: number) => {
              const isActive = repFilter && String(repFilter) === String(r.user_id);
              const rank = idx + 1;
              return (
                <Link
                  key={r.user_id || String(idx)}
                  href={`/crm/reps/${encodeURIComponent(r.user_id)}`}
                  className={`px-4 py-3 flex items-center justify-between hover:bg-neutral-900 ${isActive ? 'bg-neutral-900 border-l-2 border-brand-500' : ''}`}
                  title={isActive ? 'Active filter: this rep' : 'Filter by this rep'}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 text-center" aria-hidden>
                      <span className={`text-xs tabular-nums ${rank <= 3 ? 'text-brand-300 font-semibold' : 'text-neutral-500'}`}>#{rank}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-neutral-100">{r.name ?? 'Rep'}</div>
                      <div className="text-xs text-neutral-500 truncate" title={`Calls: ${r.calls ?? '—'} · Points: ${r.xp ?? '—'}`}>
                        Calls: {r.calls ?? '—'} · Points: {r.xp ?? '—'}
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
        </SectionCard>
      </div>

      {/* CRM ANALYTICS — QUICK VIEW */}
      <SectionCard
        eyebrow="Quick view"
        title="CRM analytics"
        subtitle="Pipeline and coaching output at a glance — the full cockpit lives in Analytics"
        actions={
          <>
            <select
              value={analyticsDays}
              onChange={(e) => setAnalyticsDays(Number(e.target.value))}
              className={SELECT_CLASS}
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>

            <select
              value={analyticsRep ?? ''}
              onChange={(e) => setAnalyticsRep(e.target.value || null)}
              className={SELECT_CLASS}
            >
              <option value="">All reps</option>
              {(activityByRep ?? []).map((r: any) => (
                <option key={r.rep_id} value={r.rep_id}>
                  {repShort(String(r.rep_id), r.rep_name)}
                </option>
              ))}
            </select>

            <Link href="/crm/analytics" className={buttonClasses('secondary')}>
              Open Analytics
            </Link>
          </>
        }
        padded
      >
        {loadingAnalytics ? (
          <div className="h-48 animate-pulse rounded-lg bg-neutral-900/60" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className={TILE_CLASS}>
                <div className={TILE_LABEL}>Opportunities</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-white">
                  {analyticsSummary?.opportunities ?? '—'}
                </div>
              </div>
              <div className={TILE_CLASS}>
                <div className={TILE_LABEL}>Won</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-white">
                  {analyticsSummary?.won ?? '—'}
                </div>
              </div>
              <div className={TILE_CLASS}>
                <div className={TILE_LABEL}>Conversion</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-white">
                  {analyticsSummary?.conversion_rate != null ? `${analyticsSummary.conversion_rate}%` : '—'}
                </div>
              </div>
              <div className={TILE_CLASS}>
                <div className={TILE_LABEL}>Avg score</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-white">
                  {analyticsSummary?.avg_score ?? '—'}
                </div>
              </div>
            </div>

            <div className="mt-5">
              <div className={TILE_LABEL}>Conversion by stage</div>
              {stageConversion && Object.keys(stageConversion).length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(stageConversion).map(([stage, count]) => (
                    <span key={stage} className={CHIP_CLASS}>
                      {stage} · {count}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-neutral-500">
                  Stage movement appears as deals progress through the pipeline.
                </p>
              )}
            </div>

            <div className="mt-5">
              <div className={TILE_LABEL}>Avg score trend</div>
              {(scoreTrend?.length ?? 0) > 0 ? (
                <div className="mt-2 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={scoreTrend ?? []} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #333', borderRadius: '8px' }} />
                      <Line
                        type="monotone"
                        dataKey="avg_score"
                        stroke="#818cf8"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="mt-2 text-xs text-neutral-500">
                  Score trend builds as calls are reviewed in this range.
                </p>
              )}
            </div>

            <div className="mt-5">
              <div className={TILE_LABEL}>Activity by rep</div>
              {(activityByRep?.length ?? 0) > 0 ? (
                <div className="mt-2 space-y-1.5">
                  {(activityByRep ?? []).slice(0, 6).map((r: any) => (
                    <div key={r.rep_id} className="flex justify-between rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-1.5 text-xs">
                      <span className="text-neutral-200">{repShort(String(r.rep_id), r.rep_name)}</span>
                      <span className="text-neutral-400 tabular-nums">{r.activities_completed}/{r.activities_created} completed</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-neutral-500">
                  Rep activity appears as coaching tasks are created.
                </p>
              )}
            </div>
          </>
        )}
      </SectionCard>
    </PageContainer>
  );
}
