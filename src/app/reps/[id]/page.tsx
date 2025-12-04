'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import clsx from 'clsx';
import { getRepOverview, getRewards, selectTitle, listCoachAssignments, getSparringSessionsByRep, getRepXp } from '@/lib/api';
import XpProgress from '@/components/XpProgress';

// Recharts (dynamic to avoid SSR issues)
const LineChart = dynamic(() => import('recharts').then(m => m.LineChart), { ssr: false });
const Line = dynamic(() => import('recharts').then(m => m.Line), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });

type TrendPoint = { date: string; value: number };
type RepOverview = {
  rep: { id: string; name: string; email?: string; avatar_url?: string | null };
  xp: number;
  tier: string;
  totals: { calls: number; avgScore: number; winRate?: number | null };
  trends: { xp: TrendPoint[]; score: TrendPoint[]; voice?: TrendPoint[] };
  recent?: {
    assignments?: Array<{ id: string; title: string; status: 'open' | 'done' | 'completed'; created_at: string }>;
    calls?: Array<{ id: string; created_at: string; score: number }>;
    activity?: Array<{ id: string; t: string; text: string }>;
    sparring?: Array<{ id: string; persona_id?: string; personaId?: string; total?: number; created_at: string }>;
  };
};

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx('rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-4 md:p-5 shadow-sm', className)}>{children}</div>;
}
function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-sm text-white/60">{label}</span>
      <span className="text-2xl font-semibold text-white">{value}</span>
      {hint ? <span className="text-xs text-white/50 mt-0.5">{hint}</span> : null}
    </div>
  );
}
function XPBadge({ xp, tier }: { xp: number; tier: string }) {
  const colour =
    tier === 'Gold' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' :
    tier === 'Silver' ? 'bg-slate-400/20 text-slate-200 border-slate-400/30' :
    tier === 'Platinum' ? 'bg-indigo-400/20 text-indigo-200 border-indigo-400/30' :
    'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  return (
    <div className={clsx('inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm border', colour)}>
      <span className="font-medium">{tier}</span><span className="opacity-80">•</span><span>{xp} XP</span>
    </div>
  );
}
function SectionHeader({ title, cta }: { title: string; cta?: React.ReactNode }) {
  return <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">{title}</h3>{cta}</div>;
}
function MiniList({ items, empty, renderItem }:{ items:any[]|undefined; empty:string; renderItem:(x:any)=>React.ReactNode }) {
  if (!items || items.length === 0) return <div className="text-white/60 text-sm">{empty}</div>;
  return <ul className="space-y-2">{items.map(renderItem)}</ul>;
}
function formatPct(n?: number | null) {
  if (n == null) return '—';
  const pct = n <= 1 ? n * 100 : n;
  return `${pct.toFixed(0)}%`;
}

function XpChip({ xp }: { xp: number | null | undefined }) {
  if (xp == null) return null;
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-emerald-600/15 text-emerald-300 text-xs px-2 py-0.5">
      +{xp} XP
    </span>
  );
}

function LineSkeleton(){ return <div className="h-52 w-full animate-pulse rounded-xl bg-white/10" />; }

const badges = [
  { id: 'top_closer', label: 'Top Closer', icon: '🥇' },
  { id: 'tone_master', label: 'Tone Master', icon: '🎤' },
  { id: 'come_back_king', label: 'Comeback King', icon: '🔥' }
];

