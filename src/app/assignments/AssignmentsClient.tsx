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

  const open = useMemo(() => rows.filter((r) => r.status === "assigned"), [rows]);
  const done = useMemo(() => rows.filter((r) => r.status === "completed"), [rows]);

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
                  <div key={a.id} className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm text-neutral-400">{a.type}</div>
                          {pill(a.status)}
                        </div>
                        <div className="mt-1 text-base font-semibold">{a.title || "(Untitled)"}</div>
                        <div className="mt-2 text-xs text-neutral-500">
                          Due: {fmt(a.due_at)} · Created: {fmt(a.created_at)}
                        </div>
                      </div>

                      {a.type === "sparring" ? (
                        <Link
                          href={`/sparring?assignment=${encodeURIComponent(a.id)}${
                            a.target_id ? `&persona=${encodeURIComponent(a.target_id)}` : ""
                          }`}
                          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-neutral-200"
                        >
                          Start sparring
                        </Link>
                      ) : a.type === "call_review" && a.target_id ? (
                        <Link
                          href={`/calls/${encodeURIComponent(a.target_id)}?assignment=${encodeURIComponent(a.id)}`}
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