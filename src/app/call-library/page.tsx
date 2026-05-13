// src/app/call-library/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fetchJsonWithRetry } from "@/lib/fetchJsonwithretry";
import SparringStartButton from "@/components/SparringStartButton";

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

function formatCallDuration(call: CallItem): string {
  if (call.duration_ms && call.duration_ms > 0) {
    const totalSeconds = Math.floor(call.duration_ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }

  if (call.duration_sec && call.duration_sec > 0) {
    const minutes = Math.floor(call.duration_sec / 60);
    const seconds = call.duration_sec % 60;
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }

  return "—";
}

function summarySnippet(summary?: string | null, max = 120): string {
  if (!summary) return "No summary yet.";
  if (summary.length <= max) return summary;
  return summary.slice(0, max - 1) + "…";
}

function scoreColour(score: number | null) {
  if (score == null) return "text-zinc-400";
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-amber-300";
  return "text-red-300";
}

function statusDotColour(status: string) {
  const s = status.toLowerCase();
  if (s === "failed" || s === "error") return "bg-red-400";
  if (s === "processing" || s === "queued" || s === "running")
    return "bg-amber-300";
  if (s === "scored" || s === "processed" || s === "completed")
    return "bg-emerald-400";
  return "bg-neutral-500";
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


function displayType(type?: string | null): string {
  if (!type) return "Live";
  const t = type.toLowerCase();
  if (t === "upload") return "Upload";
  if (t === "sparring") return "Sparring";
  return "Live";
}

function difficultyLabel(value?: string | null) {
  if (!value) return "Normal";
  const v = value.toLowerCase();
  if (v === "easy") return "Easy";
  if (v === "hard") return "Hard";
  if (v === "nightmare") return "Nightmare";
  return "Normal";
}

export default function CallLibraryPage() {
  const [tab, setTab] = useState<Tab>("live");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [minScore, setMinScore] = useState<string>("");
  const [maxScore, setMaxScore] = useState<string>("");
  const [selectedReps, setSelectedReps] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sparPersona, setSparPersona] = useState<string>("price_sensitive");
  const [sparDifficulty, setSparDifficulty] = useState<string>("normal");
  const [expandedSummaries, setExpandedSummaries] = useState<Record<string, boolean>>({});
  const [callScope, setCallScope] = useState<CallScope>("mine");
  const [visibility, setVisibility] = useState<"everyone" | "managers" | "disabled">("everyone");

  useEffect(() => {
    // 🔥 If company becomes restricted, force back to "mine"
    if (visibility !== "everyone" && callScope === "company") {
      setCallScope("mine");
    }
  }, [visibility, callScope]);

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
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/proxy/v1/admin/org-settings", {
          headers: { "x-user-id": localStorage.getItem("uid") || "" },
        });
        const d = await res.json();
        if (d?.settings?.call_visibility) {
          setVisibility(d.settings.call_visibility);
        }
      } catch (e) {
        console.warn("failed to load visibility", e);
      }
    })();
  }, []);

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
              ? visibility === "everyone"
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
  }, [tab, debouncedSearch, callScope]);

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

        const items = Array.isArray(res.personas) ? res.personas : [];
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
              ? visibility === "everyone"
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

  function toggleSummary(callId: string) {
    setExpandedSummaries((prev) => ({
      ...prev,
      [callId]: !prev[callId],
    }));
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

  return (
    <div className="max-w-6xl mx-auto py-10 px-6">
      {/* Header + search */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Call Library</h1>
          <p className="text-sm text-neutral-400">
            Live recordings, AI sparring sessions, and uploaded conversations to
            track performance.
          </p>
        </div>
        <div className="w-full md:w-80">
          <input
            type="search"
            placeholder="Search past conversations and training sessions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-300"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-neutral-800 mb-4 flex gap-6 text-sm">
        <button
          type="button"
          onClick={() => setTab("live")}
          className={`pb-2 border-b-2 -mb-px transition-colors ${tab === "live"
            ? "border-neutral-100 text-neutral-100"
            : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
        >
          Live Calls
        </button>
        <button
          type="button"
          onClick={() => setTab("sparring")}
          className={`pb-2 border-b-2 -mb-px transition-colors ${tab === "sparring"
            ? "border-neutral-100 text-neutral-100"
            : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
        >
          AI Sparring
        </button>
        <button
          type="button"
          onClick={() => setTab("upload")}
          className={`pb-2 border-b-2 -mb-px transition-colors ${tab === "upload"
            ? "border-neutral-100 text-neutral-100"
            : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
        >
          Call Uploads
        </button>
      </div>

      {/* Status / score + rep filters for live calls */}
      {tab === "live" && (
        <div className="mb-4 flex flex-col gap-3 text-xs">
          <div className="flex flex-wrap gap-2">
            <span className="self-center text-neutral-500">View</span>
            {[
              { id: "mine", label: "My calls" },
              { id: "company", label: "Company calls", disabled: visibility !== "everyone" },
            ].map((opt) => {
              const isDisabled = (opt as any).disabled;
              const active = callScope === opt.id;

              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    if (isDisabled) return;
                    setCallScope(opt.id as CallScope);
                  }}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 transition ${
                    active
                      ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                      : isDisabled
                      ? "border-neutral-700 bg-neutral-900 text-neutral-600 opacity-50 cursor-not-allowed"
                      : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                  }`}
                >
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
          {visibility === "managers" && (
            <div className="text-[11px] text-amber-400 mt-1">
              Company calls are restricted to managers.
            </div>
          )}
          {visibility === "disabled" && (
            <div className="text-[11px] text-red-400 mt-1">
              Company call visibility is disabled.
            </div>
          )}
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            {/* Left: status chips */}
            <div className="flex flex-wrap gap-3">
              {[
                { id: "all", label: "All calls" },
                { id: "scored", label: "Scored" },
                { id: "processing", label: "Processing" },
                { id: "failed", label: "Failed" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStatusFilter(opt.id as StatusFilter)}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 transition ${statusFilter === opt.id
                    ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                    : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                    }`}
                >
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>

            {/* Right: reps + score range + tags */}
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
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

              <button
                type="button"
                onClick={() => {
                  setStatusFilter("all");
                  setCallScope("mine");
                  setSelectedReps([]);
                  setSelectedTags([]);
                  setMinScore("");
                  setMaxScore("");
                }}
                className="rounded-full border border-neutral-700 px-3 py-1 text-neutral-300 hover:bg-neutral-800"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIVE CALLS */}
      {tab === "live" && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <span>Latest analysed calls</span>
              {assignmentsLoading && (
                <span className="text-[11px] text-neutral-500">Checking assignments…</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <span>Sort by</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-300"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="scoreHigh">Highest score</option>
                <option value="scoreLow">Lowest score</option>
                <option value="durationHigh">Longest duration</option>
                <option value="durationLow">Shortest duration</option>
              </select>
            </div>
          </div>

          {debouncedSearch && !loading && !error && (
            <div className="px-4 pt-2 text-xs text-neutral-500">
              Showing {sortedCalls.length} result
              {sortedCalls.length === 1 ? "" : "s"} for “{debouncedSearch}”
            </div>
          )}

          <div className="px-4 pt-2 pb-1 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
            <span className="text-neutral-500 mr-1">Score band:</span>
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
                  onClick={() => setScoreFilter(opt.id as ScoreFilter)}
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 ${active
                    ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                    : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                    }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {loading && (
            <div className="px-4 py-6 text-sm text-neutral-500">
              Loading calls…
            </div>
          )}

          {error && !loading && (
            <div className="px-4 py-6 text-sm text-red-400">{error}</div>
          )}

          {!loading && !error && sortedCalls.length === 0 && (
            <div className="px-4 py-6 text-sm text-neutral-500">
              {calls.length === 0
                ? "No calls found yet."
                : debouncedSearch
                  ? "No calls match this search yet."
                  : "No calls match this filter."}
            </div>
          )}

          {!loading && !error && sortedCalls.length > 0 && (
            <>
              <div className="divide-y divide-neutral-800">
                {sortedCalls.map((c) => {
                  const score =
                    typeof c.score_overall === "number"
                      ? Math.round(c.score_overall)
                      : null;
                  const created = new Date(c.created_at).toLocaleString();
                  const durationLabel = formatCallDuration(c);
                  const badge = callAssignmentBadge(c);
                  const isExpanded = !!expandedSummaries[c.id];
                  const hasLongSummary = !!c.summary && c.summary.length > 120;
                  const snippet = isExpanded ? (c.summary || "No summary yet.") : summarySnippet(c.summary);

                  return (
                    <div
                      key={c.id}
                      className="px-4 py-3 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-sm text-neutral-100 truncate">
                            {c.filename || `Call ${c.id.slice(0, 8)}…`}
                          </div>
                          <span className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300">
                            {displayType(c.type)}
                          </span>
                          {badge && (
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-neutral-500">
                          {c.rep_name ? c.rep_name : "Unknown rep"} • {created}
                          {durationLabel && <> • {durationLabel}</>}
                        </div>
                        <div className={`mt-1 text-xs text-neutral-400 ${isExpanded ? "" : "line-clamp-2"}`}>
                          {snippet}
                        </div>
                        {hasLongSummary && (
                          <button
                            type="button"
                            onClick={() => toggleSummary(c.id)}
                            className="mt-1 text-[11px] text-neutral-300 underline hover:text-white"
                          >
                            {isExpanded ? "Show less" : "Show more"}
                          </button>
                        )}
                        {Array.isArray(c.tags) && c.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {c.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[10px] text-neutral-300"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex h-2 w-2 rounded-full ${statusDotColour(
                              c.status
                            )}`}
                          />
                          <span className="text-xs text-neutral-500">
                            {c.status}
                          </span>
                        </div>
                        <div
                          className={`text-sm tabular-nums px-2 py-1 rounded-full border ${scoreColour(
                            score
                          )}`}
                        >
                          {score != null ? score : "—"}
                        </div>
                        <Link
                          href={`/calls/${c.id}`}
                          className="text-xs text-neutral-200 underline hover:text-white whitespace-nowrap"
                        >
                          Open
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Load more footer */}
              <div className="px-4 py-3 border-t border-neutral-800 flex items-center justify-between">
                {moreError && (
                  <span className="text-xs text-red-300">{moreError}</span>
                )}
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={!cursor || loadingMore}
                  className="ml-auto text-xs rounded border border-neutral-700 px-3 py-1.5 disabled:opacity-40"
                >
                  {loadingMore
                    ? "Loading…"
                    : cursor
                      ? "Load older calls"
                      : "No more calls"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* SPARRING TAB (LIVE WIRED DATA) */}
      {tab === "sparring" && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950">
          {/* Header: persona + difficulty + start button */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 gap-4">
            <div className="flex flex-col gap-1">
              <div className="text-sm text-neutral-400">
                Recent sparring sessions
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                <span className="opacity-70">Preset:</span>
                <select
                  value={sparPersona}
                  onChange={(e) => setSparPersona(e.target.value)}
                  className="rounded-full border border-neutral-700 bg-neutral-950 px-2 py-1 text-[11px] outline-none"
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

                <span className="opacity-70 ml-2">Difficulty:</span>
                <select
                  value={sparDifficulty}
                  onChange={(e) => setSparDifficulty(e.target.value)}
                  className="rounded-full border border-neutral-700 bg-neutral-950 px-2 py-1 text-[11px] outline-none"
                >
                  <option value="easy">Easy</option>
                  <option value="normal">Normal</option>
                  <option value="hard">Hard</option>
                </select>
              </div>

              {sparPersonasLoading && (
                <span className="text-[10px] text-neutral-500">
                  Loading personas…
                </span>
              )}
              {sparPersonasError && !sparPersonasLoading && (
                <span className="text-[10px] text-red-400">
                  {sparPersonasError}
                </span>
              )}
            </div>

            {/* One-click start sparring with chosen persona/difficulty */}
            <SparringStartButton
              personaId={sparPersona}
              difficulty={sparDifficulty}
            />
          </div>

          {/* Body: list / loading / errors */}
          {loadingSparring && (
            <div className="px-4 py-6 text-sm text-neutral-500">
              Loading sparring sessions…
            </div>
          )}

          {!loadingSparring && sparringError && (
            <div className="px-4 py-6 text-sm text-red-400">{sparringError}</div>
          )}

          {!loadingSparring && !sparringError && sparring.length === 0 && (
            <div className="px-4 py-6 text-sm text-neutral-500">
              No sparring sessions found.
            </div>
          )}

          {!loadingSparring && !sparringError && sparring.length > 0 && (
            <div className="divide-y divide-neutral-800">
              {sparring.map((s) => {
                const created = new Date(s.created_at).toLocaleString();
                const xp =
                  typeof s.xp_awarded === "number" ? s.xp_awarded : undefined;
                const total =
                  typeof s.total === "number" ? Math.round(s.total) : null;
                const personaLabel =
                  s.persona_id &&
                  (sparPersonas.find((p) => p.id === s.persona_id)?.label || s.persona_id);

                return (
                  <Link
                    key={s.id}
                    href={`/sparring/${s.id}`}
                    className="block px-4 py-3 hover:bg-neutral-900/60 transition"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-sm text-neutral-100 truncate">
                            Sparring session
                          </div>
                        </div>
                        {(personaLabel || s.difficulty) && (
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                            {personaLabel && (
                              <span className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300">
                                {personaLabel}
                              </span>
                            )}
                            {s.difficulty && (
                              <span className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300">
                                {difficultyLabel(s.difficulty)}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="text-xs text-neutral-500">{created}</div>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        {total !== null && (
                          <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-neutral-200">
                            Score {total}
                          </span>
                        )}
                        {xp !== undefined && (
                          <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-neutral-200">
                            XP {xp}
                          </span>
                        )}
                        <span className="text-neutral-400">Open →</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* UPLOADS TAB */}
      {tab === "upload" && (
        <div className="rounded-lg border border-neutral-800 p-4 text-sm text-neutral-300">
          {uploads.length === 0 && (
            <div className="py-4 text-neutral-500">
              No uploaded calls found.
            </div>
          )}

          {uploads.length > 0 &&
            uploads.map((c) => (
              <Link
                key={c.id}
                href={`/calls/${c.id}`}
                className="block rounded-lg border border-neutral-700 hover:bg-neutral-800 p-4 mb-3 transition"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium text-neutral-100">
                      {c.filename || `Upload ${c.id.slice(0, 8)}…`}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {new Date(c.created_at).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        window.location.href = `/calls/${c.id}?crm=1`;
                      }}
                      className="rounded-md border border-neutral-700 px-2 py-1 text-neutral-200 hover:bg-neutral-800"
                    >
                      Open + link CRM
                    </button>
                    <span className="text-neutral-400">Open →</span>
                  </div>
                </div>
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}