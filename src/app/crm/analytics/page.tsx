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
  LineChart,
  Line,
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
const CHART_GRID = "#262626";
const CHART_TICK = { fill: "#9ca3af", fontSize: 12 };
const CHART_TOOLTIP = {
  background: "#0a0a0a",
  border: "1px solid #333",
  borderRadius: "8px"
};

const SELECT_CLASS =
  "rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200 shadow-md shadow-black/20 focus:border-brand-500/50 focus:outline-none";

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

  /* ---------------------------- Render ---------------------------- */

  return (
    <PageContainer>
      <PageHeader
        title="Analytics"
        subtitle="Performance intelligence across your sales organisation"
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
                  {rep.rep_name ?? rep.rep_id}
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Activities created"
          value={totalActivities}
          subtext="Coaching tasks generated"
        />
        <StatCard
          label="Tasks completed"
          value={completedActivities}
          subtext="Completed coaching actions"
        />
        <StatCard
          label="Avg call score"
          value={avgScore}
          subtext="Average review score"
        />
        <StatCard
          label="Pipeline events"
          value={conversionTotal}
          subtext="Stage transitions"
        />
      </div>

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
        <div id="score-performance-card" className="px-5 py-4">
          {scoreTrend.length ? (
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={scoreTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="day" tick={CHART_TICK} />
                <YAxis tick={CHART_TICK} />
                <Tooltip contentStyle={CHART_TOOLTIP} />
                <Line
                  type="monotone"
                  dataKey="avg_score"
                  stroke={CHART_LINE}
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : loaded ? (
            <EmptyState
              message="No reviewed calls in this range"
              sub="Score trend builds as calls are uploaded and reviewed."
              action={{ label: "Upload a call", href: "/upload" }}
            />
          ) : (
            <div className="h-[340px] animate-pulse rounded-lg bg-neutral-900/60" />
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
                <BarChart data={conversion}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                  <XAxis dataKey="stage" tick={CHART_TICK} />
                  <YAxis tick={CHART_TICK} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Bar dataKey="count" fill={CHART_BAR} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : loaded ? (
              <EmptyState
                message="No stage transitions in this range"
                sub="Conversion fills in as deals move through the pipeline."
              />
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
                <BarChart data={repActivity}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                  <XAxis dataKey="rep_name" tick={CHART_TICK} />
                  <YAxis tick={CHART_TICK} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Bar dataKey="activities_created" fill={CHART_BAR} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : loaded ? (
              <EmptyState
                message="No rep activity in this range"
                sub="Activity appears as coaching tasks are created for reps."
              />
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
        padded
      >
        <div className="flex flex-wrap gap-2">
          <Link href="/coaching?tab=review" className={buttonClasses("secondary")}>
            Open review queue
          </Link>
          <Link href="/admin/assignments" className={buttonClasses("ghost")}>
            Manage assignments
          </Link>
          <Link href="/crm/manager" className={buttonClasses("ghost")}>
            Team workspace
          </Link>
        </div>
      </SectionCard>
    </PageContainer>
  );
}
