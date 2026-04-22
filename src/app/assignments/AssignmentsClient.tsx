"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { proxyFetch } from "@/lib/api";

type Assignment = {
  id: string;
  rep_id: string;
  manager_id: string;
  type: "custom" | "sparring" | "call_review";
  target_id: string | null;
  title: string;
  status: string;
  due_at: string | null;
  created_at: string;
  completed_at: string | null;
  completed_by?: string | null;
};

type AssignmentsResponse = {
  ok: true;
  repId: string;
  items?: Assignment[];
  assignments?: Assignment[];
  summary?: {
    open_count?: number;
    completed_count?: number;
    overdue_count?: number;
    due_today_count?: number;
    today_focus?: Assignment | null;
  };
  today_focus?: Assignment | null;
};

type CompleteResponse = {
  ok: true;
  assignment: Assignment;
};

type RepsMeResponse = {
  ok: true;
  me: {
    id: string;
    name?: string | null;
    tier?: string | null;
    xp_total?: number | null;
    xp_today?: number | null;
  };
};

function fmt(dt?: string | null) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
}

function ymdLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function computeCompletionStreak(done: Assignment[], localDays?: Set<string>) {
  // Consecutive days ending today where user completed >=1 assignment (local date)
  const days = new Set<string>();
  for (const a of done) {
    if (!a.completed_at) continue;
    const t = new Date(a.completed_at);
    if (Number.isNaN(t.getTime())) continue;
    days.add(ymdLocal(t));
  }

  if (localDays && localDays.size) {
    for (const d of localDays) days.add(d);
  }

  let streak = 0;
  const cur = new Date();
  while (true) {
    const key = ymdLocal(cur);
    if (!days.has(key)) break;
    streak += 1;
    cur.setDate(cur.getDate() - 1);
  }

  return {
    streak,
    hasCompletedToday: days.has(ymdLocal(new Date())),
  };
}

const COMPLETED_DAYS_KEY = "gst:completedDays";
const ASSIGNMENTS_REFRESH_KEY = "gst:assignmentsRefresh";
const STREAK_STATE_KEY = "gst:streakState";

function ymdLocalYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return ymdLocal(d);
}

function bumpAssignmentsRefresh(reason: string = "") {
  if (typeof window === "undefined") return;
  try {
    const payload = JSON.stringify({ t: Date.now(), reason });
    window.localStorage.setItem(ASSIGNMENTS_REFRESH_KEY, payload);
    // BroadcastChannel is more reliable than storage events within the same tab.
    if ("BroadcastChannel" in window) {
      const ch = new BroadcastChannel("gst:assignments");
      ch.postMessage({ type: "refresh", reason, t: Date.now() });
      ch.close();
    }
  } catch {
    // ignore
  }
}

function readLocalCompletedDays(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(COMPLETED_DAYS_KEY);
    const arr = raw ? (JSON.parse(raw) as any) : [];
    if (!Array.isArray(arr)) return new Set();
    const out = new Set<string>();
    for (const v of arr) {
      if (typeof v === "string" && v.length === 10) out.add(v);
    }
    return out;
  } catch {
    return new Set();
  }
}

