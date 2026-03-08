"use client";

import { useCallback, useEffect, useState } from "react";
import html2canvas from "html2canvas";
import { proxyFetch } from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
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

/* --------------------------- Component --------------------------- */

export default function AnalyticsPage() {
  const [conversion, setConversion] = useState<StageConversion[]>([]);
  const [scoreTrend, setScoreTrend] = useState<ScorePoint[]>([]);
  const [repActivity, setRepActivity] = useState<RepActivity[]>([]);
  const [repOptions, setRepOptions] = useState<RepOption[]>([]);

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

  /* ---------------------------- Render ---------------------------- */

  return (
    <div className="px-12 py-10 max-w-[1400px] mx-auto space-y-10">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Analytics</h1>
          <p className="text-neutral-400 text-sm mt-1">
            Performance insights across your sales organisation
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
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
            className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* KPI CARDS */}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

        <Card
          title="Activities Created"
          value={totalActivities}
          subtitle="Total tasks generated"
        />

        <Card
          title="Tasks Completed"
          value={completedActivities}
          subtitle="Completed coaching actions"
        />

        <Card
          title="Avg Call Score"
          value={avgScore}
          subtitle="Average review score"
        />

        <Card
          title="Pipeline Events"
          value={conversionTotal}
          subtitle="Stage transitions"
        />

      </div>

      {/* HERO CHART */}

      <div id="score-performance-card" className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-medium">Score Performance</h2>
            <p className="text-xs text-neutral-400">Average call score trend</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => exportCSV("score_trend.csv", scoreTrend)}
              className="px-3 py-2 text-sm bg-neutral-800 rounded-lg"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => void exportPNG("score-performance-card", "score-performance.png")}
              className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800"
            >
              Export PNG
            </button>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={scoreTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />

            <XAxis
              dataKey="day"
              tick={{ fill: "#9ca3af", fontSize: 12 }}
            />

            <YAxis
              tick={{ fill: "#9ca3af", fontSize: 12 }}
            />

            <Tooltip
              contentStyle={{
                background: "#111",
                border: "1px solid #333",
                borderRadius: "8px"
              }}
            />

            <Line
              type="monotone"
              dataKey="avg_score"
              stroke="#60a5fa"
              strokeWidth={3}
              dot={false}
            />

          </LineChart>
        </ResponsiveContainer>

      </div>

      {/* SECONDARY GRID */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Stage Conversion */}

        <div id="conversion-by-stage-card" className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">

          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-neutral-300">
              Conversion by Stage
            </h3>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => exportCSV("conversion-by-stage.csv", conversion)}
                className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => void exportPNG("conversion-by-stage-card", "conversion-by-stage.png")}
                className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800"
              >
                Export PNG
              </button>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={conversion}>

              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />

              <XAxis
                dataKey="stage"
                tick={{ fill: "#9ca3af", fontSize: 12 }}
              />

              <YAxis
                tick={{ fill: "#9ca3af", fontSize: 12 }}
              />

              <Tooltip
                contentStyle={{
                  background: "#111",
                  border: "1px solid #333",
                  borderRadius: "8px"
                }}
              />

              <Bar
                dataKey="count"
                fill="#3b82f6"
                radius={[6, 6, 0, 0]}
              />

            </BarChart>
          </ResponsiveContainer>

        </div>


        {/* Rep Activity */}

        <div id="activity-by-rep-card" className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">

          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-neutral-300">
              Activity by Rep
            </h3>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => exportCSV("activity-by-rep.csv", repActivity)}
                className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => void exportPNG("activity-by-rep-card", "activity-by-rep.png")}
                className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800"
              >
                Export PNG
              </button>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={repActivity}>

              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />

              <XAxis
                dataKey="rep_name"
                tick={{ fill: "#9ca3af", fontSize: 12 }}
              />

              <YAxis
                tick={{ fill: "#9ca3af", fontSize: 12 }}
              />

              <Tooltip
                contentStyle={{
                  background: "#111",
                  border: "1px solid #333",
                  borderRadius: "8px"
                }}
              />

              <Bar
                dataKey="activities_created"
                fill="#8b5cf6"
                radius={[6, 6, 0, 0]}
              />

            </BarChart>
          </ResponsiveContainer>

        </div>

      </div>

    </div>
  );
}

/* --------------------------- KPI Card --------------------------- */

function Card({ title, value, subtitle }: any) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">

      <div className="text-xs uppercase tracking-wide text-neutral-400">
        {title}
      </div>

      <div className="text-3xl font-semibold mt-2">
        {value}
      </div>

      <div className="text-xs text-neutral-500 mt-2">
        {subtitle}
      </div>

    </div>
  );
}
