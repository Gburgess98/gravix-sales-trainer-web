"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { proxyFetch } from "@/lib/api";

type Rep = {
  id: string;
  name: string;
  tier?: string;
};

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

type Signals = {
  overdue: number;
  assigned_7d: number;
  completed_7d: number;
  completion_rate_7d: number;
  stale_reps_7d: { rep_id: string; name: string; tier?: string }[];
};

function fmt(dt?: string | null) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
}

function isOverdue(a: Assignment) {
  if (!a.due_at) return false;
  const due = new Date(a.due_at).getTime();
  const now = Date.now();
  return a.status !== "completed" && Number.isFinite(due) && due < now;
}

function statusPill(status: string, overdue: boolean) {
  const s = String(status || "").toLowerCase();
  if (s === "completed") {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-200">
        COMPLETED
      </span>
    );
  }
  if (overdue) {
    return (
      <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-200">
        OVERDUE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs font-semibold text-neutral-200">
      ASSIGNED
    </span>
  );
}

async function getJson<T>(path: string): Promise<T> {
  const res = await proxyFetch(path, { cache: "no-store" });
  const txt = await res.text();
  let json: any = null;
  try {
    json = txt ? JSON.parse(txt) : null;
  } catch {
    // ignore
  }
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `request_failed_${res.status}`);
  }
  return json as T;
}

export default function AdminAssignmentsClient() {
  const [reps, setReps] = useState<Rep[]>([]);
  const [rowsByRep, setRowsByRep] = useState<Record<string, Assignment[]>>({});
  const [signals, setSignals] = useState<Signals | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    setLoading(true);

    try {
      // 1) Prove manager access (keeps rep users out)
      // If rep hits this page, proxy should return forbidden_not_manager
      await getJson<{ ok: true; config: any }>("/api/proxy/v1/admin/config");

      // 2) Reps list (for names)
      const repsData = await getJson<{ ok: true; reps: Rep[] }>("/api/proxy/v1/admin/reps");
      const repList = repsData.reps || [];
      setReps(repList);

      // 3) Signals (lightweight, high value)
      const sig = await getJson<{ ok: true; signals: Signals }>("/api/proxy/v1/assignments/manager/signals");
      setSignals(sig.signals);

      // 4) Assignments per rep (manager-scoped)
      // Endpoint you already have: GET /v1/assignments/manager?rep_id=...
      const entries = await Promise.all(
        repList.map(async (r) => {
          try {
            const a = await getJson<{ ok: true; assignments: Assignment[] }>(
              `/api/proxy/v1/assignments/manager?rep_id=${encodeURIComponent(r.id)}`
            );
            return [r.id, a.assignments || []] as const;
          } catch (e) {
            // If an individual rep fetch fails, don’t nuke the whole page.
            return [r.id, []] as const;
          }
        })
      );

      setRowsByRep(Object.fromEntries(entries));
    } catch (e: any) {
      setErr(e?.message || "failed_to_load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const flat = useMemo(() => {
    const all: Assignment[] = [];
    for (const repId of Object.keys(rowsByRep)) {
      all.push(...(rowsByRep[repId] || []));
    }
    return all;
  }, [rowsByRep]);

  const totals = useMemo(() => {
    const assigned = flat.filter((a) => String(a.status).toLowerCase() === "assigned").length;
    const completed = flat.filter((a) => String(a.status).toLowerCase() === "completed").length;
    const overdue = flat.filter((a) => isOverdue(a)).length;
    return { assigned, completed, overdue };
  }, [flat]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Admin · Assignments</h1>
          <p className="text-sm text-neutral-400">What you’ve assigned, what’s outstanding, what’s overdue.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-900"
          >
            Refresh
          </button>

          <Link href="/crm/overview" className="text-sm underline text-neutral-400 hover:text-neutral-200">
            ← Back
          </Link>
        </div>
      </div>

      {err && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {err === "forbidden_not_manager" ? "You don’t have manager access for this page." : err}
        </div>
      )}

      {loading ? (
        <div className="mt-6 text-sm text-neutral-400">Loading…</div>
      ) : (
        <>
          {/* Signals */}
          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs text-neutral-500">Assigned (visible)</div>
              <div className="mt-1 text-2xl font-semibold">{totals.assigned}</div>
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs text-neutral-500">Completed (visible)</div>
              <div className="mt-1 text-2xl font-semibold">{totals.completed}</div>
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs text-neutral-500">Overdue (visible)</div>
              <div className="mt-1 text-2xl font-semibold">{totals.overdue}</div>
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs text-neutral-500">Completion rate (7d)</div>
              <div className="mt-1 text-2xl font-semibold">
                {signals ? `${Math.round((signals.completion_rate_7d || 0) * 100)}%` : "—"}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {signals ? `${signals.completed_7d}/${signals.assigned_7d} completed` : ""}
              </div>
            </div>
          </div>

          {signals?.stale_reps_7d?.length ? (
            <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-sm font-semibold">Stale reps (7d)</div>
              <div className="mt-2 text-sm text-neutral-300">
                {signals.stale_reps_7d.map((r) => r.name).join(", ")}
              </div>
            </div>
          ) : null}

          {/* Rep panels */}
          <div className="mt-8 space-y-6">
            {reps.map((rep) => {
              const list = rowsByRep[rep.id] || [];
              if (!list.length) return null;

              const open = list.filter((a) => String(a.status).toLowerCase() === "assigned");
              const done = list.filter((a) => String(a.status).toLowerCase() === "completed");

              return (
                <section key={rep.id} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-base font-semibold">{rep.name || rep.id}</div>
                      <div className="mt-1 text-xs text-neutral-500">
                        Open: {open.length} · Completed: {done.length}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs text-neutral-500">
                        <tr>
                          <th className="py-2 pr-3">Title</th>
                          <th className="py-2 pr-3">Type</th>
                          <th className="py-2 pr-3">Status</th>
                          <th className="py-2 pr-3">Due</th>
                          <th className="py-2 pr-3">Created</th>
                        </tr>
                      </thead>

                      <tbody className="align-top">
                        {list.map((a) => {
                          const overdue = isOverdue(a);
                          return (
                            <tr
                              key={a.id}
                              className={[
                                "border-t border-neutral-900",
                                overdue ? "bg-red-500/5" : "",
                              ].join(" ")}
                            >
                              <td className="py-2 pr-3">
                                <div className="font-semibold text-neutral-200">{a.title || "(Untitled)"}</div>
                              </td>
                              <td className="py-2 pr-3 text-neutral-300">{a.type}</td>
                              <td className="py-2 pr-3">{statusPill(a.status, overdue)}</td>
                              <td className="py-2 pr-3 text-neutral-300">{fmt(a.due_at)}</td>
                              <td className="py-2 pr-3 text-neutral-500">{fmt(a.created_at)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}

            {/* If nothing has been assigned at all */}
            {reps.every((r) => (rowsByRep[r.id] || []).length === 0) ? (
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-6 text-sm text-neutral-400">
                No assignments found for your reps.
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}