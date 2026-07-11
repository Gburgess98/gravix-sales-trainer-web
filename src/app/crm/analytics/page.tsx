"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import html2canvas from "html2canvas";
import { proxyFetch } from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button, buttonClasses } from "@/components/ui/button";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer
} from "recharts";

/* ----------------------------- Types ----------------------------- */

type StageConversion = { stage: string; count: number };
type ScorePoint = { day: string; avg_score: number };
type RepActivity = {
  rep_id: string;
  rep_name?: string;
  activities_created: number;
  activities_completed: number;
};

type RepOption = {
  rep_id: string;
  rep_name?: string;
};

/* ------------------------- Chart styling ------------------------- */
// Recharts writes these as SVG presentation attributes, so CSS variables
// can't be used here — hex values mirror the brand (indigo) token palette.
const CHART_LINE = "#818cf8"; // brand-400
const CHART_BAR = "#6366f1"; // brand-500
const CHART_GRID = "#1f1f22";
const CHART_TICK = { fill: "#9ca3af", fontSize: 12 };
const CHART_TOOLTIP = {
  background: "#0a0a0a",
  border: "1px solid #333",
  borderRadius: "8px"
};

const SELECT_CLASS =
  "rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200 shadow-md shadow-black/20 focus:border-brand-500/50 focus:outline-none";

// Display-only label — never surface a raw UUID; exports keep full fidelity.
function repLabel(rep: { rep_id: string; rep_name?: string }) {
  const name = rep.rep_name?.trim();
  return name || `Rep ${rep.rep_id.slice(0, 6)}`;
}

/* --------------------------- Component --------------------------- */

