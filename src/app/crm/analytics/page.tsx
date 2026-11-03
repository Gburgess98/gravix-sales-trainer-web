"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import html2canvas from "html2canvas";
import { proxyFetch } from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
import { PageShell, PageHead, GlassCard, Panel, PanelHeader, Badge, Segmented, EmptyPanel, ErrorPanel, dsButton, dsField } from "@/components/ds";
import { summariseScores, completionRate, stageBars, repBars } from "@/lib/insights-model";
import {
  AreaChart,
  Area,
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
// can't be used here — hex values mirror the glass-system tokens (blue primary).
const CHART_LINE = "#60a5fa";
const CHART_GRID = "rgba(148,163,184,0.14)";
const CHART_TICK = { fill: "#8b97ab", fontSize: 12 };
const CHART_TOOLTIP = {
  background: "#0d1422",
  border: "1px solid rgba(148,163,184,0.26)",
  borderRadius: "10px"
};

// Display-only label — never surface a raw UUID (Day 213A). The analytics API
// has historically echoed the rep_id back as rep_name (its auth.users name
// lookup fail-softs to the id), so a "name" that is UUID-shaped or equals the
// id must be treated as absent. Preference order: team directory name >
// API-provided name > email local part > short neutral "Rep xxxxxx" label.
// The full rep_id stays internal for filters/queries/state.
const UUID_LIKE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RepDirectoryEntry = { name?: string; email?: string };

function cleanName(value?: string | null, repId?: string): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (UUID_LIKE_RE.test(v)) return null;
  if (repId && v === repId) return null;
  if (v.includes("@")) return null; // emails resolve via local part below
  return v;
}

function emailLocalPart(value?: string | null): string | null {
  const v = value?.trim();
  if (!v || !v.includes("@")) return null;
  const local = v.split("@")[0]?.trim();
  return local || null;
}

function repLabel(
  rep: { rep_id: string; rep_name?: string },
  directory?: Record<string, RepDirectoryEntry>
) {
  const entry = directory?.[rep.rep_id];
  return (
    cleanName(entry?.name, rep.rep_id) ||
    cleanName(rep.rep_name, rep.rep_id) ||
    emailLocalPart(entry?.name) ||
    emailLocalPart(entry?.email) ||
    emailLocalPart(rep.rep_name) ||
    `Rep ${rep.rep_id.slice(0, 6)}`
  );
}

/* --------------------------- Component --------------------------- */

