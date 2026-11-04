"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { proxyFetch } from "@/lib/api";
import { PageShell, PageHead, dsButton } from "@/components/ds";
import { MyAssignmentsPanel, type Feed, type View } from "@/components/rep/my-assignments-panel";
import type { DueFilter, MyAssignment } from "@/lib/my-assignments-model";

type Assignment = MyAssignment & { id: string };

type AssignmentsResponse = {
  ok: true;
  repId?: string;
  items?: Assignment[];
  assignments?: Assignment[];
};

type CompleteResponse = {
  ok: true;
  assignment: Assignment;
};

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

const DUE_VALUES: DueFilter[] = ["all", "overdue", "today", "upcoming", "none"];

export default function AssignmentsClient() {
  const [rows, setRows] = useState<Assignment[]>([]);
  const [feed, setFeed] = useState<Feed>(null);
  const [feedUnavailable, setFeedUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [snoozes, setSnoozes] = useState<Record<string, number>>({});
  const [view, setView] = useState<View>("todo");
  const [type, setType] = useState("all");
  const [due, setDue] = useState<DueFilter>("all");
  const rowsRef = useRef<Assignment[]>([]);
  rowsRef.current = rows;

  // The tab and filters live in the URL (replaceState: no extra history entries) so coming back from an
  // assignment, or reloading, keeps the same view. Read once on mount; written on change.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("view") === "completed") setView("done");
    const t = q.get("type");
    if (t) setType(t);
    const d = q.get("due") as DueFilter | null;
    if (d && DUE_VALUES.includes(d)) setDue(d);
  }, []);
  const syncUrl = (v: View, t: string, d: DueFilter) => {
    const q = new URLSearchParams();
    if (v === "done") q.set("view", "completed");
    if (t !== "all") q.set("type", t);
    if (d !== "all") q.set("due", d);
    const s = q.toString();
    window.history.replaceState(window.history.state, "", s ? `?${s}` : window.location.pathname);
  };

  const showNotice = useCallback((n: { type: "success" | "error"; text: string }) => {
    setNotice(n);
    window.setTimeout(() => setNotice(null), 4000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await proxyJson<AssignmentsResponse>("/v1/assignments");
      setRows(data.items ?? data.assignments ?? []);
      setErr(null);
      // Skill suggestions come from the rep's own daily feed; non-fatal if it is missing.
      if (data.repId) {
        try {
          const res = await proxyFetch(`/v1/reps/${encodeURIComponent(data.repId)}/daily-feed`, { cache: "no-store" });
          const d = res.ok ? await res.json().catch(() => null) : null;
          if (d && (d.coaching_summary || d.weakest_area || d.recommended_drill || d.recommended_replay)) setFeed(d);
          else setFeed(null);
          setFeedUnavailable(!res.ok);
        } catch {
          setFeed(null);
          setFeedUnavailable(true);
        }
      }
    } catch (e: any) {
      // Keep showing what we already have if a refresh fails; only a first load is a full error.
      if (rowsRef.current.length === 0) setErr(e?.message || "failed_to_load");
      else showNotice({ type: "error", text: "Couldn’t refresh your assignments. Showing what was loaded earlier." });
    } finally {
      setLoading(false);
    }
  }, [showNotice]);

  useEffect(() => {
    setSnoozes(readSnoozes());
    void load();
  }, [load]);

  // Instant refresh hook: when sparring/call pages complete an assignment they can
  // bump localStorage/BroadcastChannel, and this page will reload immediately.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== ASSIGNMENTS_REFRESH_KEY) return;
      void load();
      if (ev.newValue) {
        try {
          const parsed = JSON.parse(ev.newValue);
          const reason = typeof parsed?.reason === "string" ? parsed.reason : "";
          if (reason) showNotice({ type: "success", text: reason });
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
        const reason = typeof data?.reason === "string" ? data.reason : "";
        if (reason) showNotice({ type: "success", text: reason });
      };
    }

    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVis);
      if (ch) ch.close();
    };
  }, [load, showNotice]);

  const snoozedIds = useMemo(() => new Set(rows.filter((r) => isSnoozed(r, snoozes)).map((r) => r.id)), [rows, snoozes]);

  async function complete(id: string) {
    setSavingId(id);

    // optimistic UI: move to Completed immediately
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
      await proxyJson<CompleteResponse>(`/v1/assignments/${encodeURIComponent(id)}/complete`, { method: "PATCH" });

      showNotice({ type: "success", text: "Assignment completed" });
      bumpAssignmentsRefresh("Assignment completed");

      // Local streak/progress: record today immediately (even if server write is delayed)
      const todayKey = ymdLocal(new Date());
      const days = readLocalCompletedDays();
      days.add(todayKey);
      writeLocalCompletedDays(days);

      // sync with server truth
      await load();

      // Highlight the next assignment after refresh
      window.setTimeout(() => {
        const el = document.querySelector('ul[aria-label="Assignments to do"] li') as HTMLElement | null;
        const nextId = el?.getAttribute("data-assignment-id") || null;
        if (nextId) {
          setHighlightId(nextId);
          window.setTimeout(() => setHighlightId(null), 2200);
        }
      }, 150);
    } catch {
      // rollback if server fails
      setRows(prev);
      showNotice({ type: "error", text: "Couldn’t mark this assignment complete. Try again." });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <PageShell>
      <PageHead
        title="My Assignments"
        subtitle="Coaching work from your manager and your calls."
        actions={<button type="button" onClick={() => void load()} className={dsButton("quiet", "sm")}>Refresh</button>}
      />
      <MyAssignmentsPanel
        items={rows}
        loading={loading && rows.length === 0}
        error={err}
        onRetry={() => { setErr(null); void load(); }}
        onComplete={(id) => void complete(id)}
        savingId={savingId}
        snoozedIds={snoozedIds}
        onSnooze={(id) => {
          const next = { ...readSnoozes(), [id]: Date.now() + 24 * 60 * 60 * 1000 };
          writeSnoozes(next);
          setSnoozes(next);
          showNotice({ type: "success", text: "Snoozed for 24h" });
        }}
        onClearSnoozes={() => {
          writeSnoozes({});
          setSnoozes({});
          showNotice({ type: "success", text: "Cleared snoozed tasks" });
        }}
        feed={feed}
        feedUnavailable={feedUnavailable}
        notice={notice}
        view={view}
        onViewChange={(v) => { setView(v); syncUrl(v, type, due); }}
        type={type}
        onTypeChange={(t) => { setType(t); syncUrl(view, t, due); }}
        due={due}
        onDueChange={(d) => { setDue(d); syncUrl(view, type, d); }}
        highlightId={highlightId}
      />
    </PageShell>
  );
}
