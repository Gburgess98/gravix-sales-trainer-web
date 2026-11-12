"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { proxyFetch } from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
import { PageShell, PageHead, LoadingRows } from "@/components/ds";
import { InsightsView, type ActivityRow, type RepOption } from "@/components/manager/insights-view";
import {
  DEFAULT_PERIOD,
  loadingSection,
  num,
  outcomeOf,
  parseCentre,
  parsePeriod,
  parseThresholds,
  parseTrend,
  type Centre,
  type Period,
  type Section,
  type Thresholds,
  type TrendPoint,
} from "@/lib/insights-command";
import { exportCSV, exportPNG } from "@/lib/insights-export";

/* Manager Insights (/crm/analytics). Period (?days=30|90|365, default 365) and rep (?rep=<id>) live in the URL so a reload or
   a shared link shows the same view. Each section loads and fails on its own: a 403 on one is a permission state for that
   section, a failure is a failure, and neither is ever shown as "no data". */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Display-only rep labels — never a raw UUID (Day 213A). Directory name > API name > email local part > short neutral label. */
type DirectoryEntry = { name?: string; email?: string };
const cleanName = (value?: string | null, repId?: string): string | null => {
  const v = value?.trim();
  if (!v || UUID_RE.test(v) || (repId && v === repId) || v.includes("@")) return null;
  return v;
};
const emailLocal = (value?: string | null): string | null => {
  const v = value?.trim();
  return v && v.includes("@") ? v.split("@")[0]?.trim() || null : null;
};
function repLabel(repId: string, apiName: string | null | undefined, dir: Record<string, DirectoryEntry>) {
  const e = dir[repId];
  return cleanName(e?.name, repId) || cleanName(apiName, repId) || emailLocal(e?.name) || emailLocal(e?.email) || emailLocal(apiName) || `Rep ${repId.slice(0, 6)}`;
}

