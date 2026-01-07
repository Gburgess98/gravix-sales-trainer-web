
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as API from "@/lib/api";

type Rep = { id: string; name: string; tier: string; xp: number; created_at: string };

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

type ManagerSignals = {
  overdue: number;
  assigned_7d: number;
  completed_7d: number;
  completion_rate_7d: number;
  stale_reps_7d: Array<{ rep_id: string; name?: string | null; tier?: string | null }>;
};

function assignmentTypeLabel(t: Assignment["type"]) {
  if (t === "sparring") return "Drill (Practice)";
  if (t === "call_review") return "Call Review (Real call)";
  return "Task";
}

function assignmentTypeHelp(t: Assignment["type"]) {
  if (t === "sparring") return "Complete a sparring drill session.";
  if (t === "call_review") return "Score a real call to complete this.";
  return "Mark complete when done.";
}

function fmt(dt?: string | null) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
}

function isOverdue(a: Assignment) {
  if (a.status !== "assigned") return false;
  if (!a.due_at) return false;
  try {
    return new Date(a.due_at).getTime() < Date.now();
  } catch {
    return false;
  }
}

// ---- API wrapper (tolerant to different exports in src/lib/api.ts) ----
const apiGet = async <T,>(path: string): Promise<T> => {
  const anyApi: any = API as any;

  if (typeof anyApi.apiGet === "function") return anyApi.apiGet(path);
  if (typeof anyApi.apiPost === "function") {
    // noop — just here so TS doesn't tree-shake assumptions
  }

  if (anyApi.api && typeof anyApi.api.get === "function") return anyApi.api.get(path);
  if (typeof anyApi.apiFetch === "function") return anyApi.apiFetch(path);

  throw new Error("api_get_not_available");
};

