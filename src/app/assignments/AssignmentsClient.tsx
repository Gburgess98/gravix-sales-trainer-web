"use client";

import { useEffect, useMemo, useState } from "react";
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
  assignments: Assignment[];
};

type CompleteResponse = {
  ok: true;
  assignment: Assignment;
};

function fmt(dt?: string | null) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
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
  if (!isOverdue(a)) return "rounded-xl border border-neutral-800 bg-neutral-950 p-4";
  return "rounded-xl border border-red-500/40 bg-red-500/10 p-4";
}

function focusReason(a: Assignment | null) {
  if (!a) return "";
  const late = daysLate(a.due_at);
  if (late > 0) return `Reason: Overdue (${late} day${late === 1 ? "" : "s"})`;
  return "Reason: Oldest assigned";
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

function getTodayFocus(assignments: Assignment[]) {
  const assigned = assignments.filter((a) => a.status === "assigned");
  if (assigned.length === 0) return null;

  const now = Date.now();

  const overdue = assigned
    .filter((a) => a.due_at && new Date(a.due_at).getTime() < now)
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());

  if (overdue.length > 0) return overdue[0];

  return assigned.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )[0];
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
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const data = await proxyJson<AssignmentsResponse>("/v1/assignments");
      setRows(data.assignments || []);
    } catch (e: any) {
      setErr(e?.message || "failed_to_load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = useMemo(
    () => rows.filter((r) => r.status === "assigned").slice().sort(compareAssignments),
    [rows]
  );
  const done = useMemo(() => rows.filter((r) => r.status === "completed"), [rows]);
  const todayFocus = useMemo(() => getTodayFocus(rows), [rows]);

  async function complete(id: string) {
    setErr(null);
    setSavingId(id);
    try {
      await proxyJson<CompleteResponse>(
        `/v1/assignments/${encodeURIComponent(id)}/complete`,
        { method: "PATCH" }
      );
      await load();
    } catch (e: any) {
      setErr(e?.message || "complete_failed");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">My Assignments</h1>
          <p className="text-sm text-neutral-400">Complete tasks set by your manager.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-900"
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

      {todayFocus && !loading && (
        <div
          className={
            todayFocus && isOverdue(todayFocus)
              ? "mt-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4"
              : "mt-6 rounded-xl border border-orange-500/30 bg-orange-500/10 p-4"
          }
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div
                className={
                  todayFocus && isOverdue(todayFocus)
                    ? "text-xs font-semibold uppercase tracking-wide text-red-300"
                    : "text-xs font-semibold uppercase tracking-wide text-orange-300"
                }
              >
               Today’s Focus
              </div>
              <div className="mt-1 text-lg font-semibold">{todayFocus.title || "(Untitled)"}</div>
              <div className="mt-1 text-xs">
                {(() => {
                  const d = dueLabel(todayFocus);
                  const cls =
                    d.tone === "overdue"
                      ? "text-red-300"
                      : d.tone === "today"
                        ? "text-orange-300"
                        : "text-neutral-400";
                  return <span className={cls}>{d.text}</span>;
                })()}
              </div>
              <div className="mt-1 text-xs text-neutral-400">
                <span className="text-neutral-300">{focusReason(todayFocus)}</span>
              </div>
            </div>

            {todayFocus.type === "sparring" ? (
              <Link
                href={`/sparring?assignment=${encodeURIComponent(
                  todayFocus.id
                )}&assignmentId=${encodeURIComponent(todayFocus.id)}${
                  todayFocus.target_id ? `&persona=${encodeURIComponent(todayFocus.target_id)}` : ""
                }`}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200"
              >
                Start now
              </Link>
            ) : todayFocus.type === "call_review" && todayFocus.target_id ? (
              <Link
                href={`/calls/${encodeURIComponent(
                  todayFocus.target_id
                )}?assignment=${encodeURIComponent(
                  todayFocus.id
                )}&assignmentId=${encodeURIComponent(todayFocus.id)}&callId=${encodeURIComponent(
                  todayFocus.target_id
                )}`}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200"
              >
                Review call
              </Link>
            ) : (
              <button
                onClick={() => complete(todayFocus.id)}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200"
              >
                Mark complete
              </button>
            )}
          </div>
        </div>
      )}

      {err && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {err}
        </div>
      )}

      {loading ? (
        <div className="mt-6 text-sm text-neutral-400">Loading…</div>
      ) : (
        <div className="mt-6 space-y-8">
          <section>
            <h2 className="text-sm font-semibold text-neutral-200">Open</h2>
            <div className="mt-3 space-y-3">
              {open.length === 0 ? (
                <div className="text-sm text-neutral-500">No open assignments.</div>
              ) : (
                open.map((a) => (
                  <div key={a.id} className={openCardClass(a)}>
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
                                  ? "text-orange-300"
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
                        <Link
                          href={`/sparring?assignment=${encodeURIComponent(a.id)}&assignmentId=${encodeURIComponent(a.id)}${
                            a.target_id ? `&persona=${encodeURIComponent(a.target_id)}` : ""
                          }`}
                          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-neutral-200"
                        >
                          Start sparring
                        </Link>
                      ) : a.type === "call_review" && a.target_id ? (
                        <Link
                          href={`/calls/${encodeURIComponent(a.target_id)}?assignment=${encodeURIComponent(a.id)}&assignmentId=${encodeURIComponent(a.id)}&callId=${encodeURIComponent(a.target_id)}`}
                          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-neutral-200"
                        >
                          Open call review
                        </Link>
                      ) : a.type === "custom" ? (
                        <button
                          onClick={() => complete(a.id)}
                          disabled={savingId === a.id}
                          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-neutral-200 disabled:opacity-50"
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
                <div className="text-sm text-neutral-500">Nothing completed yet.</div>
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