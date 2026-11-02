// src/app/call-library/page.tsx
"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { fetchJsonWithRetry } from "@/lib/fetchJsonwithretry";
import { proxyFetch } from "@/lib/api";
import SparringStartButton from "@/components/SparringStartButton";
import { PageContainer } from "@/components/layout/page-container";
import { WorkspaceTabs } from "@/components/shell/workspace-tabs";
import { EmptyState, Button } from "@/components/ui";
import { formatCallDisplayTitle } from "@/lib/callDisplay";
import { PageHead, GlassCard, Panel, Badge, dsButton, DataList, DataRow, EmptyPanel, ErrorPanel, LoadingRows, Segmented, SearchInput, PanelHeader, dsField } from "@/components/ds";
import { callState, scoreTone, formatCallDate, formatDuration } from "@/lib/ds-model";

// Shape returned by /api/proxy/v1/calls/paged
type CallItem = {
  id: string;
  filename: string | null;
  status: string;
  created_at: string;
  duration_sec: number | null;
  score_overall: number | null;
  ai_model: string | null;
  type?: string; // "live" | "upload" | "sparring" (future)
  rep_name?: string | null;
  tags?: string[] | null;
  duration_ms?: number | null;
  summary?: string | null;
  flags?: string[] | null;
  assignment_status?: string | null;
  has_open_assignment?: boolean;
  has_completed_assignment?: boolean;
};

type CallsPagedResp = {
  ok: boolean;
  calls?: CallItem[];
  items?: CallItem[];
  nextCursor?: string | null;
};

type AssignmentTargetItem = {
  target_id: string;
  has_assignment: boolean;
  has_open: boolean;
  has_completed: boolean;
  status: "assigned" | "completed" | null;
  latest_assignment_id: string | null;
  open_assignment_id: string | null;
  completed_assignment_id: string | null;
};

type AssignmentsByTargetResp = {
  ok: boolean;
  items?: AssignmentTargetItem[];
};

type SparringSession = {
  id: string;
  created_at: string;
  persona_id: string | null;
  difficulty?: string | null;
  xp_awarded: number | null;
  total?: number | null;
};

type SparringPersonaOption = {
  id: string;
  label: string;
  description?: string | null;
  default_difficulty?: string | null;
};

type Tab = "live" | "sparring" | "upload";
type StatusFilter = "all" | "scored" | "processing" | "failed";
type ScoreFilter = "all" | "high" | "medium" | "low";
type SortBy =
  | "newest"
  | "oldest"
  | "scoreHigh"
  | "scoreLow"
  | "durationHigh"
  | "durationLow";
type CallScope = "mine" | "company";

const AVAILABLE_TAGS = [
  "Objection",
  "Weak close",
  "No discovery",
  "Price objection",
  "Low energy",
];

function buildCallsPagedUrl(params: {
  limit?: number;
  cursor?: string | null;
  q?: string;
  scope?: CallScope;
}) {
  const searchParams = new URLSearchParams();
  searchParams.set("limit", String(params.limit ?? 20));

  if (params.cursor) searchParams.set("cursor", params.cursor);
  if (params.q) searchParams.set("q", params.q);
  if (params.scope) searchParams.set("scope", params.scope);

  return `/api/proxy/v1/calls/paged?${searchParams.toString()}`;
}





function buildAssignmentsByTargetUrl(targetIds: string[], type = "call_review") {
  const searchParams = new URLSearchParams();
  searchParams.set("target_ids", targetIds.join(","));
  searchParams.set("type", type);
  return `/api/proxy/v1/assignments/by-target?${searchParams.toString()}`;
}

function callAssignmentBadge(call: CallItem): { label: string; className: string } | null {
  if (call.has_open_assignment) {
    return {
      label: "Assigned",
      className: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    };
  }

  const score = typeof call.score_overall === "number" ? call.score_overall : null;
  const hasFlags = Array.isArray(call.flags) && call.flags.length > 0;

  if ((score !== null && score < 65) || hasFlags) {
    return {
      label: "Needs Review",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    };
  }

  return null;
}



function difficultyLabel(value?: string | null) {
  if (!value) return "Normal";
  const v = value.toLowerCase();
  if (v === "easy") return "Easy";
  if (v === "hard") return "Hard";
  if (v === "nightmare") return "Nightmare";
  return "Normal";
}