const apiPost = async <T,>(path: string, body: any): Promise<T> => {
  const anyApi: any = API as any;

  if (typeof anyApi.apiPost === "function") return anyApi.apiPost(path, body);
  if (anyApi.api && typeof anyApi.api.post === "function") return anyApi.api.post(path, body);
  if (typeof anyApi.apiFetch === "function") {
    return anyApi.apiFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  throw new Error("api_post_not_available");
};

export default function AdminAssignmentsPage() {
  const [err, setErr] = useState<string | null>(null);
  const [reps, setReps] = useState<Rep[]>([]);
  const [rows, setRows] = useState<Assignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [assignErr, setAssignErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [signals, setSignals] = useState<ManagerSignals | null>(null);
  const [loadingSignals, setLoadingSignals] = useState(false);

  const [statusFilter, setStatusFilter] = useState<string>("all"); // all | assigned | completed | overdue

  const [repId, setRepId] = useState<string>("");
  const [type, setType] = useState<Assignment["type"]>("custom");
  const [title, setTitle] = useState<string>("Run 1 sparring drill today");
  const [dueAt, setDueAt] = useState<string>("");

  const [forbidden, setForbidden] = useState(false);

  async function load() {
    setErr(null);
    setForbidden(false);
    setLoading(true);
    try {
      // RBAC gate: /v1/admin/reps will 403 if not manager
      const r = await apiGet<{ ok: true; reps: Rep[] }>(`/v1/admin/reps`);
      setReps(r.reps || []);

      const firstSalesRep = (r.reps || []).find(x => x.tier === "SalesRep")?.id || (r.reps?.[0]?.id ?? "");
      setRepId(prev => prev || firstSalesRep);

      const mgr = await apiGet<{ ok: true; managerId: string; assignments: Assignment[] }>(`/v1/assignments/manager`);
      setRows(mgr.assignments || []);

      // Manager signals (lightweight summary)
      setLoadingSignals(true);
      try {
        const s = await apiGet<{ ok: true; signals: ManagerSignals }>(`/v1/assignments/manager/signals`);
        setSignals(s.signals || null);
      } finally {
        setLoadingSignals(false);
      }
    } catch (e: any) {
      const msg = e?.message || "failed_to_load";
      if (msg === "forbidden_not_manager") {
        setForbidden(true);
        return;
      }
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadAssignmentsForRep(repId: string) {
    if (!repId) return;
    setLoadingAssignments(true);
    setAssignErr(null);
    try {
      const r = await apiGet<{ ok: true; assignments: Assignment[] }>(
        `/v1/assignments/manager?rep_id=${encodeURIComponent(repId)}`
      );
      setRows(r.assignments || []);

      // Refresh signals as rep changes (still global, but keeps page feeling live)
      try {
        const s = await apiGet<{ ok: true; signals: ManagerSignals }>(`/v1/assignments/manager/signals`);
        setSignals(s.signals || null);
      } catch {
        // ignore
      }
    } catch (e: any) {
      setAssignErr(e?.message || "failed_to_load_assignments");
    } finally {
      setLoadingAssignments(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (repId) loadAssignmentsForRep(repId);
  }, [repId]);

  const repMap = useMemo(() => new Map(reps.map(r => [r.id, r])), [reps]);

  const filtered = useMemo(() => {
    let out = rows;

    if (repId) out = out.filter(a => a.rep_id === repId);

    if (statusFilter === "assigned") out = out.filter(a => a.status === "assigned");
    else if (statusFilter === "completed") out = out.filter(a => a.status === "completed");
    else if (statusFilter === "overdue") out = out.filter(a => isOverdue(a));

    return out;
  }, [rows, repId, statusFilter]);

  async function createAssignment() {
    setErr(null);
    setSaving(true);
    try {
      const body: any = { rep_id: repId, type, title };
      if (dueAt) body.due_at = new Date(dueAt).toISOString();
      await apiPost(`/v1/assignments`, body);
      await load();
      if (repId) await loadAssignmentsForRep(repId);
    } catch (e: any) {
      setErr(e?.message || "create_failed");
    } finally {
      setSaving(false);
    }
  }

  if (forbidden) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <h1 className="text-xl font-semibold">Admin · Assignments</h1>
        <p className="mt-2 text-sm text-neutral-400">
          You don’t have access to this page.
        </p>

        <div className="mt-6">
          <Link
            href="/crm/overview"
            className="text-sm underline text-neutral-400 hover:text-neutral-200"
          >
            ← Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Admin · Assignments</h1>
          <p className="text-sm text-neutral-400">Create and track rep assignments.</p>
        </div>
        <Link href="/crm/overview" className="text-sm underline text-neutral-400 hover:text-neutral-200">
          ← Back
        </Link>
      </div>

      {err && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {err}
        </div>
      )}

      {loading ? (
        <div className="mt-6 text-sm text-neutral-400">Loading…</div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 lg:col-span-1">
            <h2 className="text-sm font-semibold text-neutral-200">Create assignment</h2>

            <div className="mt-4 space-y-3">
              <label className="block text-xs text-neutral-400">
                Rep
                <select
                  className="mt-1 w-full rounded-lg border border-neutral-800 bg-black p-2 text-sm"
                  value={repId}
                  onChange={e => setRepId(e.target.value)}
                >
                  {reps.filter(r => r.tier === "SalesRep" || r.id === repId).map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name || r.id} · {r.tier}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs text-neutral-400">
                Type
                <select
                  className="mt-1 w-full rounded-lg border border-neutral-800 bg-black p-2 text-sm"
                  value={type}
                  onChange={e => setType(e.target.value as any)}
                >
                  <option value="custom">Task (manual)</option>
                  <option value="sparring">Drill (sparring practice)</option>
                  <option value="call_review">Call Review (score a real call)</option>
                </select>
                <div className="mt-1 text-[11px] text-neutral-500">
                  {assignmentTypeHelp(type)}
                </div>
              </label>

              <label className="block text-xs text-neutral-400">
                Title
                <input
                  className="mt-1 w-full rounded-lg border border-neutral-800 bg-black p-2 text-sm"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </label>

              <label className="block text-xs text-neutral-400">
                Due (optional)
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-lg border border-neutral-800 bg-black p-2 text-sm"
                  value={dueAt}
                  onChange={e => setDueAt(e.target.value)}
                />
              </label>

              <button
                onClick={createAssignment}
                disabled={!repId || saving}
                className="w-full rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-neutral-200 disabled:opacity-50"
              >
                {saving ? "Creating…" : "Create assignment"}
              </button>
              <div className="text-xs text-neutral-500">
                Tip: <span className="text-neutral-300">Drill</span> auto-completes after sparring.
                <span className="text-neutral-300"> Call Review</span> auto-completes after scoring a call.
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-neutral-200">Assigned</h2>

              <div className="flex items-center gap-3">
                <label className="text-xs text-neutral-500">
                  Status{" "}
                  <select
                    className="ml-2 rounded-md border border-neutral-800 bg-black px-2 py-1 text-xs"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">all</option>
                    <option value="assigned">assigned</option>
                    <option value="overdue">overdue</option>
                    <option value="completed">completed</option>
                  </select>
                </label>

                <div className="text-xs text-neutral-500">
                  Showing: {repId ? (repMap.get(repId)?.name || repId) : "All reps"}
                </div>
              </div>
            </div>

            {/* Signals: manager reality bar */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-neutral-800 bg-black px-3 py-2">
                <div className="text-[11px] text-neutral-500">Overdue</div>
                <div className="text-sm font-semibold">
                  {loadingSignals ? "…" : (signals?.overdue ?? 0)}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-black px-3 py-2">
                <div className="text-[11px] text-neutral-500">Assigned (7d)</div>
                <div className="text-sm font-semibold">
                  {loadingSignals ? "…" : (signals?.assigned_7d ?? 0)}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-black px-3 py-2">
                <div className="text-[11px] text-neutral-500">Completed (7d)</div>
                <div className="text-sm font-semibold">
                  {loadingSignals ? "…" : (signals?.completed_7d ?? 0)}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-black px-3 py-2">
                <div className="text-[11px] text-neutral-500">Completion rate</div>
                <div className="text-sm font-semibold">
                  {loadingSignals ? "…" : `${Math.round(((signals?.completion_rate_7d ?? 0) as number) * 100)}%`}
                </div>
              </div>
            </div>

            {signals?.stale_reps_7d?.length ? (
              <div className="mt-2 text-xs text-neutral-500">
                Stale reps (7d):{" "}
                <span className="text-neutral-300">
                  {signals.stale_reps_7d.map(r => r.name || r.rep_id).join(", ")}
                </span>
              </div>
            ) : null}

            {loadingAssignments && (
              <div className="text-sm text-neutral-500">Loading assignments…</div>
            )}

            {assignErr && (
              <div className="text-sm text-red-400">{assignErr}</div>
            )}

            <div className="mt-4 space-y-3">
              {filtered.length === 0 ? (
                <div className="text-sm text-neutral-500">No assignments yet.</div>
              ) : (
                filtered.map(a => (
                  <div
                    key={a.id}
                    className={`rounded-xl border bg-black p-4 ${
                      isOverdue(a) ? "border-amber-500/40" : "border-neutral-800"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs text-neutral-500">
                          {assignmentTypeLabel(a.type)} · {a.status}
                          {isOverdue(a) ? " · overdue" : ""} · Rep: {repMap.get(a.rep_id)?.name || a.rep_id}
                        </div>
                        <div className="mt-1 text-[11px] text-neutral-500">
                          {assignmentTypeHelp(a.type)}
                        </div>
                        <div className="mt-1 text-base font-semibold">{a.title || "(Untitled)"}</div>
                        <div className="mt-2 text-xs text-neutral-500">
                          Due: {fmt(a.due_at)} · Created: {fmt(a.created_at)}
                          {a.completed_at ? ` · Completed: ${fmt(a.completed_at)}` : ""}
                          {a.completed_by ? ` · by ${a.completed_by}` : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}