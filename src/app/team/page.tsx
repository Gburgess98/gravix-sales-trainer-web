"use client";

// Glass-system redesign: a searchable rep list with score, trend, coaching status and one entry action
// per rep. Performance is joined client-side from endpoints the Overview already reads
// (GET /v1/manager/command-centre, GET /v1/dashboard/leaderboard); every join is fail-soft, so the
// roster still renders when they are unavailable. Seats and scope warnings are one quiet line.
// Day 214 — Manager Team Management, read-only MVP.
// First visible surface for the Day 211 blueprint, backed by the Day 212 API
// (GET /v1/team/members: manager-gated, company-scoped). Shows members, seat
// usage, office/scope status and setup warnings so team setup is visible —
// invite/edit/deactivate ship in a later lane, so this page renders no
// mutating controls at all (no fake buttons, no greyed-out "coming soon" UI).
// The member drawer from the blueprint is deliberately deferred with them.

import { useCallback, useEffect, useMemo, useState } from "react";
import { proxyFetch } from "@/lib/api";
import Link from "next/link";
import { PageShell, PageHead, GlassCard, Panel, Badge, Segmented, SearchInput, EmptyPanel, ErrorPanel, LoadingRows } from "@/components/ds";
import { memberLabel, memberInitials } from "@/lib/team-identity";
import { RAG_META, ragFromScore, repRag, trendBetween, type Rag } from "@/lib/manager-model";

/* ----------------------------- Types ----------------------------- */

type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  manager_id: string | null;
  office_id: string | null;
  office_name: string | null;
  scope: "office" | "company";
  identity: "rep" | "user_only";
  warnings: string[];
};

type SeatSummary = {
  allocated: number | null;
  used: number;
  available: number | null;
  source: "company_licences" | "org_limits" | null;
};

/* ---------------------------- Labels ----------------------------- */
// Never surface a raw UUID as a member label (PREMIUM_UX_AUDIT §38). The API
// name falls back to the id for identity-less rows, so guard here too:
// name > email local part > neutral "Team member". Full ids stay internal.

const ROLE_LABELS: Record<string, string> = {
  SalesRep: "Sales rep",
  Manager: "Manager",
  Owner: "Owner",
  PartnerAdmin: "Partner admin",
  SuperAdmin: "Super admin",
  rep: "Rep",
  manager: "Manager",
  office_manager: "Office manager",
  company_manager: "Company manager",
};

function roleLabel(role: string | null): string {
  if (!role) return "—";
  return ROLE_LABELS[role] ?? role.replace(/_/g, " ");
}

// Human scope status (Day 211 copy): office assigned, company-wide, or needs
// setup. "Needs team setup" only when the API flags it — an office-less
// company operating at company scope is normal, not a warning.
type ScopeStatus = { label: string; tone: "neutral" | "warning" };

function scopeStatus(member: TeamMember): ScopeStatus {
  const needsSetup = member.warnings.some(
    (w) => w === "no_office_assigned" || w === "office_not_in_company"
  );
  if (needsSetup) return { label: "Needs team setup", tone: "warning" };
  if (member.scope === "office") return { label: "Office assigned", tone: "neutral" };
  return { label: "Company-wide scope", tone: "neutral" };
}

const SEAT_SOURCE_LABELS: Record<string, string> = {
  company_licences: "Licensed seats",
  org_limits: "Legacy seat limit",
};

/* ------------------------ Performance join ------------------------ */

type Perf = {
  avg30: number | null;
  avg90: number | null;
  calls30: number;
  risk: Rag | null;
  open: number;
  overdue: number;
};

type Filter = "all" | "attention" | "ontrack";

async function readJson(path: string): Promise<any | null> {
  try {
    const res = await proxyFetch(path, { cache: "no-store" });
    const json = await res.json();
    return res.ok && json?.ok !== false ? json : null;
  } catch {
    return null;
  }
}

