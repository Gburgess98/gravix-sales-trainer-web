"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import { proxyFetch } from "@/lib/api";

type TrendPoint = {
  date: string;
  voice_score: number;
};

type DashboardSummary = {
  filler_trend: number[];
  close_strength_score: number | null;
  calls_reviewed_this_week: number;
};

export default function DashboardPage() {
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [latestAvg, setLatestAvg] = useState<number | null>(null);
  const [summary, setSummary] = useState<DashboardSummary>({
    filler_trend: [],
    close_strength_score: null,
    calls_reviewed_this_week: 0,
  });
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    const res = await proxyFetch(
      "/v1/dashboard/voice-score-trend?days=30",
      { cache: "no-store" }
    );

    const data = await res.json();

    if (data.ok) {
      const trendRows: TrendPoint[] = data.trend || [];
      setTrend(trendRows);
      setLatestAvg(data.latest_avg ?? null);

      const fillerTrend = trendRows.slice(-7).map((p) => Math.max(0, 100 - p.voice_score));
      const closeStrengthScore = trendRows.length
        ? Math.round(trendRows.reduce((acc, row) => acc + row.voice_score, 0) / trendRows.length)
        : null;
      const callsReviewedThisWeek = trendRows.slice(-7).length;

      setSummary({
        filler_trend: fillerTrend,
        close_strength_score: closeStrengthScore,
        calls_reviewed_this_week: callsReviewedThisWeek,
      });
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-8 space-y-8">

      {/* Header */}
      <div className="flex flex-col gap-4">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Rep Dashboard</h1>
            <p className="text-neutral-500 text-sm">
              Personal performance insights and coaching signals
            </p>
          </div>
        </div>

        {/* CRM Navigation */}
        <div className="flex flex-wrap gap-2">

          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-800"
          >
            Dashboard
          </Link>

          <Link
            href="/crm/pipeline"
            className="inline-flex items-center rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-800"
          >
            Pipeline
          </Link>

          <Link
            href="/crm/tasks"
            className="inline-flex items-center rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-800"
          >
            Tasks
          </Link>

          <Link
            href="/crm/analytics"
            className="inline-flex items-center rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-800"
          >
            Analytics
          </Link>

        </div>

      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        <div className="bg-neutral-900 rounded-xl p-6 border border-neutral-800">
          <div className="text-xs uppercase tracking-wide text-neutral-400">Filler Word Trend</div>
          <div className="mt-4 h-24">
            {summary.filler_trend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.filler_trend.map((value, idx) => ({ day: idx + 1, value }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis dataKey="day" stroke="#888" />
                  <YAxis stroke="#888" />
                  <Tooltip />
                  <Bar dataKey="value" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-neutral-500 text-sm">No filler data yet</div>
            )}
          </div>
        </div>

        <div className="bg-neutral-900 rounded-xl p-6 border border-neutral-800">
          <div className="text-xs uppercase tracking-wide text-neutral-400">Close Strength Score</div>
          <div className="mt-4 text-4xl font-semibold text-white">
            {summary.close_strength_score ?? "—"}
          </div>
          <div className="mt-2 text-sm text-neutral-500">
            Based on recent voice score performance
          </div>
        </div>

        <div className="bg-neutral-900 rounded-xl p-6 border border-neutral-800">
          <div className="text-xs uppercase tracking-wide text-neutral-400">Calls Reviewed This Week</div>
          <div className="mt-4 text-4xl font-semibold text-white">
            {summary.calls_reviewed_this_week}
          </div>
          <div className="mt-2 text-sm text-neutral-500">
            Voice-scored call sessions in the last 7 points
          </div>
        </div>

      </div>

      {/* Voice Score Card */}
      <div className="bg-neutral-900 rounded-xl p-6 border border-neutral-800">

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Voice Score Trend</h2>

          {latestAvg !== null && (
            <div className="text-sm text-neutral-400">
              Latest Avg:{" "}
              <span className="text-white font-medium">
                {latestAvg}
              </span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-neutral-500 text-sm">
            Loading chart...
          </div>
        ) : (
          <div className="h-72">

            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <XAxis
                  dataKey="date"
                  stroke="#888"
                />

                <YAxis
                  domain={[40, 100]}
                  stroke="#888"
                />

                <Tooltip />

                <Line
                  type="monotone"
                  dataKey="voice_score"
                  stroke="#22C55E"
                  strokeWidth={3}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    if (payload?.voice_score >= 90) {
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill="#EAB308"
                          stroke="#EAB308"
                        />
                      );
                    }
                    return null;
                  }}
                />
              </LineChart>
            </ResponsiveContainer>

          </div>
        )}
      </div>

    </div>
  );
}