/** One section request: status code → outcome; a 2xx whose body can't be read as this section is an error, never "empty". */
async function section<T>(path: string, parse: (json: any) => T | null, opts: { nullOk?: boolean } = {}): Promise<Section<T>> {
  try {
    const res = await proxyFetch(path, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    const outcome = outcomeOf(res.status, json?.ok);
    if (outcome !== "ok") return { status: outcome, data: null };
    const data = parse(json);
    // nullOk: the request succeeded and the answer is "nothing configured" (e.g. no thresholds) — not a failure.
    return data === null && !opts.nullOk ? { status: "error", data: null } : { status: "ok", data };
  } catch {
    return { status: "error", data: null };
  }
}

function InsightsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const period: Period = parsePeriod(search.get("days"));
  const repParam = search.get("rep") ?? "";
  const rep = UUID_RE.test(repParam) ? repParam : "all";

  const [trend, setTrend] = useState<Section<TrendPoint[]>>(loadingSection());
  const [centre, setCentre] = useState<Section<Centre>>(loadingSection());
  const [thresholds, setThresholds] = useState<Section<Thresholds>>(loadingSection());
  const [activity, setActivity] = useState<Section<ActivityRow[]>>(loadingSection());
  const [directory, setDirectory] = useState<Record<string, DirectoryEntry>>({});
  const [repIds, setRepIds] = useState<Array<{ id: string; name?: string }>>([]);
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);

  const setQuery = useCallback(
    (next: { days?: Period; rep?: string }) => {
      const p = new URLSearchParams(search.toString());
      const d = next.days ?? period;
      const r = next.rep ?? rep;
      if (d === DEFAULT_PERIOD) p.delete("days"); else p.set("days", String(d));
      if (r === "all") p.delete("rep"); else p.set("rep", r);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, search, period, rep],
  );

  // Trend, command centre and CRM tasks follow the period (and rep); thresholds don't.
  useEffect(() => {
    const mine = ++seq.current;
    const fresh = () => mine === seq.current;
    setTrend(loadingSection());
    setCentre(loadingSection());
    setActivity(loadingSection());
    const repQ = rep !== "all" ? `&repId=${encodeURIComponent(rep)}` : "";
    void section<TrendPoint[]>(`/v1/crm/analytics/score-trend?days=${period}${repQ}`, (j) => (Array.isArray(j?.trend) ? parseTrend(j) : null)).then((s) => fresh() && setTrend(s));
    void section<Centre>(`/v1/manager/command-centre?days=${period}`, parseCentre).then((s) => fresh() && setCentre(s));
    void section<ActivityRow[]>(`/v1/crm/analytics/activity-by-rep?days=${period}${repQ}`, (j) =>
      Array.isArray(j?.reps)
        ? j.reps
            .map((r: any) => ({ id: String(r?.rep_id ?? ""), name: r?.rep_name ? String(r.rep_name) : null, created: num(r?.activities_created), completed: num(r?.activities_completed) }))
            .filter((r: any) => r.id && r.created !== null && r.completed !== null)
            .map((r: any) => ({ id: r.id, label: r.name ?? "", created: r.created, completed: r.completed }))
        : null,
    ).then((s) => fresh() && setActivity(s));
  }, [period, rep, nonce]);

  useEffect(() => {
    let alive = true;
    void section<Thresholds>("/v1/admin/config", parseThresholds, { nullOk: true }).then((s) => alive && setThresholds(s));
    return () => { alive = false; };
  }, [nonce]);

  // Rep options + names: fail-soft, independent of the figures.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await proxyFetch(`/v1/crm/analytics/activity-by-rep?days=90`, { cache: "no-store" });
        const json = res.ok ? await res.json() : null;
        if (alive) setRepIds(Array.isArray(json?.reps) ? json.reps.map((r: any) => ({ id: String(r?.rep_id ?? ""), name: r?.rep_name ? String(r.rep_name) : undefined })).filter((r: any) => r.id) : []);
      } catch { if (alive) setRepIds([]); }
    })();
    (async () => {
      try {
        const res = await proxyFetch(`/v1/team/users?limit=200`, { cache: "no-store" });
        const json = res.ok ? await res.json() : null;
        if (!alive) return;
        const dir: Record<string, DirectoryEntry> = {};
        for (const item of Array.isArray(json?.items) ? json.items : []) if (item?.id) dir[String(item.id)] = { name: item?.name ? String(item.name) : undefined, email: item?.email ? String(item.email) : undefined };
        setDirectory(dir);
      } catch { if (alive) setDirectory({}); }
    })();
    return () => { alive = false; };
  }, []);

  // Refresh when calls change (debounced so a burst of scoring doesn't refetch repeatedly).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel("analytics-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, () => { clearTimeout(t); t = setTimeout(() => setNonce((n) => n + 1), 1500); })
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(channel); };
  }, []);

  const repOptions: RepOption[] = useMemo(() => {
    const ids = new Map(repIds.map((r) => [r.id, r.name]));
    if (rep !== "all" && !ids.has(rep)) ids.set(rep, undefined);
    return Array.from(ids, ([id, name]) => ({ id, label: repLabel(id, name, directory) })).sort((a, b) => a.label.localeCompare(b.label));
  }, [repIds, directory, rep]);

  const activityRows: Section<ActivityRow[]> = useMemo(
    () => (activity.data ? { status: activity.status, data: activity.data.map((r) => ({ ...r, label: repLabel(r.id, r.label, directory) })).sort((a, b) => b.created - a.created || a.label.localeCompare(b.label)) } : activity),
    [activity, directory],
  );

  const selectedLabel = rep === "all" ? null : repOptions.find((r) => r.id === rep)?.label ?? null;
  const retry = useCallback(() => setNonce((n) => n + 1), []);

  return (
    <PageShell>
      <PageHead title="Insights" subtitle="How your team is scoring and following through on coaching." />
      <InsightsView
        period={period}
        onPeriod={(p) => setQuery({ days: p })}
        rep={rep}
        repOptions={repOptions}
        onRep={(id) => setQuery({ rep: id })}
        repLabel={selectedLabel}
        trend={trend}
        centre={centre}
        thresholds={thresholds}
        activity={activityRows}
        nameOf={(id, name) => repLabel(id, name, directory)}
        onRetry={retry}
        onExportCsv={() => exportCSV("score-trend.csv", (trend.data ?? []).map((p) => ({ date: p.date, avg_score: p.avg, scored_calls: p.count ?? "" })))}
        onExportPng={() => void exportPNG("score-trend-chart", "score-trend.png")}
        onExportActivity={() => exportCSV("coaching-tasks-by-rep.csv", (activityRows.data ?? []).map((r) => ({ rep: r.label, activities_created: r.created, activities_completed: r.completed })))}
      />
    </PageShell>
  );
}

export default function AnalyticsPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<PageShell><PageHead title="Insights" /><LoadingRows rows={4} label="Loading insights" /></PageShell>}>
      <InsightsPage />
    </Suspense>
  );
}