export default function AnalyticsPage() {
  const [conversion, setConversion] = useState<StageConversion[]>([]);
  const [scoreTrend, setScoreTrend] = useState<ScorePoint[]>([]);
  const [repActivity, setRepActivity] = useState<RepActivity[]>([]);
  const [repOptions, setRepOptions] = useState<RepOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [days, setDays] = useState(30);
  const [selectedRep, setSelectedRep] = useState<string>("all");

  const load = useCallback(async () => {
    const cacheKey = `crm:analytics:${days}:${selectedRep}`;

    try {
      const cached = sessionStorage.getItem(cacheKey);

      if (cached) {
        const parsed = JSON.parse(cached);

        if (parsed?.conversion) setConversion(parsed.conversion);
        if (parsed?.scoreTrend) setScoreTrend(parsed.scoreTrend);
        if (parsed?.repActivity) setRepActivity(parsed.repActivity);
      }
    } catch {}

    const repParam = selectedRep !== "all" ? `&repId=${encodeURIComponent(selectedRep)}` : "";

    try {
      const conv = await proxyFetch(
        `/v1/crm/analytics/stage-conversion?days=${days}${repParam}`,
        { cache: "no-store" }
      );
      const convJson = await conv.json();

      const score = await proxyFetch(
        `/v1/crm/analytics/score-trend?days=${days}${repParam}`,
        { cache: "no-store" }
      );
      const scoreJson = await score.json();

      const rep = await proxyFetch(
        `/v1/crm/analytics/activity-by-rep?days=${days}${repParam}`,
        { cache: "no-store" }
      );
      const repJson = await rep.json();

      const stagesObj = convJson?.stages ?? {};
      const stageRows: StageConversion[] = Object.entries(stagesObj).map(([stage, count]) => ({
        stage,
        count: Number(count ?? 0),
      }));

      const trendRows: ScorePoint[] = Array.isArray(scoreJson?.trend)
        ? scoreJson.trend.map((x: any) => ({
            day: String(x?.date ?? ""),
            avg_score: Number(x?.avg_score ?? 0),
          }))
        : [];

      const repRows: RepActivity[] = Array.isArray(repJson?.reps) ? repJson.reps : [];

      setConversion(stageRows);
      setScoreTrend(trendRows);
      setRepActivity(repRows);
      setLoadError(false);

      try {
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({
            conversion: stageRows,
            scoreTrend: trendRows,
            repActivity: repRows,
          })
        );
      } catch {}
    } catch {
      setLoadError(true);
    } finally {
      setLoaded(true);
    }
  }, [days, selectedRep]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("analytics-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "calls",
        },
        () => {
          void load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const rep = await proxyFetch(`/v1/crm/analytics/activity-by-rep?days=90`, {
          cache: "no-store",
        });
        const repJson = await rep.json();
        if (!alive) return;

        const reps: RepOption[] = Array.isArray(repJson?.reps)
          ? repJson.reps.map((r: any) => ({
            rep_id: String(r?.rep_id ?? ""),
            rep_name: r?.rep_name ? String(r.rep_name) : undefined,
          }))
          : [];

        setRepOptions(reps);
      } catch {
        if (alive) setRepOptions([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  function exportCSV(filename: string, rows: Array<Record<string, any>>) {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((h) => {
            const v = row[h] ?? "";
            const s = String(v).replace(/"/g, '""');
            return `"${s}"`;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPNG(elementId: string, filename: string) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const svg = el.querySelector("svg");

    // Prefer exporting the chart SVG directly because html2canvas can choke on
    // modern CSS colour functions like oklch used elsewhere in the app.
    if (svg) {
      const svgClone = svg.cloneNode(true) as SVGSVGElement;
      const width = Number(svg.getAttribute("width")) || svg.clientWidth || 1200;
      const height = Number(svg.getAttribute("height")) || svg.clientHeight || 500;

      svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svgClone.setAttribute("width", String(width));
      svgClone.setAttribute("height", String(height));

      const svgData = new XMLSerializer().serializeToString(svgClone);
      const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const img = new Image();
      img.crossOrigin = "anonymous";

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("svg_export_failed"));
        img.src = url;
      });

      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = height * 2;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return;
      }

      ctx.scale(2, 2);
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      URL.revokeObjectURL(url);

      const link = document.createElement("a");
      link.download = filename;
      link.href = canvas.toDataURL("image/png");
      link.click();
      return;
    }

    // Fallback for non-chart blocks.
    const canvas = await html2canvas(el, {
      backgroundColor: "#0a0a0a",
      scale: 2,
    });

    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  /* -------------------------- KPI Values -------------------------- */

  const totalActivities = repActivity.reduce((a, r) => a + r.activities_created, 0);
  const completedActivities = repActivity.reduce((a, r) => a + r.activities_completed, 0);

  const avgScore = scoreTrend.length
    ? Math.round(scoreTrend.reduce((a, s) => a + s.avg_score, 0) / scoreTrend.length)
    : 0;

  const conversionTotal = conversion.reduce((a, c) => a + c.count, 0);

  const rangeLabel = `last ${days} days`;

  /* ----------------------- Derived reads --------------------------
     Deterministic reads of the figures already on this page — no extra
     fetches, no invented data. Everything below is arithmetic over the
     three analytics responses. */

  // Score direction: first half vs second half of the trend in range.
  let scoreDelta: number | null = null;
  if (scoreTrend.length >= 4) {
    const mid = Math.floor(scoreTrend.length / 2);
    const avgOf = (rows: ScorePoint[]) =>
      rows.reduce((a, s) => a + s.avg_score, 0) / rows.length;
    scoreDelta = Math.round(avgOf(scoreTrend.slice(mid)) - avgOf(scoreTrend.slice(0, mid)));
  }

  const latestScore = scoreTrend.length ? scoreTrend[scoreTrend.length - 1] : null;
  const bestScore = scoreTrend.length
    ? scoreTrend.reduce((a, b) => (b.avg_score > a.avg_score ? b : a))
    : null;
  const lowScore = scoreTrend.length
    ? scoreTrend.reduce((a, b) => (b.avg_score < a.avg_score ? b : a))
    : null;

  const completionRate = totalActivities
    ? Math.round((completedActivities / totalActivities) * 100)
    : null;

  const topRep = repActivity.length
    ? repActivity.reduce((a, b) => (b.activities_created > a.activities_created ? b : a))
    : null;

  const busiestStage = conversion.length
    ? conversion.reduce((a, b) => (b.count > a.count ? b : a))
    : null;

  const signals: Array<{ title: string; detail: string }> = [];
  if (scoreDelta !== null) {
    signals.push({
      title:
        scoreDelta > 0
          ? `Scores trending up ${scoreDelta} pts`
          : scoreDelta < 0
            ? `Scores trending down ${Math.abs(scoreDelta)} pts`
            : "Scores holding steady",
      detail: `Second half of the range vs the first · ${rangeLabel}`,
    });
  }
  if (topRep) {
    signals.push({
      title: `Most coached: ${repLabel(topRep)}`,
      detail: `${topRep.activities_created} tasks created · ${topRep.activities_completed} completed`,
    });
  }
  if (completionRate !== null) {
    signals.push({
      title: `${completionRate}% task completion`,
      detail: `${completedActivities} of ${totalActivities} coaching tasks closed out`,
    });
  }
  if (busiestStage) {
    signals.push({
      title: `Most movement: ${busiestStage.stage}`,
      detail: `${busiestStage.count} stage transitions in range`,
    });
  }

  const scopeLabel =
    selectedRep === "all"
      ? "All reps"
      : repLabel(
          repOptions.find((r) => r.rep_id === selectedRep) ?? { rep_id: selectedRep }
        );

  const repChartData = repActivity.map((r) => ({ ...r, rep_label: repLabel(r) }));

  const nextActions = [
    {
      href: "/coaching?tab=review",
      title: "Open review queue",
      detail: "Score waiting calls and keep feedback moving.",
    },
    {
      href: "/admin/assignments",
      title: "Manage assignments",
      detail: "Turn weak areas into targeted coaching work.",
    },
    {
      href: "/crm/manager",
      title: "Team workspace",
      detail: "Reps, accounts and pipeline in one place.",
    },
  ];

  /* ---------------------------- Render ---------------------------- */

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
            title="Analytics"
            subtitle="Curated performance signals across your sales organisation"
            actions={
              <>
                <select
                  className={SELECT_CLASS}
                  value={selectedRep}
                  onChange={(e) => setSelectedRep(e.target.value)}
                >
                  <option value="all">All reps</option>
                  {repOptions.map((rep) => (
                    <option key={rep.rep_id} value={rep.rep_id}>
                      {repLabel(rep)}
                    </option>
                  ))}
                </select>

                <select
                  className={SELECT_CLASS}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                >
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                </select>
              </>
            }
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-950/80 px-2.5 py-1 text-[11px] text-neutral-400">
              <span className="h-1.5 w-1.5 rounded-full bg-success-400" />
              Live — refreshes as calls are scored
            </span>
            <span className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950/80 px-2.5 py-1 text-[11px] text-neutral-400">
              {scopeLabel} · {rangeLabel}
            </span>
          </div>
        </div>
      </div>

      {loadError && (
        <SectionCard variant="danger" padded>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-danger-200">Analytics could not be loaded</div>
              <p className="mt-0.5 text-xs text-neutral-400">
                Check your connection, then retry. Any cached figures below may be out of date.
              </p>
            </div>
            <Button variant="ghost" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </SectionCard>
      )}

      {/* KPI STRIP */}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="relative col-span-2 overflow-hidden rounded-xl border border-brand-500/20 bg-brand-500/5 px-5 py-4 shadow-md shadow-black/20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_120%_at_100%_-20%,rgba(99,102,241,0.12),transparent_60%)]"
          />
          <div className="relative">
            <div className="text-[10px] uppercase tracking-[0.12em] text-brand-300">
              Avg call score
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <span className="text-4xl font-semibold tabular-nums text-white">
                {scoreTrend.length ? avgScore : "—"}
              </span>
              {scoreDelta !== null && (
                <span
                  className={
                    scoreDelta > 0
                      ? "inline-flex items-center gap-1 rounded-full border border-success-500/20 bg-success-500/10 px-2 py-0.5 text-[11px] font-medium text-success-300"
                      : scoreDelta < 0
                        ? "inline-flex items-center gap-1 rounded-full border border-warning-500/20 bg-warning-500/10 px-2 py-0.5 text-[11px] font-medium text-warning-300"
                        : "inline-flex items-center gap-1 rounded-full border border-neutral-800 px-2 py-0.5 text-[11px] font-medium text-neutral-400"
                  }
                >
                  {scoreDelta > 0 ? "▲" : scoreDelta < 0 ? "▼" : "→"}{" "}
                  {Math.abs(scoreDelta)} pts across range
                </span>
              )}
            </div>
            <div className="mt-1 text-[11px] text-neutral-500">
              Average review score · {rangeLabel}
            </div>
          </div>
        </div>

        <StatCard
          label="Activities created"
          value={totalActivities}
          subtext="Coaching tasks generated"
        />
        <StatCard
          label="Tasks completed"
          value={completedActivities}
          subtext={completionRate !== null ? `${completionRate}% completion rate` : "Completed coaching actions"}
        />
        <StatCard
          label="Pipeline events"
          value={conversionTotal}
          subtext="Stage transitions"
        />
      </div>

      {/* SIGNALS — derived from the figures above, no extra fetches */}

      <SectionCard
        variant="ai"
        eyebrow="Signals"
        title="This range at a glance"
        subtitle="Read automatically from the figures in this range"
        padded
      >
        {signals.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {signals.map((s) => (
              <div
                key={s.title}
                className="flex gap-2.5 rounded-lg border border-brand-500/10 bg-neutral-950/60 px-3.5 py-3"
              >
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-neutral-200">{s.title}</div>
                  <div className="mt-0.5 text-[11px] text-neutral-500">{s.detail}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-neutral-500">
            Signals appear as calls are reviewed and coaching activity lands in this range.
          </p>
        )}
      </SectionCard>

      {/* HERO — SCORE PERFORMANCE */}

      <SectionCard
        variant="ai"
        eyebrow="Intelligence"
        title="Score performance"
        subtitle={`Average call review score per day · ${rangeLabel}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => exportCSV("score_trend.csv", scoreTrend)}>
              Export CSV
            </Button>
            <Button
              variant="ghost"
              onClick={() => void exportPNG("score-performance-card", "score-performance.png")}
            >
              Export PNG
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row">
          <div id="score-performance-card" className="min-w-0 flex-1">
            {scoreTrend.length ? (
              <ResponsiveContainer width="100%" height={340}>
                <AreaChart data={scoreTrend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="score-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_LINE} stopOpacity={0.26} />
                      <stop offset="100%" stopColor={CHART_LINE} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={CHART_TICK}
                    axisLine={false}
                    tickLine={false}
                    tickMargin={8}
                  />
                  <YAxis domain={[0, 100]} tick={CHART_TICK} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP} cursor={{ stroke: "#333" }} />
                  <Area
                    type="monotone"
                    dataKey="avg_score"
                    name="Avg score"
                    stroke={CHART_LINE}
                    strokeWidth={2.5}
                    fill="url(#score-fill)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : loaded ? (
              <div className="flex h-[340px] items-center justify-center">
                <EmptyState
                  message="No reviewed calls in this range"
                  sub="Score trend builds as calls are uploaded and reviewed."
                  action={{ label: "Upload a call", href: "/upload" }}
                />
              </div>
            ) : (
              <div className="h-[340px] animate-pulse rounded-lg bg-neutral-900/60" />
            )}
          </div>

          {latestScore && bestScore && lowScore && (
            <div className="flex shrink-0 gap-3 lg:w-44 lg:flex-col">
              <div className="flex-1 rounded-lg border border-brand-500/10 bg-neutral-950/60 px-3.5 py-3 lg:flex-none">
                <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Latest</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-white">
                  {Math.round(latestScore.avg_score)}
                </div>
                <div className="text-[10px] text-neutral-600">{latestScore.day}</div>
              </div>
              <div className="flex-1 rounded-lg border border-brand-500/10 bg-neutral-950/60 px-3.5 py-3 lg:flex-none">
                <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Range high</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-white">
                  {Math.round(bestScore.avg_score)}
                </div>
                <div className="text-[10px] text-neutral-600">{bestScore.day}</div>
              </div>
              <div className="flex-1 rounded-lg border border-brand-500/10 bg-neutral-950/60 px-3.5 py-3 lg:flex-none">
                <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Range low</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-white">
                  {Math.round(lowScore.avg_score)}
                </div>
                <div className="text-[10px] text-neutral-600">{lowScore.day}</div>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* SECONDARY GRID */}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          title="Conversion by stage"
          subtitle={`Pipeline stage transitions · ${rangeLabel}`}
          actions={
            <>
              <Button variant="ghost" onClick={() => exportCSV("conversion-by-stage.csv", conversion)}>
                Export CSV
              </Button>
              <Button
                variant="ghost"
                onClick={() => void exportPNG("conversion-by-stage-card", "conversion-by-stage.png")}
              >
                Export PNG
              </Button>
            </>
          }
        >
          <div id="conversion-by-stage-card" className="px-5 py-4">
            {conversion.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={conversion} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="conversion-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_BAR} stopOpacity={0.9} />
                      <stop offset="100%" stopColor={CHART_BAR} stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="stage" tick={CHART_TICK} axisLine={false} tickLine={false} tickMargin={8} />
                  <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP} cursor={{ fill: "rgba(99,102,241,0.06)" }} />
                  <Bar
                    dataKey="count"
                    name="Transitions"
                    fill="url(#conversion-fill)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : loaded ? (
              <div className="relative h-[260px]">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-6 bottom-2 flex h-32 items-end gap-4"
                >
                  {[42, 68, 34, 56, 26, 48].map((h, i) => (
                    <div
                      key={i}
                      className="w-full rounded-t border border-neutral-800/60 bg-neutral-900/30"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
                <div className="relative flex h-full items-center justify-center">
                  <EmptyState
                    message="No stage transitions in this range"
                    sub="As deals move between pipeline stages, conversion builds here automatically."
                  />
                </div>
              </div>
            ) : (
              <div className="h-[260px] animate-pulse rounded-lg bg-neutral-900/60" />
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Activity by rep"
          subtitle={`Coaching activities created per rep · ${rangeLabel}`}
          actions={
            <>
              <Button variant="ghost" onClick={() => exportCSV("activity-by-rep.csv", repActivity)}>
                Export CSV
              </Button>
              <Button
                variant="ghost"
                onClick={() => void exportPNG("activity-by-rep-card", "activity-by-rep.png")}
              >
                Export PNG
              </Button>
            </>
          }
        >
          <div id="activity-by-rep-card" className="px-5 py-4">
            {repActivity.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={repChartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rep-activity-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_BAR} stopOpacity={0.9} />
                      <stop offset="100%" stopColor={CHART_BAR} stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="rep_label" tick={CHART_TICK} axisLine={false} tickLine={false} tickMargin={8} />
                  <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP} cursor={{ fill: "rgba(99,102,241,0.06)" }} />
                  <Bar
                    dataKey="activities_created"
                    name="Created"
                    fill="url(#rep-activity-fill)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : loaded ? (
              <div className="flex h-[260px] items-center justify-center">
                <EmptyState
                  message="No rep activity in this range"
                  sub="Activity appears as coaching tasks are created for reps."
                />
              </div>
            ) : (
              <div className="h-[260px] animate-pulse rounded-lg bg-neutral-900/60" />
            )}
          </div>
        </SectionCard>
      </div>

      {/* NEXT ACTIONS */}

      <SectionCard
        title="Act on these insights"
        subtitle="Move from analysis to coaching action"
        actions={
          <Link href="/upload" className={buttonClasses("ghost")}>
            Upload a call
          </Link>
        }
        padded
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {nextActions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group rounded-lg border border-neutral-800/70 bg-neutral-950 px-4 py-3.5 transition-colors hover:border-brand-500/40 hover:bg-brand-500/5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-neutral-100">{a.title}</span>
                <span aria-hidden className="text-neutral-600 transition-colors group-hover:text-brand-300">
                  →
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">{a.detail}</p>
            </Link>
          ))}
        </div>
      </SectionCard>
    </PageContainer>
  );
}
