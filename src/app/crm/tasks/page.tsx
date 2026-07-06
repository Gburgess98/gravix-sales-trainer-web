"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { proxyFetch } from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";

type TaskItem = {
  id: string;
  type?: string | null;
  title?: string | null;
  status?: string | null;
  due_at?: string | null;
  opportunity_id?: string | null;
  contact_id?: string | null;
  account_id?: string | null;
  created_at?: string | null;
};

type StatusFilter = "open" | "done" | "all";

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function formatShortDate(iso?: string | null): string {
  const s = safeStr(iso).trim();
  if (!s) return "—";
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return s;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return s;
  }
}

function getDueBucket(task: TaskItem): "overdue" | "today" | "upcoming" | "none" {
  const raw = safeStr(task.due_at).trim();
  if (!raw) return "none";

  const due = new Date(raw);
  if (!Number.isFinite(due.getTime())) return "none";

  const now = new Date();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  if (dueDay < today) return "overdue";
  if (dueDay === today) return "today";
  return "upcoming";
}

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function getPipelineHref(task: TaskItem): string {
  const oppId = safeStr(task.opportunity_id).trim();
  if (!oppId) return "/crm/pipeline";
  return `/crm/pipeline?opportunityId=${encodeURIComponent(oppId)}`;
}

export default function CrmTasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("open");
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string>("");

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("type", "task");
      if (status !== "all") qs.set("status", status);

      const r = await proxyFetch(`/v1/crm/activities?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);

      if (!r.ok || !j?.ok) {
        throw new Error(safeStr(j?.error || `tasks_fetch_failed_${r.status}`));
      }

      setTasks(Array.isArray(j?.items) ? (j.items as TaskItem[]) : []);
    } catch (e: any) {
      setError(safeStr(e?.message || "tasks_fetch_failed"));
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    const channel = supabase
      .channel("crm-activities")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "crm_activities",
        },
        () => {
          void loadTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadTasks]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(t);
  }, [toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) => {
      const hay = [
        safeStr(t.title),
        safeStr(t.status),
        safeStr(t.opportunity_id),
        safeStr(t.contact_id),
        safeStr(t.account_id),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [tasks, query]);

  const summaryCounts = useMemo(() => {
    let overdue = 0;
    let today = 0;
    let upcoming = 0;
    let done = 0;

    for (const t of tasks) {
      const st = safeStr(t.status).trim().toLowerCase();
      if (st === "done") {
        done += 1;
        continue;
      }
      const bucket = getDueBucket(t);
      if (bucket === "overdue") overdue += 1;
      if (bucket === "today") today += 1;
      if (bucket === "upcoming") upcoming += 1;
    }

    return {
      total: tasks.length,
      overdue,
      today,
      upcoming,
      done,
    };
  }, [tasks]);

  const filteredCounts = useMemo(() => {
    let overdue = 0;
    let today = 0;
    let upcoming = 0;
    let done = 0;

    for (const t of filtered) {
      const st = safeStr(t.status).trim().toLowerCase();
      if (st === "done") {
        done += 1;
        continue;
      }
      const bucket = getDueBucket(t);
      if (bucket === "overdue") overdue += 1;
      if (bucket === "today") today += 1;
      if (bucket === "upcoming") upcoming += 1;
    }

    return {
      total: filtered.length,
      overdue,
      today,
      upcoming,
      done,
    };
  }, [filtered]);

  async function completeTask(id: string) {
    const taskId = safeStr(id).trim();
    if (!taskId) return;
    setCompletingId(taskId);
    try {
      const r = await proxyFetch(`/v1/crm/activities/${encodeURIComponent(taskId)}/complete`, {
        method: "POST",
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        throw new Error(safeStr(j?.error || `task_complete_failed_${r.status}`));
      }
      setToast("Task completed ✓");
      await loadTasks();
    } catch (e: any) {
      setToast(`Complete failed: ${safeStr(e?.message || "task_complete_failed")}`);
    } finally {
      setCompletingId("");
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-neutral-500">CRM</div>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">Tasks</h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-400">
              Follow-ups and next actions across your pipeline. Keep reps focused on what needs doing next.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/crm/pipeline"
              className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
            >
              ← Pipeline
            </Link>
            <button
              type="button"
              className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
              onClick={() => void loadTasks()}
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-neutral-900 bg-neutral-950 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Total</div>
            <div className="mt-2 text-2xl font-semibold">{summaryCounts.total}</div>
          </div>
          <div className="rounded-2xl border border-neutral-900 bg-neutral-950 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Overdue</div>
            <div className="mt-2 text-2xl font-semibold">{summaryCounts.overdue}</div>
          </div>
          <div className="rounded-2xl border border-neutral-900 bg-neutral-950 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Due today</div>
            <div className="mt-2 text-2xl font-semibold">{summaryCounts.today}</div>
          </div>
          <div className="rounded-2xl border border-neutral-900 bg-neutral-950 p-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Upcoming</div>
            <div className="mt-2 text-2xl font-semibold">{summaryCounts.upcoming}</div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-neutral-900 bg-neutral-950 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
            <span className="rounded-full border border-neutral-800 px-2 py-1">Filtered: {filteredCounts.total}</span>
            <span className="rounded-full border border-neutral-800 px-2 py-1">Overdue: {filteredCounts.overdue}</span>
            <span className="rounded-full border border-neutral-800 px-2 py-1">Today: {filteredCounts.today}</span>
            <span className="rounded-full border border-neutral-800 px-2 py-1">Upcoming: {filteredCounts.upcoming}</span>
            <span className="rounded-full border border-neutral-800 px-2 py-1">Done: {filteredCounts.done}</span>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-neutral-900 bg-neutral-950">
          <div className="border-b border-neutral-900 px-4 py-3 text-sm font-medium text-neutral-200">
            Task list
          </div>

          {loading ? (
            <div className="px-4 py-6 text-sm text-neutral-400">Loading tasks…</div>
          ) : error ? (
            <div className="px-4 py-6 text-sm text-red-400">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-6 text-sm text-neutral-500">No tasks found.</div>
          ) : (
            <div className="divide-y divide-neutral-900">
              {filtered.map((task) => {
                const id = safeStr(task.id);
                const title = safeStr(task.title || "Untitled task");
                const statusText = safeStr(task.status || "open").toLowerCase();
                const done = statusText === "done";
                const bucket = getDueBucket(task);

                return (
                  <div key={id} className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className={clsx("text-sm font-medium", done ? "text-neutral-500 line-through" : "text-neutral-100")}>
                        {title}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                        <span className="rounded-full border border-neutral-800 px-2 py-0.5 text-neutral-400">
                          Due: {formatShortDate(task.due_at)}
                        </span>
                        <span
                          className={clsx(
                            "rounded-full border px-2 py-0.5",
                            bucket === "overdue"
                              ? "border-red-900/80 bg-red-950/30 text-red-300"
                              : bucket === "today"
                              ? "border-amber-900/80 bg-amber-950/30 text-amber-300"
                              : bucket === "upcoming"
                              ? "border-sky-900/80 bg-sky-950/20 text-sky-300"
                              : "border-neutral-800 text-neutral-400"
                          )}
                        >
                          {bucket}
                        </span>
                        <span
                          className={clsx(
                            "rounded-full border px-2 py-0.5",
                            done
                              ? "border-emerald-900/80 bg-emerald-950/30 text-emerald-300"
                              : "border-neutral-800 text-neutral-300"
                          )}
                        >
                          {statusText}
                        </span>
                        {task.opportunity_id ? (
                          <Link
                            href={getPipelineHref(task)}
                            className="rounded-full border border-neutral-800 px-2 py-0.5 text-neutral-300 hover:bg-neutral-900"
                            title="Open linked opportunity in pipeline"
                          >
                            Opp: {safeStr(task.opportunity_id).slice(0, 8)} →
                          </Link>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!done ? (
                        <button
                          type="button"
                          className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-900 disabled:opacity-60"
                          disabled={completingId === id}
                          onClick={() => void completeTask(id)}
                        >
                          {completingId === id ? "Completing…" : "Complete"}
                        </button>
                      ) : (
                        <span className="text-xs text-neutral-500">Done</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {toast ? (
        <div className="fixed bottom-4 right-4 rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-100 shadow-xl">
          {toast}
        </div>
      ) : null}
    </div>
  );
}