// Day 45 — the tab is driven by the URL so the sidebar (Calls vs Sparring) and the page
// can never disagree: /call-library → live, ?tab=sparring → sparring, ?tab=upload → upload.
// Clicking a tab writes the URL back (history.replaceState keeps useSearchParams in sync).
// useSearchParams needs a Suspense boundary for the static build, hence the wrapper.
export default function CallLibraryPage() {
  return (
    <Suspense fallback={null}>
      <CallLibraryPageInner />
    </Suspense>
  );
}

function CallLibraryPageInner() {
  const [tab, setTab] = useState<Tab>("live");
  const urlTab = useSearchParams()?.get("tab") ?? null;

  useEffect(() => {
    setTab(urlTab === "sparring" || urlTab === "upload" ? urlTab : "live");
  }, [urlTab]);

  const handleTabChange = useCallback((next: Tab) => {
    setTab(next);
    try {
      const url = next === "live" ? window.location.pathname : `${window.location.pathname}?tab=${next}`;
      window.history.replaceState(null, "", url);
    } catch {}
  }, []);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [minScore, setMinScore] = useState<string>("");
  const [maxScore, setMaxScore] = useState<string>("");
  const [selectedReps, setSelectedReps] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sparPersona, setSparPersona] = useState<string>("price_sensitive");
  const [sparDifficulty, setSparDifficulty] = useState<string>("normal");
  const [callScope, setCallScope] = useState<CallScope>("mine");
  // Day 292 — company-call access is the API's authority, resolved PER CALLER.
  // Day 291 gated the toggle on the org policy alone (`everyone`), which wrongly
  // disabled an assigned manager under the `managers` policy even though the API
  // serves them company calls. The org policy is not enough on its own: under
  // `managers` the server grants access only to a caller who is an assigned
  // manager, a decision the client must NOT re-derive from client-supplied
  // role/org values. So we ask the server's own enforced company-scope path
  // whether IT will serve this authenticated caller (see loadCompanyAccess).
  //   "allowed"  → server will serve company calls to this caller → offer it
  //   "managers" → policy is managers and this caller is not one → deny + hint
  //   "disabled" → company visibility is off org-wide → deny + hint
  //   "unknown"  → not positively confirmed (missing org / other / transport)
  // Every consumer below only opens Company scope when access === "allowed", so
  // an unknown or failed probe can only keep the UI at "mine" — never broaden it.
  const [companyAccess, setCompanyAccess] =
    useState<"allowed" | "managers" | "disabled" | "unknown">("unknown");
  const [companyAccessError, setCompanyAccessError] = useState(false);

  useEffect(() => {
    // If company access is anything but positively allowed, force back to "mine".
    if (companyAccess !== "allowed" && callScope === "company") {
      setCallScope("mine");
    }
  }, [companyAccess, callScope]);

  // Sparring personas config (loaded from API)
  const [sparPersonas, setSparPersonas] = useState<SparringPersonaOption[]>([]);
  const [sparPersonasLoading, setSparPersonasLoading] = useState(false);
  const [sparPersonasError, setSparPersonasError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // --- Live calls ---
  const [calls, setCalls] = useState<CallItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [, setAssignmentsLoading] = useState(false);
  const callsRef = useRef<CallItem[]>([]);
  useEffect(() => {
    callsRef.current = calls;
  }, [calls]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 400);

    return () => clearTimeout(handle);
  }, [search]);

  // Day 292 — resolve company-call access from the server's OWN enforcement,
  // per caller, through the canonical authenticated proxy helper (Supabase
  // identity injected by proxyFetch; no raw fetch, no legacy localStorage
  // identity header, no client-supplied role/org). We probe the same enforced
  // company-scope path the list itself uses — `/v1/calls/paged?scope=company`
  // with limit=1 — and read the server's verdict, which is authoritative and
  // non-spoofable because it is exactly the check the real load is subject to:
  //   200                              → this caller may see company calls
  //   403 company_calls_disabled       → org-wide off
  //   403 manager_only_access          → policy is managers, caller is not one
  //   anything else (missing org / 4xx / 5xx / transport) → "unknown"
  // "unknown" and every denial keep Company suppressed; we only surface a retry
  // hint for transport/server (5xx) failures, not for an expected authz denial.
  const loadCompanyAccess = useCallback(async () => {
    setCompanyAccessError(false);
    try {
      const r = await proxyFetch("/v1/calls/paged?scope=company&limit=1", {
        cache: "no-store",
      });
      if (r.ok) {
        setCompanyAccess("allowed");
        return;
      }
      const d = await r.json().catch(() => ({} as any));
      const reason = String(d?.error || "");
      if (r.status === 403 && reason === "company_calls_disabled") {
        setCompanyAccess("disabled");
      } else if (r.status === 403 && reason === "manager_only_access") {
        setCompanyAccess("managers");
      } else {
        setCompanyAccess("unknown");
        if (r.status >= 500) setCompanyAccessError(true);
      }
    } catch {
      setCompanyAccess("unknown");
      setCompanyAccessError(true);
    }
  }, []);

  useEffect(() => {
    void loadCompanyAccess();
  }, [loadCompanyAccess]);

  // --- Sparring ---
  const [sparring, setSparring] = useState<SparringSession[]>([]);
  const [loadingSparring, setLoadingSparring] = useState(false);
  const [sparringError, setSparringError] = useState<string | null>(null);

  // --- Uploads ---
  const uploads = Array.isArray(calls)
    ? calls.filter((c) => {
        const type = String(c.type ?? "").toLowerCase();
        return type === "upload" || type === "uploaded";
      })
    : [];
  const availableReps = Array.from(
    new Set(calls.map((c) => c.rep_name || "Unknown rep"))
  ).sort();

  // Load LIVE calls
  useEffect(() => {
    if (tab !== "live" && tab !== "upload") return;

    let alive = true;
    setLoading(true);
    setError(null);

    const loadCalls = async () => {
      const res = await fetchJsonWithRetry<CallsPagedResp>(
        buildCallsPagedUrl({
          limit: 20,
          q: debouncedSearch || undefined,
          scope:
            tab === "live"
              ? companyAccess === "allowed"
                ? callScope
                : "mine"
              : "mine",
        })
      );

      if (!alive) return;

      if (!res || (res as any).ok === false) {
        setCalls([]);
        setCursor(null);
        setError("Unable to load calls.");
        return;
      }

      const rawList = res.calls ?? res.items;

      const list = Array.isArray(rawList)
        ? rawList
        : [];

      setCalls(list);
      setCursor(
        typeof res.nextCursor === "string"
          ? res.nextCursor
          : null
      );
    };

    (async () => {
      try {
        await loadCalls();
      } catch (e) {
        console.error("call-library: calls load failed", e);
        if (alive) setError("Something went wrong loading calls.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    const interval = setInterval(async () => {
      try {
        const hasNonFinal = callsRef.current.some((c) => {
          const s = String(c.status || "").toLowerCase();
          return s === "queued" || s === "processing" || s === "running" || s === "processed";
        });

        if (!hasNonFinal) return;
        await loadCalls();
      } catch {
        // fail-soft while polling
      }
    }, 5000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [tab, debouncedSearch, callScope, companyAccess]);

  useEffect(() => {
    if (tab !== "live") return;
    if (calls.length === 0) return;

    let cancelled = false;

    async function loadAssignmentState() {
      try {
        setAssignmentsLoading(true);
        const targetIds = Array.from(new Set(calls.map((c) => c.id).filter(Boolean)));
        if (targetIds.length === 0) return;

        const res = await fetchJsonWithRetry<AssignmentsByTargetResp>(
          buildAssignmentsByTargetUrl(targetIds)
        );

        if (cancelled || !res || res.ok === false) return;

        const byId = new Map((res.items || []).map((item) => [item.target_id, item]));

        setCalls((prev) =>
          prev.map((call) => {
            const item = byId.get(call.id);
            if (!item) {
              return call;
            }

            return {
              ...call,
              assignment_status: item.status,
              has_open_assignment:
                typeof call.has_open_assignment === "boolean"
                  ? call.has_open_assignment || item.has_open
                  : item.has_open,
              has_completed_assignment: item.has_completed,
            };
          })
        );
      } catch (e) {
        console.error("call-library: assignments state load failed", e);
      } finally {
        if (!cancelled) setAssignmentsLoading(false);
      }
    }

    loadAssignmentState();

    return () => {
      cancelled = true;
    };
  }, [tab, calls.length, callScope]);


  // Load SPARRING sessions
  useEffect(() => {
    if (tab !== "sparring") return;

    let alive = true;
    setLoadingSparring(true);
    setSparringError(null);

    fetchJsonWithRetry("/api/proxy/v1/sparring/sessions?limit=20")
      .then((res: any) => {
        if (!alive) return;

        if (!res) {
          setSparring([]);
          setSparringError("No response from server when loading sparring sessions.");
          return;
        }

        // If API returned { ok: false, error: "..." }, surface it
        if (res.ok === false) {
          setSparring([]);
          setSparringError(
            res.error || "API reported an error loading sparring sessions."
          );
          return;
        }

        // Happy path: { ok: true, sessions: [...] }
        if (Array.isArray(res.sessions)) {
          setSparring(res.sessions as SparringSession[]);
        } else {
          setSparring([]);
        }
      })
      .catch((err: any) => {
        console.error("Error loading sparring:", err);
        if (!alive) return;
        setSparringError(
          err?.message ?? "Something went wrong loading sparring sessions."
        );
      })
      .finally(() => {
        if (!alive) return;
        setLoadingSparring(false);
      });

    return () => {
      alive = false;
    };
  }, [tab]);

  // Load sparring personas (config) when we hit the Sparring tab
  useEffect(() => {
    if (tab !== "sparring") return;

    let cancelled = false;
    setSparPersonasLoading(true);
    setSparPersonasError(null);

    fetchJsonWithRetry("/api/proxy/v1/sparring/personas")
      .then((res: any) => {
        if (cancelled) return;

        if (!res || res.ok === false) {
          setSparPersonas([]);
          if (res?.error) {
            setSparPersonasError(res.error);
          } else {
            setSparPersonasError("Unable to load sparring personas.");
          }
          return;
        }

        const items: SparringPersonaOption[] = Array.isArray(res.personas) ? res.personas : [];
        setSparPersonas(items);

        // If current persona isn't in list, default to first
        if (items.length > 0 && !items.some((p) => p.id === sparPersona)) {
          setSparPersona(items[0].id);
          if (items[0].default_difficulty) {
            setSparDifficulty(items[0].default_difficulty);
          }
        }
      })
      .catch((e: any) => {
        if (cancelled) return;
        console.error("Failed to load sparring personas", e);
        setSparPersonas([]);
        setSparPersonasError(e?.message || "Unable to load sparring personas.");
      })
      .finally(() => {
        if (!cancelled) setSparPersonasLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tab, sparPersona]);


  // Load more paged calls for the current calls view (live/upload)
  async function loadMore() {
    if (!cursor || loadingMore) return;

    try {
      setLoadingMore(true);
      setMoreError(null);

      const res = await fetchJsonWithRetry<CallsPagedResp>(
        buildCallsPagedUrl({
          limit: 20,
          cursor,
          q: debouncedSearch || undefined,
          scope:
            tab === "live"
              ? companyAccess === "allowed"
                ? callScope
                : "mine"
              : "mine",
        })
      );

      const rawList = res?.calls ?? res?.items;

      const list = Array.isArray(rawList)
        ? rawList
        : [];

      setCalls((prev) => [...prev, ...list]);

      setCursor(
        typeof res?.nextCursor === "string"
          ? res.nextCursor
          : null
      );
    } catch (e: any) {
      console.error("call-library: loadMore failed", e);
      setMoreError(e?.message || "Failed to load more calls.");
    } finally {
      setLoadingMore(false);
    }
  }


  // Apply status/score + rep + tag filters to live calls
  const filteredCalls = calls.filter((c) => {
    // Status filter
    if (statusFilter === "scored") {
      if (typeof c.score_overall !== "number") return false;
    } else if (statusFilter === "processing") {
      const isProcessing =
        typeof c.score_overall !== "number" &&
        c.status.toLowerCase() !== "failed";
      if (!isProcessing) return false;
    } else if (statusFilter === "failed") {
      if (c.status.toLowerCase() !== "failed") return false;
    }

    // Rep multi-select filter
    if (selectedReps.length > 0) {
      const rep = c.rep_name || "Unknown rep";
      if (!selectedReps.includes(rep)) return false;
    }

    // Tag multi-select filter (future-proof; works once tags are populated)
    if (selectedTags.length > 0) {
      const callTags = (c.tags ?? []).map((t) => t.toLowerCase());
      const wanted = selectedTags.map((t) => t.toLowerCase());
      const matches = wanted.some((t) => callTags.includes(t));
      if (!matches) return false;
    }

    // Text search filter (fallback to ensure UI matches search box)
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      const name = (c.filename || "").toLowerCase();
      const summary = (c.summary || "").toLowerCase();

      if (!name.includes(q) && !summary.includes(q)) {
        return false;
      }
    }

    // Score range filter
    const scoreVal =
      typeof c.score_overall === "number" ? c.score_overall : null;

    if (minScore !== "") {
      const min = Number(minScore);
      if (!Number.isNaN(min)) {
        if (scoreVal == null || scoreVal < min) return false;
      }
    }

    if (maxScore !== "") {
      const max = Number(maxScore);
      if (!Number.isNaN(max)) {
        if (scoreVal == null || scoreVal > max) return false;
      }
    }

    // Score band filter (All / 80+ / 60–79 / <60)
    if (scoreFilter === "high") {
      if (scoreVal == null || scoreVal < 80) return false;
    } else if (scoreFilter === "medium") {
      if (scoreVal == null || scoreVal < 60 || scoreVal > 79) return false;
    } else if (scoreFilter === "low") {
      if (scoreVal == null || scoreVal >= 60) return false;
    }

    return true;
  });

  const sortedCalls = filteredCalls.slice().sort((a, b) => {
    const aDate = new Date(a.created_at).getTime();
    const bDate = new Date(b.created_at).getTime();

    switch (sortBy) {
      case "oldest":
        return aDate - bDate;
      case "scoreHigh": {
        const as = a.score_overall ?? -Infinity;
        const bs = b.score_overall ?? -Infinity;
        return bs - as;
      }
      case "scoreLow": {
        const as = a.score_overall ?? Infinity;
        const bs = b.score_overall ?? Infinity;
        return as - bs;
      }
      case "durationHigh": {
        const ad = a.duration_sec ?? 0;
        const bd = b.duration_sec ?? 0;
        return bd - ad;
      }
      case "durationLow": {
        const ad = a.duration_sec ?? 0;
        const bd = b.duration_sec ?? 0;
        return ad - bd;
      }
      case "newest":
      default:
        return bDate - aDate;
    }
  });

  const activeFilterCount =
    (selectedReps.length > 0 ? 1 : 0) +
    (selectedTags.length > 0 ? 1 : 0) +
    (minScore !== "" || maxScore !== "" ? 1 : 0) +
    (scoreFilter !== "all" ? 1 : 0);

  return (
    <PageContainer>
      {/* Header — glass pilot: one title, one primary action per tab. */}
      <PageHead
        title={tab === "sparring" ? "Practice" : "Calls"}
        subtitle={
          tab === "sparring"
            ? "Practise objection handling against AI buyers and review your sessions."
            : tab === "upload"
              ? "Recordings added through the upload workflow."
              : "Find a scored call, review coaching, or upload a new recording."
        }
        actions={
          tab === "sparring" ? (
            <Link href="/sparring" className={dsButton("secondary", "md", "whitespace-nowrap")}>Open Sparring Arena</Link>
          ) : (
            <Link href="/upload" className={dsButton("primary", "md")}>Upload call</Link>
          )
        }
      />

      {/* Tabs — Day 199: shared WorkspaceTabs (indigo active) to match /coaching */}
      <WorkspaceTabs<Tab>
        tabs={[
          { id: "live", label: "Live Calls" },
          { id: "sparring", label: "Practice" },
          { id: "upload", label: "Call Uploads" },
        ]}
        active={tab}
        onChange={handleTabChange}
      />

      {tab !== "live" && (
        <GlassCard as="div" className="!p-3">
          <SearchInput
            label={tab === "sparring" ? "Search sparring sessions" : "Search calls"}
            placeholder={tab === "sparring" ? "Search sessions…" : "Search uploads…"}
            value={search}
            onChange={setSearch}
          />
        </GlassCard>
      )}

      {/* Filters — glass pilot: search + status + sort stay visible; reps/score/tags sit behind one "More filters" disclosure. */}
      {tab === "live" && (
        <GlassCard as="div" className="!p-4 space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="md:w-72">
              <SearchInput label="Search calls" placeholder="Search calls" value={search} onChange={setSearch} />
            </div>
            <Segmented
              label="Call status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: "All" },
                { value: "scored", label: "Scored" },
                { value: "processing", label: "Processing" },
                { value: "failed", label: "Failed" },
              ]}
            />
            <div className="flex items-center gap-2 md:ml-auto">
              {companyAccess === "allowed" && (
                <Segmented
                  label="Call scope"
                  value={callScope}
                  onChange={setCallScope}
                  options={[
                    { value: "mine", label: "My calls" },
                    { value: "company", label: "Company" },
                  ]}
                />
              )}
              <select
                aria-label="Sort calls"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="ds-focus rounded-[var(--ds-radius-control)] border border-[var(--ds-border)] bg-[var(--ds-panel)] px-2.5 py-2 text-sm text-[var(--ds-text)]"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="scoreHigh">Highest score</option>
                <option value="scoreLow">Lowest score</option>
                <option value="durationHigh">Longest</option>
                <option value="durationLow">Shortest</option>
              </select>
            </div>
          </div>

          {companyAccess === "managers" && (
            <p className="text-xs text-[var(--ds-text-3)]">Company calls are restricted to managers.</p>
          )}
          {companyAccess === "disabled" && (
            <p className="text-xs text-[var(--ds-text-3)]">Company call visibility is disabled.</p>
          )}
          {companyAccessError && (
            <p className="flex items-center gap-2 text-xs text-[var(--ds-text-3)]">
              Couldn’t confirm company-call access — showing your calls only.
              <button type="button" onClick={() => void loadCompanyAccess()} className={dsButton("quiet", "sm")}>Retry</button>
            </p>
          )}

          <details className="group border-t border-[var(--ds-border)] pt-3">
            <summary className="ds-focus flex cursor-pointer list-none items-center justify-between gap-3 rounded-md text-sm text-[var(--ds-text-2)] hover:text-[var(--ds-text)] [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <span className="font-medium">More filters</span>
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-200 tabular-nums">
                    {activeFilterCount} active
                  </span>
                )}
                <span className="text-[var(--ds-text-3)]">Reps, score, tags</span>
              </span>
              <span aria-hidden className="text-neutral-500 transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-3 text-xs">
              {/* Rep multi-select */}
              <div className="relative">
                <details className="group">
                  <summary className="cursor-pointer rounded-md border border-neutral-700 px-3 py-1 text-neutral-300 group-open:bg-neutral-800 list-none">
                    Reps ▾
                  </summary>
                  <div className="absolute z-20 mt-1 w-40 rounded-md border border-neutral-700 bg-neutral-900 p-2 shadow-lg">
                    {availableReps.length === 0 && (
                      <div className="py-1 text-xs text-neutral-500">
                        No reps yet
                      </div>
                    )}
                    {availableReps.map((rep) => (
                      <label
                        key={rep}
                        className="flex items-center gap-2 py-1 text-xs text-neutral-200"
                      >
                        <input
                          type="checkbox"
                          className="h-3 w-3"
                          checked={selectedReps.includes(rep)}
                          onChange={() => {
                            setSelectedReps((prev) =>
                              prev.includes(rep)
                                ? prev.filter((r) => r !== rep)
                                : [...prev, rep]
                            );
                          }}
                        />
                        <span className="truncate">{rep}</span>
                      </label>
                    ))}
                  </div>
                </details>
              </div>

              {/* Score range */}
              <div className="flex items-center gap-1">
                <span className="text-neutral-500">Score</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={minScore}
                  onChange={(e) => setMinScore(e.target.value)}
                  placeholder="Min"
                  className="w-14 rounded-md border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-xs text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-300"
                />
                <span className="text-neutral-500">–</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                  placeholder="Max"
                  className="w-14 rounded-md border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-xs text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-300"
                />
              </div>

              {/* Tag multi-select */}
              <div className="relative">
                <details className="group">
                  <summary className="cursor-pointer rounded-md border border-neutral-700 px-3 py-1 text-neutral-300 group-open:bg-neutral-800 list-none">
                    Tags ▾
                  </summary>
                  <div className="absolute z-20 mt-1 w-44 rounded-md border border-neutral-700 bg-neutral-900 p-2 shadow-lg">
                    {AVAILABLE_TAGS.map((tag) => (
                      <label
                        key={tag}
                        className="flex items-center gap-2 py-1 text-xs text-neutral-200"
                      >
                        <input
                          type="checkbox"
                          className="h-3 w-3"
                          checked={selectedTags.includes(tag)}
                          onChange={() => {
                            setSelectedTags((prev) =>
                              prev.includes(tag)
                                ? prev.filter((t) => t !== tag)
                                : [...prev, tag]
                            );
                          }}
                        />
                        <span className="truncate">{tag}</span>
                      </label>
                    ))}
                  </div>
                </details>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-neutral-500">Score band</span>
                {[
                  { id: "all", label: "All" },
                  { id: "low", label: "Below 60" },
                  { id: "medium", label: "60–79" },
                  { id: "high", label: "80+" },
                ].map((opt) => {
                  const active = scoreFilter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setScoreFilter(opt.id as ScoreFilter)}
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 transition ${active
                        ? "border-indigo-500/40 bg-indigo-500/15 font-medium text-indigo-200"
                        : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                        }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  setStatusFilter("all");
                  setCallScope("mine");
                  setSelectedReps([]);
                  setSelectedTags([]);
                  setMinScore("");
                  setMaxScore("");
                  setScoreFilter("all");
                }}
                className="rounded-full border border-neutral-700 px-3 py-1 text-neutral-300 hover:bg-neutral-800"
              >
                Reset
              </button>
            </div>
          </details>
        </GlassCard>
      )}

      {/* LIVE CALLS — rows, not cards: title, date · duration, status, score; whole row opens the review. */}
      {tab === "live" && (
        <Panel>
          {debouncedSearch && !loading && !error && (
            <p className="border-b border-[var(--ds-border)] px-5 py-3 text-sm text-[var(--ds-text-3)]">
              {sortedCalls.length} result{sortedCalls.length === 1 ? "" : "s"} for “{debouncedSearch}”
            </p>
          )}

          {loading && <LoadingRows rows={6} label="Loading calls" />}

          {error && !loading && (
            <ErrorPanel title="Couldn’t load your calls" body="Check your connection and try again." onRetry={() => window.location.reload()} />
          )}

          {!loading && !error && sortedCalls.length === 0 && (
            calls.length === 0 ? (
              <EmptyPanel
                title="No calls yet"
                body="Upload a recording and you’ll get a scored breakdown with coaching points."
                action={<Link href="/upload" className={dsButton("primary", "md")}>Upload call</Link>}
              />
            ) : (
              <EmptyPanel
                title={debouncedSearch ? "No calls match this search" : "No calls match these filters"}
                body="Try a different search or clear the filters."
              />
            )
          )}

          {!loading && !error && sortedCalls.length > 0 && (
            <>
              <DataList label="Calls">
                {sortedCalls.map((c) => {
                  const st = callState(c.status);
                  const score = typeof c.score_overall === "number" ? Math.round(c.score_overall) : null;
                  const meta = [
                    callScope === "company" && c.rep_name ? c.rep_name : null,
                    formatCallDate(c.created_at),
                    formatDuration(c.duration_ms, c.duration_sec),
                  ].filter(Boolean).join(" · ");
                  return (
                    <DataRow
                      key={c.id}
                      href={`/calls/${c.id}`}
                      title={formatCallDisplayTitle({ title: c.filename, repName: c.rep_name })}
                      meta={meta}
                      trailing={
                        <>
                          {st.kind !== "scored" && <Badge tone={st.tone}>{st.label}</Badge>}
                          {st.kind === "scored" && callAssignmentBadge(c) && <Badge tone="info">{callAssignmentBadge(c)!.label}</Badge>}
                          {st.kind === "scored" && <Badge tone={scoreTone(score)}>{score ?? "—"}</Badge>}
                          <span aria-hidden className="text-[var(--ds-text-3)]">›</span>
                        </>
                      }
                    />
                  );
                })}
              </DataList>

              <div className="flex items-center justify-between border-t border-[var(--ds-border)] px-5 py-3">
                {moreError && <span className="text-xs text-red-300">{moreError}</span>}
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={!cursor || loadingMore}
                  className={dsButton("secondary", "sm", "ml-auto")}
                >
                  {loadingMore ? "Loading…" : cursor ? "Load older calls" : "No more calls"}
                </button>
              </div>
            </>
          )}
        </Panel>
      )}

      {/* SPARRING TAB (LIVE WIRED DATA) */}
      {tab === "sparring" && (
        <Panel>
          <PanelHeader
            title="Recent sessions"
            action={
              /* One-click start sparring with chosen persona/difficulty */
              <SparringStartButton personaId={sparPersona} difficulty={sparDifficulty} />
            }
          />
          {/* Persona + difficulty presets for the next round */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--ds-border)] px-5 py-3 text-xs text-[var(--ds-text-3)] sm:px-6">
            <label htmlFor="spar-preset">Preset</label>
            <select
              id="spar-preset"
              aria-label="Opponent preset"
              value={sparPersona}
              onChange={(e) => setSparPersona(e.target.value)}
              className={`${dsField} !w-auto !py-1`}
            >
              {sparPersonas.length > 0 ? (
                sparPersonas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))
              ) : (
                <>
                  {/* Fallback options if API fails or no config yet */}
                  <option value="price_sensitive">Price-sensitive buyer</option>
                  <option value="stalling">Stalling / “think about it”</option>
                  <option value="gatekeeper">Gatekeeper / screening</option>
                </>
              )}
            </select>

            <label htmlFor="spar-difficulty" className="sm:ml-2">Difficulty</label>
            <select
              id="spar-difficulty"
              aria-label="Difficulty"
              value={sparDifficulty}
              onChange={(e) => setSparDifficulty(e.target.value)}
              className={`${dsField} !w-auto !py-1`}
            >
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
            </select>

            {sparPersonasLoading && <span>Loading personas…</span>}
            {sparPersonasError && !sparPersonasLoading && <span className="text-red-200">{sparPersonasError}</span>}
          </div>

          {/* Body: list / loading / errors */}
          {loadingSparring && <LoadingRows rows={3} label="Loading sparring sessions" />}

          {!loadingSparring && sparringError && <ErrorPanel title="Couldn’t load sessions" body={sparringError} />}

          {!loadingSparring && !sparringError && sparring.length === 0 && (
            <EmptyPanel
              title="No sparring sessions yet"
              body="Pick a persona and difficulty above, then start your first round."
            />
          )}

          {!loadingSparring && !sparringError && sparring.length > 0 && (
            <DataList label="Sparring sessions">
              {sparring.map((s) => {
                const created = new Date(s.created_at).toLocaleString();
                const xp = typeof s.xp_awarded === "number" ? s.xp_awarded : undefined;
                const total = typeof s.total === "number" ? Math.round(s.total) : null;
                const personaLabel =
                  s.persona_id &&
                  (sparPersonas.find((p) => p.id === s.persona_id)?.label || s.persona_id);
                const detail = [personaLabel, s.difficulty ? difficultyLabel(s.difficulty) : null, created]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <DataRow
                    key={s.id}
                    href={`/sparring/${s.id}`}
                    title="Sparring session"
                    meta={detail}
                    trailing={
                      <>
                        {total !== null && <Badge tone={scoreTone(total)}>Score {total}</Badge>}
                        {xp !== undefined && <Badge>XP {xp}</Badge>}
                        <span aria-hidden className="text-[var(--ds-text-3)]">›</span>
                      </>
                    }
                  />
                );
              })}
            </DataList>
          )}
        </Panel>
      )}

      {/* UPLOADS TAB */}
      {tab === "upload" && (
        <Panel>
          <PanelHeader title="Uploaded calls" meta={uploads.length > 0 ? `${uploads.length}` : undefined} />
          {uploads.length === 0 && (
            <EmptyPanel
              title="No uploaded calls yet"
              body="Upload a recording to have it analysed and added to your library."
              action={<Link href="/upload" className={dsButton("primary", "md")}>Upload a call</Link>}
            />
          )}

          {uploads.length > 0 && (
            <DataList label="Uploaded calls">
              {uploads.map((c) => (
                <DataRow
                  key={c.id}
                  href={`/calls/${c.id}`}
                  title={c.filename || `Upload ${c.id.slice(0, 8)}…`}
                  meta={new Date(c.created_at).toLocaleString()}
                  trailing={
                    <>
                      <Button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          window.location.href = `/calls/${c.id}?crm=1`;
                        }}
                      >
                        Open + link CRM
                      </Button>
                      <span aria-hidden className="text-[var(--ds-text-3)]">›</span>
                    </>
                  }
                />
              ))}
            </DataList>
          )}
        </Panel>
      )}
    </PageContainer>
  );
}