/* --------------------------- Component --------------------------- */

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [seats, setSeats] = useState<SeatSummary | null>(null);
  const [pageWarnings, setPageWarnings] = useState<string[]>([]);
  const [perf, setPerf] = useState<Record<string, Perf>>({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<"forbidden" | "failed" | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setLoaded(false);
    setLoadError(null);
    try {
      const res = await proxyFetch(`/v1/team/members`, { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        setLoadError("forbidden");
        return;
      }
      const json = await res.json();
      if (!res.ok || json?.ok !== true) {
        setLoadError("failed");
        return;
      }
      setMembers(Array.isArray(json?.items) ? json.items : []);
      setSeats(json?.seats ?? null);
      setPageWarnings(Array.isArray(json?.warnings) ? json.warnings : []);
    } catch {
      setLoadError("failed");
    } finally {
      setLoaded(true);
    }

    // Performance is additive and fail-soft: the roster above never waits on it or breaks without it.
    const [cc, lb30, lb90] = await Promise.all([
      readJson("/v1/manager/command-centre?days=30"),
      readJson("/v1/dashboard/leaderboard?days=30&limit=100&minCalls=1"),
      readJson("/v1/dashboard/leaderboard?days=90&limit=100&minCalls=1"),
    ]);
    const next: Record<string, Perf> = {};
    const row = (id: string): Perf => (next[id] ??= { avg30: null, avg90: null, calls30: 0, risk: null, open: 0, overdue: 0 });
    for (const r of lb30?.reps ?? []) {
      const p = row(String(r.repId));
      p.avg30 = typeof r.avgScore === "number" ? r.avgScore : null;
      p.calls30 = Number(r.calls ?? 0);
    }
    for (const r of lb90?.reps ?? []) row(String(r.repId)).avg90 = typeof r.avgScore === "number" ? r.avgScore : null;
    for (const r of cc?.repsNeedingAttention ?? []) row(String(r.repId)).risk = r.riskLevel ?? null;
    for (const a of cc?.openAssignments ?? []) {
      if (!a?.repId) continue;
      const p = row(String(a.repId));
      if (a.status === "overdue") p.overdue += 1;
      if (a.status === "open" || a.status === "overdue") p.open += 1;
    }
    setPerf(next);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const order: Record<string, number> = { red: 0, amber: 1, green: 2 };
    return members
      .map((m) => {
        const p = perf[m.id];
        const rag = p ? repRag({ avgScore: p.avg30, riskLevel: p.risk, overdue: p.overdue }) : null;
        return { m, p, rag, trend: p ? trendBetween(p.avg30, p.avg90) : null, setup: scopeStatus(m).tone === "warning" };
      })
      .sort((a, b) => (order[a.rag ?? "x"] ?? 3) - (order[b.rag ?? "x"] ?? 3) || memberLabel(a.m).localeCompare(memberLabel(b.m)));
  }, [members, perf]);

  const attentionCount = rows.filter((r) => r.rag === "red" || r.rag === "amber").length;
  const q = query.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (filter === "attention" && !(r.rag === "red" || r.rag === "amber")) return false;
    if (filter === "ontrack" && r.rag !== "green") return false;
    if (!q) return true;
    return [memberLabel(r.m), r.m.email ?? "", r.m.office_name ?? "", roleLabel(r.m.role)].join(" ").toLowerCase().includes(q);
  });

  const overAllocated = pageWarnings.includes("over_seat_allocation");
  const needsSetupCount = rows.filter((r) => r.setup).length;
  const seatLine =
    seats?.allocated != null ? `${seats.used} of ${seats.allocated} seats in use` : null;

  /* ---------------------------- Render ---------------------------- */

  if (loaded && loadError === "forbidden") {
    return (
      <PageShell>
        <PageHead title="Team" subtitle="Your reps, their performance and coaching status" />
        <Panel>
          <EmptyPanel title="Team management is available to managers" body="Ask your manager or administrator if you need access to team setup." />
        </Panel>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHead
        title="Team"
        subtitle={
          loaded && !loadError ? (
            <>
              {members.length} {members.length === 1 ? "member" : "members"}
              {attentionCount > 0 ? ` · ${attentionCount} need${attentionCount === 1 ? "s" : ""} attention` : ""}
              {seatLine ? ` · ${seatLine}` : ""}
            </>
          ) : (
            "Your reps, their performance and coaching status"
          )
        }
      />

      {loaded && !loadError && (overAllocated || needsSetupCount > 0) && (
        <GlassCard as="div" className="!p-4">
          <p className="text-sm text-amber-200">
            {overAllocated ? "Seat allocation is exceeded. " : ""}
            {needsSetupCount > 0 ? `${needsSetupCount} ${needsSetupCount === 1 ? "member needs" : "members need"} team setup.` : ""}
          </p>
        </GlassCard>
      )}

      <GlassCard as="div" className="!p-3 sm:!p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="md:flex-1">
            <SearchInput label="Search team" placeholder="Search by name, email or office…" value={query} onChange={setQuery} />
          </div>
          <Segmented
            label="Filter reps"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "attention", label: "Needs attention" },
              { value: "ontrack", label: "On track" },
            ]}
          />
        </div>
      </GlassCard>

      <Panel>
        {!loaded ? (
          <LoadingRows rows={5} label="Loading team" />
        ) : loadError ? (
          <ErrorPanel title="Team details are unavailable right now" body="Your team hasn't changed — this is just a loading problem." onRetry={() => void load()} />
        ) : members.length === 0 ? (
          <EmptyPanel title="No team members yet" body="Members appear here once they are added to your company." />
        ) : visible.length === 0 ? (
          <EmptyPanel title="No one matches" body="Try a different search or filter." />
        ) : (
          <ul aria-label="Team members" className="divide-y divide-[var(--ds-border)]">
            {visible.map(({ m, p, rag, trend, setup }) => (
              <li key={m.id}>
                <Link
                  href={`/crm/reps/${encodeURIComponent(m.id)}`}
                  className="ds-focus grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-white/[0.03] motion-reduce:transition-none sm:px-5 md:grid-cols-[minmax(0,1.6fr)_5rem_6rem_minmax(0,1fr)_8.5rem_auto]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--ds-border-strong)] bg-white/[0.05] text-xs font-semibold text-[var(--ds-text-2)]">
                      {memberInitials(m)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[var(--ds-text)]">{memberLabel(m)}</span>
                      <span className="block truncate text-xs text-[var(--ds-text-3)]">
                        {roleLabel(m.role)}
                        {m.office_name ? ` · ${m.office_name}` : ""}
                      </span>
                    </span>
                  </span>

                  <span className="justify-self-end md:justify-self-start">
                    {p?.avg30 != null ? <Badge tone={RAG_META[ragFromScore(p.avg30) ?? "amber"].tone}>{Math.round(p.avg30)}</Badge> : <span className="text-xs text-[var(--ds-text-3)]">No calls</span>}
                  </span>

                  <span className="hidden text-sm tabular-nums md:block" aria-label={trend ? `Trend ${trend.dir}, ${trend.delta} points versus 90 days` : "No trend yet"}>
                    {trend ? (
                      <span className={trend.dir === "up" ? "text-emerald-200" : trend.dir === "down" ? "text-red-200" : "text-[var(--ds-text-3)]"}>
                        {trend.dir === "up" ? "▲" : trend.dir === "down" ? "▼" : "–"} {trend.delta > 0 ? "+" : ""}{trend.delta}
                      </span>
                    ) : (
                      <span className="text-[var(--ds-text-3)]">—</span>
                    )}
                  </span>

                  <span className="hidden truncate text-xs text-[var(--ds-text-3)] md:block">
                    {p && p.overdue > 0 ? <span className="text-red-200">{p.overdue} overdue</span> : p && p.open > 0 ? `${p.open} open` : "No open coaching"}
                    {setup ? " · needs setup" : ""}
                  </span>

                  <span className="hidden md:block">
                    {rag ? <Badge tone={RAG_META[rag].tone}>{RAG_META[rag].label}</Badge> : <Badge>No data</Badge>}
                  </span>

                  <span className="col-span-2 flex items-center justify-between gap-3 text-xs text-[var(--ds-text-3)] md:hidden">
                    <span className="truncate">
                      {p && p.overdue > 0 ? <span className="text-red-200">{p.overdue} overdue</span> : p && p.open > 0 ? `${p.open} open` : "No open coaching"}
                      {trend ? ` · ${trend.dir === "up" ? "▲" : trend.dir === "down" ? "▼" : "–"} ${trend.delta > 0 ? "+" : ""}${trend.delta}` : ""}
                    </span>
                    {rag ? <Badge tone={RAG_META[rag].tone}>{RAG_META[rag].label}</Badge> : <Badge>No data</Badge>}
                  </span>

                  <span className="hidden items-center justify-end gap-2 text-sm text-[var(--ds-text-2)] md:flex">
                    <span>View</span>
                    <span aria-hidden>›</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {loaded && !loadError && (
        <p className="text-xs text-[var(--ds-text-3)]">
          Score is the 30-day average; trend compares it with the 90-day average. Team setup is read-only for now — inviting, editing and deactivating members arrives in a later release. Seat usage never blocks coaching.
        </p>
      )}
    </PageShell>
  );
}