function writeLocalCompletedDays(days: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    // Keep it bounded (last ~45 days) so it never grows unbounded.
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 45);
    const cutoffKey = ymdLocal(cutoff);

    const arr = Array.from(days)
      .filter((d) => typeof d === "string" && d >= cutoffKey)
      .sort();

    window.localStorage.setItem(COMPLETED_DAYS_KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

function focusIdAttr(id: string) {
  return `assignment-${id}`;
}

function isWithinLastDays(dt?: string | null, days = 7) {
  if (!dt) return false;
  const t = new Date(dt).getTime();
  if (Number.isNaN(t)) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return t >= cutoff;
}

function daysUntil(dueAt?: string | null) {
  if (!dueAt) return 0;
  const due = new Date(dueAt).getTime();
  if (Number.isNaN(due)) return 0;
  const diffMs = due - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function dueLabel(a: Assignment) {
  const late = daysLate(a.due_at);
  if (late > 0) return { text: `Overdue (${late} day${late === 1 ? "" : "s"})`, tone: "overdue" as const };
  if (isDueToday(a.due_at)) return { text: "Due today", tone: "today" as const };
  if (a.due_at) {
    const inDays = daysUntil(a.due_at);
    return { text: inDays <= 1 ? "Due tomorrow" : `Due in ${inDays} days`, tone: "upcoming" as const };
  }
  return { text: "No due date", tone: "none" as const };
}

function pill(status: string) {
  const s = String(status || "").toLowerCase();
  if (s === "completed") {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-200">
        COMPLETED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs font-semibold text-neutral-200">
      ASSIGNED
    </span>
  );
}

function daysLate(dueAt?: string | null) {
  if (!dueAt) return 0;
  const due = new Date(dueAt).getTime();
  if (Number.isNaN(due)) return 0;
  const diffMs = Date.now() - due;
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function isOverdue(a: Assignment) {
  return daysLate(a.due_at) > 0;
}

function openCardClass(a: Assignment) {
  // Rep view: strong urgency for overdue (red wash + left bar)
  const base = "rounded-xl border bg-neutral-950 p-4 transition-colors duration-150";
  if (!isOverdue(a)) return `${base} border-neutral-800 hover:border-neutral-700`;
  return `${base} border-red-500/40 bg-red-500/10 border-l-4 border-l-red-500/70`;
}

function focusReason(a: Assignment | null) {
  if (!a) return "";
  const late = daysLate(a.due_at);
  if (late > 0) return `Overdue (${late} day${late === 1 ? "" : "s"})`;
  if (isDueToday(a.due_at)) return "Due today";
  if (a.due_at) return "Earliest due";
  return "Oldest assigned";
}

function focusMeta(a: Assignment | null) {
  if (!a) {
    return {
      dueText: "",
      dueClass: "text-neutral-400",
      bgClass: "bg-neutral-950",
      reasonText: "",
      accentClass: "border-neutral-800",
      labelClass: "text-neutral-300",
    };
  }

  const d = dueLabel(a);
  const overdue = d.tone === "overdue";
  const dueCls =
    d.tone === "overdue"
      ? "text-red-300"
      : d.tone === "today"
        ? "text-neutral-300"
        : d.tone === "upcoming"
          ? "text-neutral-400"
          : "text-neutral-500";

  return {
    dueText: d.text,
    dueClass: dueCls,
    bgClass: overdue ? "bg-red-500/10" : "bg-neutral-950",
    reasonText: `Reason: ${focusReason(a)}`,
    accentClass: overdue ? "border-red-500/40 border-l-red-500/70" : "border-neutral-800 border-l-neutral-800",
    labelClass: overdue ? "text-red-300" : "text-neutral-300",
  };
}

function nextBestAction(a: Assignment | null) {
  if (!a) return "";
  if (a.type === "sparring") return "Next best action: Run this drill now (5 mins)";
  if (a.type === "call_review") return "Next best action: Score one call (2 mins)";
  return "Next best action: Mark complete when done";
}

const SNOOZE_KEY = "gst:snoozedAssignments";

function readSnoozes(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SNOOZE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

function writeSnoozes(map: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SNOOZE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function isSnoozed(a: Assignment, snoozes: Record<string, number>) {
  if (a.status !== "assigned") return false;
  if (a.type !== "custom") return false;
  const until = snoozes[a.id];
  return typeof until === "number" && until > Date.now();
}

function isDueToday(dueAt?: string | null) {
  if (!dueAt) return false;
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return false;

  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isSameLocalDay(dt?: string | null) {
  if (!dt) return false;
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return false;

  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isSameLocalDayFrom(dt?: string | null, from?: Date) {
  if (!dt) return false;
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return false;

  const base = from ?? new Date();
  return (
    d.getFullYear() === base.getFullYear() &&
    d.getMonth() === base.getMonth() &&
    d.getDate() === base.getDate()
  );
}

function priorityBucket(a: Assignment) {
  // 0 = overdue, 1 = due today, 2 = due later, 3 = no due date
  const late = daysLate(a.due_at);
  if (late > 0) return 0;
  if (isDueToday(a.due_at)) return 1;
  if (a.due_at) return 2;
  return 3;
}


function compareAssignments(a: Assignment, b: Assignment) {
  const pa = priorityBucket(a);
  const pb = priorityBucket(b);
  if (pa !== pb) return pa - pb;

  // Within a bucket:
  // - if both have due dates, earliest due first
  // - otherwise oldest created first
  const aDue = a.due_at ? new Date(a.due_at).getTime() : NaN;
  const bDue = b.due_at ? new Date(b.due_at).getTime() : NaN;

  const aHasDue = Number.isFinite(aDue);
  const bHasDue = Number.isFinite(bDue);

  if (aHasDue && bHasDue && aDue !== bDue) return aDue - bDue;

  const aCreated = new Date(a.created_at).getTime();
  const bCreated = new Date(b.created_at).getTime();
  return aCreated - bCreated;
}

function sparringHref(assignmentId: string, personaId: string | null) {
  // Sparring route is /sparring/[personaId].
  // If the assignment is missing a personaId, we fall back to "default" so reps can still start.
  // The sparring page can then decide how to resolve/default the persona.
  const pid = personaId && personaId.trim().length > 0 ? personaId : "default";
  return `/sparring/${encodeURIComponent(pid)}?assignmentId=${encodeURIComponent(assignmentId)}`;
}

function callReviewHref(assignment: Assignment) {
  const qs = new URLSearchParams();
  qs.set("assignment", assignment.id);
  qs.set("assignmentId", assignment.id);

  if (assignment.target_id) {
    qs.set("callId", assignment.target_id);
    return `/calls/${encodeURIComponent(assignment.target_id)}?${qs.toString()}`;
  }

  return `/call-library?${qs.toString()}`;
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="h-3 w-24 rounded bg-neutral-800" />
      <div className="mt-3 h-5 w-2/3 rounded bg-neutral-800" />
      <div className="mt-2 h-3 w-1/2 rounded bg-neutral-900" />
      <div className="mt-4 h-9 w-28 rounded bg-neutral-800" />
    </div>
  );
}


async function proxyJson<T>(path: string, init?: RequestInit): Promise<T> {
  // `proxyFetch` is responsible for attaching browser auth to `/api/proxy/*`.
  // We call it with the proxy path directly so it can decide how to decorate.
  const url = path.startsWith("/api/proxy") ? path : `/api/proxy${path}`;

  const res = await proxyFetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore parse errors
  }

  if (!res.ok || !json?.ok) {
    const msg = json?.error || json?.message || `request_failed_${res.status}`;
    throw new Error(msg);
  }

  return json as T;
}

export default function AssignmentsClient() {
  const [rows, setRows] = useState<Assignment[]>([]);
  const [summary, setSummary] = useState<AssignmentsResponse["summary"] | null>(null);
  const [apiTodayFocus, setApiTodayFocus] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [confettiOn, setConfettiOn] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const lastCompletedIdRef = useRef<string | null>(null);
  const [snoozes, setSnoozes] = useState<Record<string, number>>({});
  const [localCompletedDays, setLocalCompletedDays] = useState<Set<string>>(new Set());
  const [xp, setXp] = useState<{ today: number; total: number } | null>(null);

  async function loadXp() {
    try {
      const r = await proxyJson<RepsMeResponse>("/v1/reps/me");
      const today = Number(r?.me?.xp_today ?? 0) || 0;
      const total = Number(r?.me?.xp_total ?? 0) || 0;
      setXp({ today, total });
    } catch {
      // XP is non-critical; avoid breaking the page if endpoint isn't mounted yet.
      setXp(null);
    }
  }

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const data = await proxyJson<AssignmentsResponse>("/v1/assignments");

      setRows(data.items ?? data.assignments ?? []);
      setSummary(data.summary ?? null);
      setApiTodayFocus(data.today_focus ?? data.summary?.today_focus ?? null);
    } catch (e: any) {
      setErr(e?.message || "failed_to_load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSnoozes(readSnoozes());
    setLocalCompletedDays(readLocalCompletedDays());
    void load();
    void loadXp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Instant refresh hook: when sparring/call pages complete an assignment they can
  // bump localStorage/BroadcastChannel, and this page will reload immediately.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== ASSIGNMENTS_REFRESH_KEY) return;
      // best-effort refresh
      void load();
      void loadXp();
      if (ev.newValue) {
        try {
          const parsed = JSON.parse(ev.newValue);
          const reason = typeof parsed?.reason === "string" ? parsed.reason : "";
          if (reason) showToast("success", reason);
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener("storage", onStorage);

    let ch: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      ch = new BroadcastChannel("gst:assignments");
      ch.onmessage = (msg) => {
        const data: any = (msg as any)?.data;
        if (data?.type !== "refresh") return;
        void load();
        void loadXp();
        const reason = typeof data?.reason === "string" ? data.reason : "";
        if (reason) showToast("success", reason);
      };
    }

    // Also refresh when the tab becomes visible again.
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void load();
        void loadXp();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVis);
      if (ch) ch.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = useMemo(
    () =>
      rows
        .filter((r) => r.status === "assigned")
        .filter((r) => !isSnoozed(r, snoozes))
        .slice()
        .sort(compareAssignments),
    [rows, snoozes]
  );
  // Snoozed count (active only)
  const activeSnoozedCount = useMemo(() => {
    const now = Date.now();
    return Object.values(snoozes).filter((until) => typeof until === "number" && until > now).length;
  }, [snoozes]);

  const hasActiveSnoozes = activeSnoozedCount > 0;
  const done = useMemo(
    () =>
      rows
        .filter((r) => r.status === "completed")
        .slice()
        .sort((a, b) => {
          const at = a.completed_at ? new Date(a.completed_at).getTime() : 0;
          const bt = b.completed_at ? new Date(b.completed_at).getTime() : 0;
          return bt - at;
        }),
    [rows]
  );
  const streak = useMemo(() => computeCompletionStreak(done, localCompletedDays), [done, localCompletedDays]);

  const [streakWarn, setStreakWarn] = useState<string | null>(null);
  const [streakResetMsg, setStreakResetMsg] = useState<string | null>(null);

  const momentum = useMemo(() => {
    const openCount = summary?.open_count ?? open.length;

    const overdueCount = summary?.overdue_count ?? open.filter((a) => isOverdue(a)).length;
    const dueTodayCount = summary?.due_today_count ?? open.filter((a) => isDueToday(a.due_at) && !isOverdue(a)).length;

    const completed7d = done.filter((a) => isWithinLastDays(a.completed_at, 7)).length;
    const completedTodayCount = done.filter((a) => isSameLocalDay(a.completed_at)).length;
    const assignedTodayCount = rows.filter((a) => isSameLocalDayFrom(a.created_at)).length;

    // simple completion rate over last 7 days: completed / (completed + still-open)
    const denom = completed7d + openCount;
    const completionRate7d = denom > 0 ? Math.round((completed7d / denom) * 100) : 0;

    return {
      openCount,
      overdueCount,
      dueTodayCount,
      completed7d,
      completedTodayCount,
      assignedTodayCount,
      completionRate7d,
    };
  }, [open, done, rows, summary]);

  // Day 23 Task 3: Streak enforcement effect (warn + reset)
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Warn if they have open work, have a streak, and haven't completed today.
    if (open.length > 0 && streak.streak > 0 && !streak.hasCompletedToday) {
      setStreakWarn("Finish one task to keep your streak alive");
    } else {
      setStreakWarn(null);
    }

    // Reset message if yesterday they had a streak (>0) and today it's 0.
    // We persist yesterday's streak to localStorage so we can detect a break.
    try {
      const todayKey = ymdLocal(new Date());
      const yesterdayKey = ymdLocalYesterday();

      const raw = window.localStorage.getItem(STREAK_STATE_KEY);
      const prev = raw ? JSON.parse(raw) : null;

      const prevYmd = typeof prev?.ymd === "string" ? prev.ymd : null;
      const prevStreak = typeof prev?.streak === "number" ? prev.streak : null;

      // Only show reset message once, on the first render of a new day.
      // Condition: yesterday had streak > 0, today streak is 0, and no completion today.
      const broke =
        prevYmd === yesterdayKey &&
        typeof prevStreak === "number" &&
        prevStreak > 0 &&
        streak.streak === 0 &&
        !streak.hasCompletedToday;

      if (broke) {
        setStreakResetMsg("Streak reset. Let’s restart strong today.");
      } else {
        setStreakResetMsg(null);
      }

      // Persist today's streak state (idempotent).
      window.localStorage.setItem(
        STREAK_STATE_KEY,
        JSON.stringify({ ymd: todayKey, streak: streak.streak, t: Date.now() })
      );
    } catch {
      // storage errors should never break UI
      setStreakResetMsg(null);
    }
  }, [open.length, streak.streak, streak.hasCompletedToday]);

  // Today’s Focus should match the same prioritisation we use for the Open list.
  // (overdue → due today → due later → no due date, then earliest due / oldest created)
  const todayFocus = apiTodayFocus ?? (open.length > 0 ? open[0] : null);
  const focus = useMemo(() => focusMeta(todayFocus), [todayFocus]);

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    if (type === "success") {
      setConfettiOn(true);
      window.setTimeout(() => setConfettiOn(false), 900);
    }
    window.setTimeout(() => setToast(null), 2600);
  }

  async function complete(id: string) {
    setErr(null);
    setSavingId(id);

    // optimistic UI: remove from Open immediately and add to Completed
    const prev = rows;
    const target = prev.find((x) => x.id === id);
    if (target) {
      const optimistic: Assignment = {
        ...target,
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by: target.completed_by ?? "rep",
      };
      setRows([...prev.filter((x) => x.id !== id), optimistic]);
    }

    try {
      await proxyJson<CompleteResponse>(
        `/v1/assignments/${encodeURIComponent(id)}/complete`,
        { method: "PATCH" }
      );

      showToast("success", "Completed ✓ (+XP soon)");
      bumpAssignmentsRefresh("Assignment completed ✓");
      lastCompletedIdRef.current = id;

      // Local streak/progress: record today immediately (even if server write is delayed)
      const todayKey = ymdLocal(new Date());
      setLocalCompletedDays((prevDays) => {
        const next = new Set(prevDays);
        next.add(todayKey);
        writeLocalCompletedDays(next);
        return next;
      });

      // sync with server truth
      await load();
      await loadXp();

      // Auto-focus next assignment (Today’s Focus after refresh)
      window.setTimeout(() => {
        const el = document.querySelector('[data-todays-focus="true"]') as HTMLElement | null;
        const nextId = el?.getAttribute("data-assignment-id") || null;

        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });

        if (nextId) {
          setHighlightId(nextId);
          window.setTimeout(() => setHighlightId(null), 2200);
        }
      }, 150);
    } catch (e: any) {
      // rollback if server fails
      setRows(prev);
      const msg = e?.message || "complete_failed";
      setErr(msg);
      showToast("error", msg);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">My Assignments</h1>
          <p className="text-sm text-neutral-400">Clear tasks, fast wins. Keep your streak alive.</p>

          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-300">
                Streak:{" "}
                <span className="font-semibold text-neutral-100">{streak.streak}</span>
                <span className="text-neutral-500">{" "}day{streak.streak === 1 ? "" : "s"}</span>
              </span>

              {streak.hasCompletedToday ? (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-200">
                  You’re back on track ✓
                </span>
              ) : (
                <span className="rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-400">
                  Complete 1 task today to keep your streak
                </span>
              )}

              <span className="rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-300">
                Today:{" "}
                <span className="font-semibold text-neutral-100">{momentum.completedTodayCount}</span>
                <span className="text-neutral-500"> / {momentum.openCount} open</span>
              </span>

              <span className="rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-300">
                XP today: <span className="font-semibold text-neutral-100">{xp?.today ?? 0}</span>
                <span className="text-neutral-500"> · total {xp?.total ?? 0}</span>
              </span>

              {hasActiveSnoozes && (
                <button
                  type="button"
                  onClick={() => {
                    writeSnoozes({});
                    setSnoozes({});
                    showToast("success", "Cleared snoozed tasks");
                  }}
                  className="rounded-full border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-300 hover:bg-neutral-900 transition-colors duration-150 active:scale-[0.98]"
                  title="Clear snoozed custom tasks"
                >
                  Snoozed: {activeSnoozedCount} (clear)
                </button>
              )}
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full border border-neutral-800 bg-black">
              <div
                className="h-full rounded-full bg-white/60"
                style={{
                  width:
                    momentum.openCount > 0
                      ? `${Math.min(100, Math.round((momentum.completedTodayCount / momentum.openCount) * 100))}%`
                      : momentum.completedTodayCount > 0
                        ? "100%"
                        : "0%",
                }}
              />
            </div>
            {!loading && (
              <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-neutral-300">Daily Win</div>
                    <div className="mt-1 text-xs text-neutral-500">Next best action (takes 2 mins)</div>

                    {streakWarn ? (
                      <div className="mt-2 rounded-lg border border-amber-900/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
                        {streakWarn}
                      </div>
                    ) : null}

                    {streakResetMsg ? (
                      <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200">
                        {streakResetMsg}
                      </div>
                    ) : null}

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-neutral-800 bg-black px-2 py-1 text-neutral-300">
                        ✅ Completed today: <span className="font-semibold text-neutral-100">{momentum.completedTodayCount}</span>
                        <span className="text-neutral-500"> / {momentum.assignedTodayCount}</span>
                      </span>

                      <span className="rounded-full border border-neutral-800 bg-black px-2 py-1 text-neutral-300">
                        🔥 Streak: <span className="font-semibold text-neutral-100">{streak.streak}</span>
                        <span className="text-neutral-500"> day{streak.streak === 1 ? "" : "s"}</span>
                      </span>

                      {todayFocus ? (
                        <span className="rounded-full border border-neutral-800 bg-black px-2 py-1 text-neutral-300">
                          🎯 <span className="font-semibold text-neutral-100">{todayFocus.title || "(Untitled)"}</span>
                          <span className="text-neutral-500"> · {focusReason(todayFocus)}</span>
                        </span>
                      ) : (
                        <span className="rounded-full border border-neutral-800 bg-black px-2 py-1 text-neutral-400">
                          🎯 All done — nothing open.
                        </span>
                      )}
                    </div>

                    {todayFocus ? (
                      <div className="mt-2 text-sm text-neutral-400">
                        <span className="text-neutral-200">{nextBestAction(todayFocus)}</span>
                      </div>
                    ) : null}
                  </div>

                  {todayFocus ? (
                    todayFocus.type === "sparring" ? (
                      <div className="flex flex-col items-end gap-2">
                        <Link
                          href={sparringHref(todayFocus.id, todayFocus.target_id)}
                          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200 transition-colors duration-150 active:scale-[0.98]"
                          title={todayFocus.target_id ? undefined : "No persona set on this assignment — using default."}
                        >
                          Start sparring
                        </Link>
                        {!todayFocus.target_id ? (
                          <div className="text-[11px] text-neutral-500">No persona · default</div>
                        ) : null}
                      </div>
                    ) : todayFocus.type === "call_review" ? (
                      <Link
                        href={callReviewHref(todayFocus)}
                        className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200 transition-colors duration-150 active:scale-[0.98]"
                        title={todayFocus.target_id ? undefined : "Rep can choose a call"}
                      >
                        {todayFocus.target_id ? "Start review" : "Pick a call"}
                      </Link>
                    ) : (
                      <button
                        onClick={() => complete(todayFocus.id)}
                        disabled={savingId === todayFocus.id}
                        className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200 transition-colors duration-150 active:scale-[0.98] disabled:opacity-50"
                      >
                        {savingId === todayFocus.id ? "Saving…" : "Mark complete"}
                      </button>
                    )
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-900 transition-colors duration-150 active:scale-[0.98]"
          >
            Refresh
          </button>
          <Link
            href="/crm/overview"
            className="text-sm underline text-neutral-400 hover:text-neutral-200"
          >
            ← Back
          </Link>
        </div>
      </div>

      {toast && (
        <div
          className={`relative mt-4 rounded-lg border p-3 text-sm ${toast.type === "success"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
            : "border-red-500/30 bg-red-500/10 text-red-200"
            }`}
        >
          {toast.msg}

          {confettiOn && toast.type === "success" ? (
            <div className="pointer-events-none absolute -top-2 right-2 select-none text-lg">
              ✨ 🎉 ✨
            </div>
          ) : null}
        </div>
      )}

      {todayFocus && !loading && (
        <div
          id={focusIdAttr(todayFocus.id)}
          data-todays-focus="true"
          data-assignment-id={todayFocus.id}
          className={`mt-6 rounded-xl border p-4 border-l-4 ${focus.bgClass} ${focus.accentClass}`}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className={`text-xs font-semibold uppercase tracking-wide ${focus.labelClass}`}>
                Today’s Focus
              </div>
              <div className="mt-1 text-lg font-semibold">{todayFocus.title || "(Untitled)"}</div>

              {focus.dueText ? (
                <div className="mt-1 text-xs">
                  <span className={focus.dueClass}>{focus.dueText}</span>
                </div>
              ) : null}

              {focus.reasonText ? (
                <div className="mt-1 text-xs text-neutral-400">
                  <span className="text-neutral-300">{focus.reasonText}</span>
                </div>
              ) : null}

              <div className="mt-1 text-xs text-neutral-400">
                <span className="text-neutral-300">{nextBestAction(todayFocus)}</span>
              </div>
            </div>

            {todayFocus.type === "sparring" ? (
              <div className="flex flex-col items-end gap-2">
                <Link
                  href={sparringHref(todayFocus.id, todayFocus.target_id)}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200 transition-colors duration-150 active:scale-[0.98]"
                  title={todayFocus.target_id ? undefined : "No persona set on this assignment — using default."}
                >
                  Start now
                </Link>
                {!todayFocus.target_id ? (
                  <div className="text-[11px] text-neutral-500">No persona set · using default</div>
                ) : null}
              </div>
            ) : todayFocus.type === "call_review" ? (
              <Link
                href={callReviewHref(todayFocus)}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200 transition-colors duration-150 active:scale-[0.98]"
                title={todayFocus.target_id ? undefined : "Rep can choose a call"}
              >
                {todayFocus.target_id ? "Review call" : "Pick a call"}
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => complete(todayFocus.id)}
                  disabled={savingId === todayFocus.id}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200 transition-colors duration-150 active:scale-[0.98] disabled:opacity-50"
                >
                  {savingId === todayFocus.id ? "Saving…" : "Mark complete"}
                </button>

                {todayFocus.type === "custom" ? (
                  <button
                    type="button"
                    onClick={() => {
                      const until = Date.now() + 24 * 60 * 60 * 1000;
                      const next = { ...readSnoozes(), [todayFocus.id]: until };
                      writeSnoozes(next);
                      setSnoozes(next);
                      showToast("success", "Snoozed for 24h");
                    }}
                    className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-900 transition-colors duration-150 active:scale-[0.98]"
                  >
                    Snooze 24h
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && (
        <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-300">
                Momentum
              </div>
              <div className="mt-1 text-sm text-neutral-400">
                Keep the loop tight: clear today’s focus, then chip away at the open list.
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs text-neutral-500">7d completion rate</div>
              <div className="text-lg font-semibold text-neutral-200">{momentum.completionRate7d}%</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-neutral-800 bg-black px-3 py-2">
              <div className="text-[11px] text-neutral-500">Open</div>
              <div className="text-sm font-semibold text-neutral-200">{momentum.openCount}</div>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-black px-3 py-2">
              <div className="text-[11px] text-neutral-500">Overdue</div>
              <div className={"text-sm font-semibold " + (momentum.overdueCount > 0 ? "text-red-200" : "text-neutral-200")}>
                {momentum.overdueCount}
              </div>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-black px-3 py-2">
              <div className="text-[11px] text-neutral-500">Due today</div>
              <div className={"text-sm font-semibold " + (momentum.dueTodayCount > 0 ? "text-neutral-100" : "text-neutral-200")}>
                {momentum.dueTodayCount}
              </div>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-black px-3 py-2">
              <div className="text-[11px] text-neutral-500">Completed</div>
              <div className="text-sm font-semibold text-neutral-200">
                {momentum.completedTodayCount > 0 ? (
                  <>
                    {momentum.completed7d} <span className="text-[11px] text-neutral-500">(7d)</span>
                    <span className="ml-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                      +{momentum.completedTodayCount} today
                    </span>
                  </>
                ) : (
                  <>
                    {momentum.completed7d} <span className="text-[11px] text-neutral-500">(7d)</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {err && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {err}
        </div>
      )}

      {loading ? (
        <div className="mt-6 space-y-3">
          <div className="text-sm text-neutral-400">Loading assignments…</div>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="mt-6 space-y-8 transition-opacity duration-200 opacity-100">
          <section>
            <h2 className="text-sm font-semibold text-neutral-200">Open</h2>
            <div className="mt-3 space-y-3">
              {open.length === 0 ? (
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
                  <div className="font-semibold">No assignments right now</div>
                  <div className="mt-1 text-neutral-500">When your manager assigns a drill or review, it’ll appear here.</div>
                  <div className="mt-3">
                    <Link
                      href="/sparring"
                      className="inline-flex rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-900 transition-colors duration-150 active:scale-[0.98]"
                    >
                      Go to Sparring
                    </Link>
                  </div>
                </div>
              ) : (
                open.map((a) => (
                  <div
                    key={a.id}
                    id={focusIdAttr(a.id)}
                    data-assignment-id={a.id}
                    className={openCardClass(a) + (highlightId === a.id ? " ring-2 ring-white/30" : "")}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm text-neutral-400">{a.type}</div>
                          {pill(a.status)}
                        </div>
                        <div className="mt-1 text-base font-semibold">{a.title || "(Untitled)"}</div>
                        <div className="mt-2 text-xs">
                          {(() => {
                            const d = dueLabel(a);
                            const cls =
                              d.tone === "overdue"
                                ? "text-red-300"
                                : d.tone === "today"
                                  ? "text-neutral-300"
                                  : "text-neutral-500";
                            return (
                              <>
                                <span className={cls}>{d.text}</span>
                                <span className="text-neutral-500"> · Created: {fmt(a.created_at)}</span>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {a.type === "sparring" ? (
                        <div className="flex flex-col items-end gap-1">
                          <Link
                            href={sparringHref(a.id, a.target_id)}
                            className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-neutral-200 transition-colors duration-150 active:scale-[0.98]"
                            title={a.target_id ? undefined : "No persona set on this assignment — using default."}
                          >
                            Start sparring
                          </Link>
                          {!a.target_id ? (
                            <div className="text-[11px] text-neutral-500">No persona · default</div>
                          ) : null}
                        </div>
                      ) : a.type === "call_review" ? (
                        <Link
                          href={callReviewHref(a)}
                          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-neutral-200 transition-colors duration-150 active:scale-[0.98]"
                          title={a.target_id ? undefined : "Rep can choose a call"}
                        >
                          {a.target_id ? "Open call review" : "Pick a call"}
                        </Link>
                      ) : a.type === "custom" ? (
                        <button
                          onClick={() => complete(a.id)}
                          disabled={savingId === a.id}
                          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-neutral-200 transition-colors duration-150 active:scale-[0.98] disabled:opacity-50"
                        >
                          {savingId === a.id ? "Saving…" : "Mark complete"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-neutral-200">Completed</h2>
            <div className="mt-3 space-y-3">
              {done.length === 0 ? (
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
                  <div className="font-semibold">No completions yet</div>
                  <div className="mt-1 text-neutral-500">Finish one task to start your streak and see progress here.</div>
                </div>
              ) : (
                done.map((a) => (
                  <div key={a.id} className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm text-neutral-500">{a.type}</div>
                          {pill(a.status)}
                        </div>
                        <div className="mt-1 text-base font-semibold text-neutral-200">
                          {a.title || "(Untitled)"}
                        </div>
                        <div className="mt-2 text-xs text-neutral-500">
                          Completed: {fmt(a.completed_at)} {a.completed_by ? `· by ${a.completed_by}` : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}