export default function AnalyticsPage() {
  const [conversion, setConversion] = useState<StageConversion[]>([]);
  const [scoreTrend, setScoreTrend] = useState<ScorePoint[]>([]);
  const [repActivity, setRepActivity] = useState<RepActivity[]>([]);
  const [repOptions, setRepOptions] = useState<RepOption[]>([]);
  const [repDirectory, setRepDirectory] = useState<Record<string, RepDirectoryEntry>>({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Coaching impact comes from the existing manager command-centre (team-wide; it has no per-rep filter).
  const [impact, setImpact] = useState<{ completedAssignments: number; skillsImproving: number; skillsDeclining: number; summary: string } | null>(null);

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

      // A failed analytics response is an error state, not "no data".
      if (!conv.ok || !score.ok || !rep.ok) throw new Error("analytics_failed");

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

    // Human names for rep labels (Day 213A) — the analytics endpoints only
    // carry ids, so resolve names from the existing tenant-scoped team list
    // (same endpoint the Upload picker uses). Fail-soft: labels fall back to
    // the short neutral "Rep xxxxxx" form, never the raw UUID.
    (async () => {
      try {
        const team = await proxyFetch(`/v1/team/users?limit=200`, { cache: "no-store" });
        const teamJson = await team.json();
        if (!alive) return;

        const directory: Record<string, RepDirectoryEntry> = {};
        for (const item of Array.isArray(teamJson?.items) ? teamJson.items : []) {
          if (!item?.id) continue;
          directory[String(item.id)] = {
            name: item?.name ? String(item.name) : undefined,
            email: item?.email ? String(item.email) : undefined,
          };
        }
        setRepDirectory(directory);
      } catch {
        if (alive) setRepDirectory({});
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setImpact(null);
    (async () => {
      try {
        const res = await proxyFetch(`/v1/manager/command-centre?days=${days}`, { cache: "no-store" });
        const json = res.ok ? await res.json() : null;
        if (alive && json?.ok && json.coachingImpact) setImpact(json.coachingImpact);
      } catch {
        if (alive) setImpact(null);
      }
    })();
    return () => { alive = false; };
  }, [days]);

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

  /* ------------------------ Derived figures -----------------------
     Arithmetic over the three analytics responses (see src/lib/insights-model.ts);
     nothing here is fetched or invented. */

  const scores = summariseScores(scoreTrend);
  const totalActivities = repActivity.reduce((a, r) => a + r.activities_created, 0);
  const completedActivities = repActivity.reduce((a, r) => a + r.activities_completed, 0);
  const rate = completionRate(totalActivities, completedActivities);
  const conversionTotal = conversion.reduce((a, c) => a + c.count, 0);
  const stages = stageBars(conversion);
  const reps = repBars(repActivity, (r) => repLabel(r, repDirectory));
  const repChartData = reps; // human labels only — raw ids never reach exports (Day 213A)

  const rangeLabel = `last ${days} days`;
  const scopeLabel =
    selectedRep === "all"
      ? "All reps"
      : repLabel(repOptions.find((r) => r.rep_id === selectedRep) ?? { rep_id: selectedRep }, repDirectory);

  const nextActions = [
    { href: "/coaching?tab=review", title: "Open review queue" },
    { href: "/coaching?tab=assignments", title: "Review assignments" },
    { href: "/crm/manager", title: "Team workspace" },
  ];

  const skeleton = <div className="h-[260px] animate-pulse rounded-lg bg-white/[0.05] motion-reduce:animate-none" role="status" aria-label="Loading" />;

  /* ---------------------------- Render ---------------------------- */

  return (
    <PageShell>
      <PageHead
        title="Insights"
        subtitle="Team performance, coaching follow-through and pipeline movement. Updates as calls are scored."
      />

      <GlassCard as="div" className="!p-3 sm:!p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <select
            aria-label="Filter by rep"
            className={`${dsField} md:max-w-xs`}
            value={selectedRep}
            onChange={(e) => setSelectedRep(e.target.value)}
          >
            <option value="all">All reps</option>
            {repOptions.map((rep) => (
              <option key={rep.rep_id} value={rep.rep_id}>
                {repLabel(rep, repDirectory)}
              </option>
            ))}
          </select>
          <Segmented
            label="Date range"
            value={String(days) as "7" | "30" | "90"}
            onChange={(v) => setDays(Number(v))}
            options={[
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
            ]}
          />
        </div>
      </GlassCard>

      {loadError && (
        <Panel>
          <ErrorPanel
            title="Analytics could not be loaded"
            body={scoreTrend.length || conversion.length || repActivity.length ? "Figures below may be out of date. Check your connection, then retry." : "Check your connection, then retry."}
            onRetry={() => void load()}
          />
        </Panel>
      )}

      {/* PERFORMANCE — the one chart */}
      <GlassCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--ds-text)]">Score performance</h2>
            <p className="mt-0.5 text-sm text-[var(--ds-text-3)]">{scopeLabel} · {rangeLabel}</p>
          </div>
          {scores && (
            <div className="flex gap-2">
              <button type="button" className={dsButton("quiet", "sm")} onClick={() => exportCSV("score_trend.csv", scoreTrend)}>Export CSV</button>
              <button type="button" className={dsButton("quiet", "sm")} onClick={() => void exportPNG("score-performance-card", "score-performance.png")}>Export PNG</button>
            </div>
          )}
        </div>

        {scores && (
          <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-5xl font-semibold tabular-nums tracking-tight text-[var(--ds-text)]">{scores.average}</span>
            <span className="text-sm text-[var(--ds-text-3)]">average of daily review scores</span>
            {scores.delta !== null && (
              <Badge tone={scores.delta > 0 ? "good" : scores.delta < 0 ? "warn" : "neutral"}>
                {scores.delta > 0 ? "▲" : scores.delta < 0 ? "▼" : "–"} {Math.abs(scores.delta)} pts, second half vs first half of range
              </Badge>
            )}
          </div>
        )}

        <div id="score-performance-card" className="mt-5 min-w-0">
          {scores ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={scoreTrend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="score-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_LINE} stopOpacity={0.26} />
                    <stop offset="100%" stopColor={CHART_LINE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART_GRID} vertical={false} />
                <XAxis dataKey="day" tick={CHART_TICK} axisLine={false} tickLine={false} tickMargin={8} minTickGap={24} />
                <YAxis domain={[0, 100]} tick={CHART_TICK} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={CHART_TOOLTIP} cursor={{ stroke: "rgba(148,163,184,0.3)" }} />
                <Area type="monotone" dataKey="avg_score" name="Avg score" stroke={CHART_LINE} strokeWidth={2.5} fill="url(#score-fill)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : loaded ? (
            <EmptyPanel
              title="No reviewed calls in this range"
              body="The score trend builds as calls are uploaded and reviewed."
              action={<Link href="/upload" className={dsButton("primary", "md")}>Upload a call</Link>}
            />
          ) : (
            skeleton
          )}
        </div>

        {scores && (
          <dl className="mt-4 grid grid-cols-3 gap-x-4 border-t border-[var(--ds-border)] pt-4 text-sm">
            {[
              ["Latest", scores.latest],
              ["Range high", scores.high],
              ["Range low", scores.low],
            ].map(([label, point]) => (
              <div key={String(label)}>
                <dt className="text-xs text-[var(--ds-text-3)]">{String(label)}</dt>
                <dd className="mt-0.5">
                  <span className="block text-lg font-semibold tabular-nums text-[var(--ds-text)]">{Math.round((point as { avg_score: number }).avg_score)}</span>
                  <span className="block text-xs text-[var(--ds-text-3)]">{(point as { day: string }).day}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </GlassCard>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        {/* COACHING */}
        <Panel>
          <PanelHeader title="Coaching follow-through" meta={rangeLabel} />
          {!loaded ? (
            <div className="p-5">{skeleton}</div>
          ) : repActivity.length === 0 && !impact ? (
            <EmptyPanel title="No coaching activity in this range" body="Activity appears as coaching tasks are created for reps." />
          ) : (
            <div className="px-5 py-5 sm:px-6">
              {rate !== null ? (
                <>
                  <p className="text-3xl font-semibold tabular-nums text-[var(--ds-text)]">{rate}%</p>
                  <p className="mt-1 text-sm text-[var(--ds-text-2)]">{completedActivities} of {totalActivities} coaching tasks completed</p>
                  <p className="mt-0.5 text-xs text-[var(--ds-text-3)]">Counts CRM coaching tasks created in range that are marked done.</p>
                </>
              ) : (
                <p className="text-sm text-[var(--ds-text-3)]">No coaching tasks were created in this range.</p>
              )}

              {impact && (
                <div className="mt-4 rounded-[var(--ds-radius-control)] border border-[var(--ds-border)] bg-white/[0.02] px-4 py-3">
                  <p className="text-sm text-[var(--ds-text)]">{impact.summary}</p>
                  <p className="mt-1 text-xs text-[var(--ds-text-3)]">Team-wide, last {days} days. Ignores the rep filter.</p>
                </div>
              )}

              {reps.length > 0 && (
                <>
                  <h3 className="mt-6 text-sm font-medium text-[var(--ds-text)]">By rep</h3>
                  <ul aria-label="Coaching tasks by rep" className="mt-2 space-y-3">
                    {reps.slice(0, 5).map((r) => (
                      <li key={r.rep_id}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="truncate text-[var(--ds-text)]">{r.label}</span>
                          <span className="shrink-0 tabular-nums text-xs text-[var(--ds-text-3)]">{r.completed}/{r.created} done</span>
                        </div>
                        <div aria-hidden className="mt-1 h-1.5 rounded-full bg-white/[0.07]">
                          <div className="h-full rounded-full bg-[var(--ds-primary)]" style={{ width: `${r.pct}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                  {reps.length > 5 && (
                    <details className="mt-3">
                      <summary className="ds-focus cursor-pointer rounded text-sm text-[var(--ds-text-2)] hover:text-[var(--ds-text)]">Show {reps.length - 5} more reps</summary>
                      <ul aria-label="More coaching tasks by rep" className="mt-3 space-y-3">
                        {reps.slice(5).map((r) => (
                          <li key={r.rep_id}>
                            <div className="flex items-baseline justify-between gap-3 text-sm">
                              <span className="truncate text-[var(--ds-text)]">{r.label}</span>
                              <span className="shrink-0 tabular-nums text-xs text-[var(--ds-text-3)]">{r.completed}/{r.created} done</span>
                            </div>
                            <div aria-hidden className="mt-1 h-1.5 rounded-full bg-white/[0.07]">
                              <div className="h-full rounded-full bg-[var(--ds-primary)]" style={{ width: `${r.pct}%` }} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}
            </div>
          )}
        </Panel>

        {/* PIPELINE */}
        <Panel>
          <PanelHeader title="Pipeline movement" meta={rangeLabel} />
          {!loaded ? (
            <div className="p-5">{skeleton}</div>
          ) : stages.length === 0 ? (
            <EmptyPanel title="No stage transitions in this range" body="As deals move between pipeline stages, movement builds here." />
          ) : (
            <div className="px-5 py-5 sm:px-6">
              <p className="text-3xl font-semibold tabular-nums text-[var(--ds-text)]">{conversionTotal}</p>
              <p className="mt-1 text-sm text-[var(--ds-text-2)]">stage transitions</p>
              <p className="mt-0.5 text-xs text-[var(--ds-text-3)]">A count of deals moving into each stage, not a conversion rate.</p>
              <ul aria-label="Stage transitions" className="mt-5 space-y-3">
                {stages.map((st) => (
                  <li key={st.stage}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate text-[var(--ds-text)]">{st.stage}</span>
                      <span className="shrink-0 tabular-nums text-xs text-[var(--ds-text-3)]">{st.count}</span>
                    </div>
                    <div aria-hidden className="mt-1 h-1.5 rounded-full bg-white/[0.07]">
                      <div className="h-full rounded-full bg-[var(--ds-highlight)]/70" style={{ width: `${st.pct}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      {/* PROGRESSIVE DISCLOSURE — exports, definitions, next steps */}
      <details className="ds-panel rounded-[var(--ds-radius-card)]">
        <summary className="ds-focus cursor-pointer select-none rounded-[var(--ds-radius-card)] px-5 py-4 text-sm font-medium text-[var(--ds-text)]">
          Exports, definitions and next steps
        </summary>
        <div className="space-y-5 border-t border-[var(--ds-border)] px-5 py-5 text-sm text-[var(--ds-text-2)]">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={dsButton("secondary", "sm")} disabled={!stages.length} onClick={() => exportCSV("conversion-by-stage.csv", conversion)}>Export stage transitions (CSV)</button>
            <button
              type="button"
              className={dsButton("secondary", "sm")}
              disabled={!repChartData.length}
              onClick={() =>
                // Day 213A — export human labels, not raw ids.
                exportCSV("activity-by-rep.csv", repChartData.map((r) => ({ rep: r.label, activities_created: r.created, activities_completed: r.completed })))
              }
            >
              Export coaching by rep (CSV)
            </button>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ds-text-3)]">
            <li>Average score is the mean of daily average review scores; it is not weighted by call volume.</li>
            <li>The change figure compares the second half of the selected range with the first half.</li>
            <li>Coaching follow-through counts CRM coaching tasks; coaching impact is the team-wide figure from the manager command centre and ignores the rep filter.</li>
            <li>Pipeline movement counts stage transitions. Sparring results are not part of these analytics sources.</li>
          </ul>
          <nav aria-label="Next steps" className="flex flex-wrap gap-2">
            {nextActions.map((a) => (
              <Link key={a.href} href={a.href} className={dsButton("secondary", "sm")}>{a.title}</Link>
            ))}
            <Link href="/upload" className={dsButton("quiet", "sm")}>Upload a call</Link>
          </nav>
        </div>
      </details>
    </PageShell>
  );
}