export default function RepProfilePage() {
  const { id } = useParams() as { id: string };
  const [data, setData] = useState<RepOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [rewards, setRewards] = useState<any>(null);
  const [titlePickerOpen, setTitlePickerOpen] = useState(false);
  const [equippedTitle, setEquippedTitle] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState<string | null>(null);
  // Canonical XP total fetched from /v1/reps/:id/xp
  const [xpTotal, setXpTotal] = useState<number | null>(null);
  // Load canonical XP from backend aggregator
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { total_xp } = await getRepXp(id);
        if (mounted) setXpTotal(total_xp);
      } catch (e) {
        // non-fatal; keep existing data.xp as fallback
        console.warn('getRepXp failed (safe fallback to data.xp):', e);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await getRepOverview(id);
        if (mounted) setData(res);
        // Fallback: if recent assignments aren't included in overview, fetch top 3 for this rep
        try {
          const hasRecentAssignments = Array.isArray(res?.recent?.assignments) && res.recent.assignments.length > 0;
          if (!hasRecentAssignments) {
            const assigns = await listCoachAssignments({ repId: id, limit: 3 });
            if (mounted && Array.isArray(assigns)) {
              setData(prev => {
                const base = prev ?? res ?? {};
                const prevRecent = (base as any).recent ?? {};
                return {
                  ...(base as any),
                  recent: {
                    ...prevRecent,
                    assignments: assigns
                  }
                } as any;
              });
            }
          }
        } catch (err) {
          console.warn('listCoachAssignments fallback failed (safe to ignore):', err);
        }
        // Load rewards (titles/bounties) for this rep
        try {
          const rw = await getRewards(id);
          if (mounted) {
            setRewards(rw);
            const eq =
              rw?.equipped?.titleId ??
              rw?.equippedTitleId ??
              rw?.equipped_title_id ??
              null;
            setEquippedTitle(eq);
          }
        } catch (err) {
          console.warn('getRewards failed (safe to ignore until backend wired):', err);
        }
        // Load recent sparring sessions (top 3)
        try {
          const sessions = await getSparringSessionsByRep(id, 3);
          if (mounted && Array.isArray(sessions)) {
            setData(prev => {
              const base = prev ?? res ?? {};
              const prevRecent = (base as any).recent ?? {};
              return {
                ...(base as any),
                recent: {
                  ...prevRecent,
                  // Store normalised rows
                  sparring: sessions,
                }
              } as any;
            });
          }
        } catch (err) {
          console.warn('getSparringSessionsByRep failed (safe to ignore):', err);
        }
      } catch (e) {
        console.error('Failed to load rep overview', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  const xpTrend = data?.trends?.xp ?? [];
  const scoreTrend = data?.trends?.score ?? [];
  const voiceTrend = data?.trends?.voice ?? [];

  // Build a fallback trend from recent sparring sessions (by day), if needed
  const sparringFallbackTrend: TrendPoint[] = useMemo(() => {
    const sess = data?.recent?.sparring ?? [];
    if (!Array.isArray(sess) || sess.length === 0) return [];
    // Aggregate by YYYY-MM-DD and average total score per day
    const byDay = new Map<string, { sum: number; n: number }>();
    for (const s of sess) {
      if (typeof s?.total !== 'number') continue;
      const d = new Date(s.created_at);
      if (isNaN(d.getTime())) continue;
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      const entry = byDay.get(key) ?? { sum: 0, n: 0 };
      entry.sum += s.total;
      entry.n += 1;
      byDay.set(key, entry);
    }
    const points: TrendPoint[] = Array.from(byDay.entries())
      .map(([date, { sum, n }]) => ({ date, value: Math.round(sum / n) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return points;
  }, [data?.recent?.sparring]);

  // Choose chart data: prefer provided xpTrend, then scoreTrend, then sparring-derived
  const xpChartData: TrendPoint[] =
    (Array.isArray(xpTrend) && xpTrend.length > 0) ? xpTrend
    : (Array.isArray(scoreTrend) && scoreTrend.length > 0) ? scoreTrend
    : sparringFallbackTrend;

  function labelForTitle(title: any): string {
    if (!title) return '—';
    return title.label ?? title.name ?? title.id ?? 'Title';
  }
  const ownedTitles: any[] = Array.isArray(rewards?.titles)
    ? rewards.titles.filter((t: any) => t.owned !== false) // default to owned if backend doesn't send flag
    : [];
  const equippedTitleObj = ownedTitles.find((t: any) => t.id === equippedTitle);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-white/10 overflow-hidden">
            {data?.rep?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.rep.avatar_url} alt={data.rep.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full grid place-items-center text-white/70">
                {data?.rep?.name?.[0]?.toUpperCase() ?? 'R'}
              </div>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{data?.rep?.name ?? 'Rep'}</h1>
            <div className="text-white/60 text-sm">{data?.rep?.email}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {data ? <XPBadge xp={data.xp} tier={data.tier} /> : null}
          <div className="flex items-center gap-3 mt-1">
            {badges.map(b => (
              <div key={b.id} className="flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-xs text-white/80 select-none">
                <span>{b.icon}</span>
                <span>{b.label}</span>
              </div>
            ))}
            <div className="text-xs text-white/60 italic select-none">+ earned titles</div>
          </div>
          {/* XP Progress */}
          <div className="w-64 mt-1">
            <div className="text-xs uppercase tracking-wide text-white/60 mb-1 text-right">XP Progress</div>
            <XpProgress xp={xpTotal ?? data?.xp ?? 0} />
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/assign?repId=${id}`} className="rounded-xl bg-white text-black px-3 py-2 text-sm font-medium hover:bg-white/90">Assign Drill</Link>
            <Link href={`/sparring?repId=${id}`} className="rounded-xl bg-black/60 border border-white/15 px-3 py-2 text-sm font-medium hover:bg-black/50">Open Sparring</Link>
          </div>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><Stat label="Total Calls" value={loading ? '—' : (data?.totals?.calls ?? 0)} /></Card>
        <Card><Stat label="Avg Score" value={loading ? '—' : `${(data?.totals?.avgScore ?? 0).toFixed(0)}`} hint="/100" /></Card>
        <Card><Stat label="Win Rate" value={loading ? '—' : formatPct(data?.totals?.winRate ?? null)} /></Card>
      </div>

      {/* Badges & Titles card */}
      <Card>
        <SectionHeader
          title="Badges & Titles"
          cta={
            <div className="flex items-center gap-3">
              <button
                onClick={() => setTitlePickerOpen(true)}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
              >
                {equippedTitle ? 'Change Title' : 'Choose Title'}
              </button>
              <Link href="/rewards" className="text-sm text-white/70 hover:underline">
                View all rewards
              </Link>
            </div>
          }
        />
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Current Title */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs text-white/60 mb-1">Equipped Title</div>
            <div className="text-white/90 font-semibold">
              {equippedTitleObj ? labelForTitle(equippedTitleObj) : equippedTitle ?? 'None selected'}
            </div>
            {equippedTitle && !equippedTitleObj ? (
              <div className="text-xs text-amber-300/80 mt-1">Unknown title id (backend not synced)</div>
            ) : null}
          </div>

          {/* Some sample badges (static for now) */}
          <div className="md:col-span-2 grid grid-cols-3 gap-3">
            {badges.map(badge => (
              <div key={badge.id} className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center cursor-default select-none hover:bg-white/10 transition">
                <div className="text-2xl">{badge.icon}</div>
                <div className="text-xs font-semibold text-white/90">{badge.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Title Picker Modal (client-side only) */}
        {titlePickerOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setTitlePickerOpen(false)} />
            <div className="relative z-10 w-[92vw] max-w-lg rounded-2xl border border-white/10 bg-black/80 backdrop-blur p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-lg font-semibold">Select a Title</div>
                <button className="text-white/60 hover:text-white" onClick={() => setTitlePickerOpen(false)}>✕</button>
              </div>
              <div className="max-h-[50vh] overflow-y-auto space-y-2">
                {ownedTitles.length === 0 ? (
                  <div className="text-sm text-white/70">
                    No titles yet. Earn titles from assignments, call milestones, or bounties.
                  </div>
                ) : ownedTitles.map((t: any) => {
                  const isEquipped = t.id === equippedTitle;
                  return (
                    <div key={t.id} className={clsx(
                      'flex items-center justify-between rounded-xl border px-3 py-2',
                      isEquipped ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/10 bg-white/5'
                    )}>
                      <div className="flex items-center gap-3">
                        <div className="text-xl">🏷️</div>
                        <div>
                          <div className="text-white/90 font-medium">{labelForTitle(t)}</div>
                          {t.desc || t.description ? (
                            <div className="text-xs text-white/60">{t.desc || t.description}</div>
                          ) : null}
                        </div>
                      </div>
                      <button
                        disabled={savingTitle === t.id || isEquipped}
                        onClick={async () => {
                          try {
                            setSavingTitle(t.id);
                            await selectTitle(id, t.id);
                            setEquippedTitle(t.id);
                            setTitlePickerOpen(false);
                          } catch (err: any) {
                            console.error('selectTitle failed', err);
                            alert(`Failed to equip title: ${err?.message || err}`);
                          } finally {
                            setSavingTitle(null);
                          }
                        }}
                        className={clsx(
                          'rounded-lg px-3 py-1.5 text-sm border',
                          isEquipped
                            ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10 cursor-default'
                            : 'border-white/20 text-white/90 bg-white/10 hover:bg-white/15'
                        )}
                      >
                        {isEquipped ? 'Equipped' : (savingTitle === t.id ? 'Saving…' : 'Equip')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Trends */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <SectionHeader title="XP Trend" cta={<span className="text-xs text-white/50">Last 30 days</span>} />
          <div className="mt-3 h-56 relative">
            {(!xpChartData || xpChartData.length === 0) ? (
              <div className="absolute inset-0 grid place-items-center text-white/60 text-sm border border-white/10 rounded-xl bg-white/5">
                No data yet — complete calls or sparring to populate this chart.
              </div>
            ) : null}
            <Suspense fallback={<LineSkeleton />}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={xpChartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </Suspense>
          </div>
        </Card>
        <Card>
          <SectionHeader title="Voice Personality (beta)" />
          <div className="mt-3 h-56">
            <Suspense fallback={<LineSkeleton />}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={voiceTrend.length ? voiceTrend : scoreTrend}>
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </Suspense>
          </div>
        </Card>
      </div>

      {/* Recent items */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <SectionHeader title="Recent Calls" cta={<Link href={`/calls?repId=${id}`} className="text-sm text-white/70 hover:underline">View all</Link>} />
          <div className="mt-3">
            <MiniList
              items={data?.recent?.calls}
              empty="No recent calls."
              renderItem={(c: any) => (
                <li key={c.id} className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2">
                  <div className="text-sm">
                    <div className="text-white/90">Call {c.id.slice(0, 8)}…</div>
                    <div className="text-white/50">{new Date(c.created_at).toLocaleString()}</div>
                  </div>
                  <div className={clsx(
                    'text-sm px-2 py-1 rounded-lg border',
                    c.score >= 80 ? 'border-green-500/40 text-green-300 bg-green-500/10' :
                    c.score >= 60 ? 'border-amber-500/40 text-amber-300 bg-amber-500/10' :
                                    'border-red-500/40 text-red-300 bg-red-500/10'
                  )}>
                    {c.score.toFixed(0)}
                  </div>
                  <Link href={`/calls/${c.id}`} className="text-sm text-white/70 hover:underline">Open</Link>
                </li>
              )}
            />
          </div>
        </Card>
        <div className="space-y-4">
          <Card>
            <SectionHeader title="Recent Assignments" cta={<Link href={`/assignments?repId=${id}`} className="text-sm text-white/70 hover:underline">Manage</Link>} />
            <div className="mt-3">
              <MiniList
                items={Array.isArray(data?.recent?.assignments) ? data!.recent!.assignments.slice(0, 3) : []}
                empty="No open assignments."
                renderItem={(a: any) => (
                  <li key={a.id} className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2">
                    <div className="text-sm">
                      <div className="text-white/90">{a.title || 'Drill'}</div>
                      <div className="text-white/50">{new Date(a.created_at).toLocaleDateString()}</div>
                    </div>
                    <span className={clsx(
                      'text-xs rounded-full px-2 py-0.5 border',
                      (a.status === 'done' || a.status === 'completed')
                        ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                        : 'border-white/15 text-white/70 bg-white/5'
                    )}>
                      {a.status}
                    </span>
                    <Link href={`/assignments/${a.id}`} className="text-sm text-white/70 hover:underline">Open</Link>
                  </li>
                )}
              />
            </div>
          </Card>
          <Card>
            <SectionHeader
              title="3 Most Recent Sparring Sessions"
              cta={<Link href={`/sparring?repId=${id}`} className="text-sm text-white/70 hover:underline">Open Sparring</Link>}
            />
            <Link href={`/reps/${params.id}/sparring`} className="text-xs underline text-white/60">View all</Link>
            <div className="mt-3">
              <MiniList
                items={Array.isArray(data?.recent?.sparring) ? data!.recent!.sparring.slice(0, 3) : []}
                empty="No recent sparring."
                renderItem={(s: any) => {
                  const persona = s.persona_id || s.personaId || 'persona';
                  const scoreVal = (typeof s.total_score === 'number') ? Math.round(Number(s.total_score)) : (typeof s.total === 'number' ? Math.round(Number(s.total)) : null);
                  const scoreText = scoreVal != null ? String(scoreVal) : '—';
                  const xp = (typeof s.xp_awarded === 'number') ? s.xp_awarded : (typeof s.xp === 'number' ? s.xp : null);
                  return (
                    <li key={s.id} className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2">
                      <div className="text-sm">
                        <div className="text-white/90 capitalize" title={`Persona difficulty: ${persona}`}>
                          {persona.replace(/_/g, ' ')}
                          <XpChip xp={xp} />
                        </div>
                        <div className="text-white/50">{new Date(s.created_at).toLocaleString()}</div>
                      </div>
                      <div className={clsx(
                        'text-sm px-2 py-1 rounded-lg border',
                        scoreVal != null
                          ? (scoreVal >= 80
                              ? 'border-green-500/40 text-green-300 bg-green-500/10'
                              : scoreVal >= 60
                                ? 'border-amber-500/40 text-amber-300 bg-amber-500/10'
                                : 'border-red-500/40 text-red-300 bg-red-500/10')
                          : 'border-white/15 text-white/70 bg-white/5'
                      )}>
                        {scoreText}
                      </div>
                      <Link href={`/sparring?repId=${id}&sessionId=${s.id}`} className="text-sm text-white/70 hover:underline">Open</Link>
                    </li>
                  );
                }}
              />
            </div>
          </Card>
          <Card>
            <SectionHeader title="Activity Feed" />
            <div className="mt-3">
              <MiniList
                items={data?.recent?.activity}
                empty="No recent activity."
                renderItem={(ev: any) => (
                  <li key={ev.id} className="text-sm rounded-xl border border-white/10 px-3 py-2">
                    <div className="text-white/80">{ev.text}</div>
                    <div className="text-white/50">{new Date(ev.t).toLocaleString()}</div>
                  </li>
                )}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}