"use client";

// Day 214 — Manager Team Management, read-only MVP.
// First visible surface for the Day 211 blueprint, backed by the Day 212 API
// (GET /v1/team/members: manager-gated, company-scoped). Shows members, seat
// usage, office/scope status and setup warnings so team setup is visible —
// invite/edit/deactivate ship in a later lane, so this page renders no
// mutating controls at all (no fake buttons, no greyed-out "coming soon" UI).
// The member drawer from the blueprint is deliberately deferred with them.

import { useCallback, useEffect, useState } from "react";
import { proxyFetch } from "@/lib/api";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";

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

const UUID_LIKE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function memberLabel(member: TeamMember): string {
  const name = member.name?.trim();
  if (name && !UUID_LIKE_RE.test(name) && !name.includes("@")) return name;

  const email = (name?.includes("@") ? name : member.email ?? "").trim();
  const local = email.includes("@") ? email.split("@")[0]?.trim() : "";
  if (local && !UUID_LIKE_RE.test(local)) return local;

  return "Team member";
}

function memberInitials(member: TeamMember): string {
  const label = memberLabel(member);
  if (label === "Team member") return "TM";
  const parts = label.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] ?? "";
  return `${first}${second}`.toUpperCase() || "TM";
}

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

/* --------------------------- Component --------------------------- */

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [seats, setSeats] = useState<SeatSummary | null>(null);
  const [pageWarnings, setPageWarnings] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<"forbidden" | "failed" | null>(null);

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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const overAllocated = pageWarnings.includes("over_seat_allocation");
  const needsSetupCount = members.filter(
    (m) => scopeStatus(m).tone === "warning"
  ).length;

  const seatValue = (n: number | null | undefined) =>
    n == null ? "—" : String(n);

  /* ---------------------------- Render ---------------------------- */

  if (loaded && loadError === "forbidden") {
    return (
      <PageContainer>
        <PageHeader
          title="Team"
          subtitle="Members, seats and coaching scope across your team"
        />
        <SectionCard className="mt-6" padded>
          <EmptyState
            message="Team management is available to managers"
            sub="Ask your manager or administrator if you need access to team setup."
          />
        </SectionCard>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Team"
        subtitle="Members, seats and coaching scope across your team"
      />

      {/* SEAT SUMMARY */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Team members"
          value={loaded && !loadError ? members.length : "—"}
          subtext="Active in your company"
        />
        <StatCard
          label="Seats allocated"
          value={loaded && !loadError ? seatValue(seats?.allocated) : "—"}
          subtext={
            seats?.source
              ? SEAT_SOURCE_LABELS[seats.source] ?? seats.source
              : "No allocation on record"
          }
        />
        <StatCard
          label="Seats available"
          value={loaded && !loadError ? seatValue(seats?.available) : "—"}
          variant={overAllocated ? "warning" : "default"}
          subtext={
            overAllocated
              ? `Over allocation — ${seats?.used ?? 0} of ${seats?.allocated ?? 0} seats in use`
              : "Remaining on your current allocation"
          }
        />
        <StatCard
          label="Scope setup"
          value={loaded && !loadError ? (needsSetupCount ? needsSetupCount : "All set") : "—"}
          variant={needsSetupCount ? "warning" : "default"}
          subtext={
            needsSetupCount
              ? "Members needing team setup"
              : "Every member has a valid coaching scope"
          }
        />
      </div>

      {/* MEMBERS */}
      <SectionCard
        className="mt-6"
        eyebrow="People"
        title="Members"
        subtitle="Who is on your team and how their coaching scope is set up"
      >
        {!loaded ? (
          <div className="space-y-2 px-5 py-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-neutral-900/60" />
            ))}
          </div>
        ) : loadError ? (
          <EmptyState
            message="Team details are unavailable right now"
            sub="Your team hasn't changed — this is just a loading problem."
            action={{ label: "Try again", onClick: () => void load() }}
          />
        ) : members.length === 0 ? (
          <EmptyState
            message="No team members yet"
            sub="Members appear here once they are added to your company."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                  <th className="px-5 py-3 font-medium">Member</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Office</th>
                  <th className="px-5 py-3 font-medium">Coaching scope</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const status = scopeStatus(member);
                  return (
                    <tr
                      key={member.id}
                      className="border-b border-neutral-900 last:border-0"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 text-[10px] font-semibold text-neutral-300">
                            {memberInitials(member)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-neutral-100">
                              {memberLabel(member)}
                            </div>
                            {member.email && (
                              <div className="truncate text-xs text-neutral-500">
                                {member.email}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-neutral-300">
                        {roleLabel(member.role)}
                      </td>
                      <td className="px-5 py-3 text-neutral-400">
                        {member.office_name ?? "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={
                            status.tone === "warning"
                              ? "inline-flex items-center rounded-full border border-warning-500/30 bg-warning-500/10 px-2.5 py-0.5 text-xs text-warning-300"
                              : "inline-flex items-center rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-0.5 text-xs text-neutral-400"
                          }
                        >
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* READ-ONLY NOTE */}
      {loaded && !loadError && (
        <p className="mt-4 text-xs text-neutral-600">
          Team setup is read-only for now — inviting, editing and deactivating
          members arrives in a later release. Seat usage never blocks coaching.
        </p>
      )}
    </PageContainer>
  );
}
