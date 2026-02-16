"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

type CrmAction = {
  id: string;
  contact_id?: string | null;
  type?: string | null;
  title?: string | null;
  due_at?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  status?: string | null;
  importance?: string | null;
  meta?: any;
  is_overdue?: boolean;
};

function fmt(ts?: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function isSameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isDueToday(ts?: string | null) {
  if (!ts) return false;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return false;
  return isSameLocalDay(d, new Date());
}

export default function ActionsClient(props: {
  initialActions: CrmAction[];
  repId?: string | null;
  status?: string | null;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [actions, setActions] = React.useState<CrmAction[]>(props.initialActions ?? []);
  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = React.useState(false);

  const repId = props.repId ?? sp.get("repId") ?? "";
  const status = (props.status ?? sp.get("status") ?? "open").toLowerCase();

  function setStatus(next: string) {
    const qs = new URLSearchParams(sp.toString());

    // preserve repId (ensure it's present if we have it)
    if (repId) qs.set("repId", repId);

    // update status
    const norm = String(next || "").toLowerCase();
    if (!norm || norm === "all") qs.delete("status");
    else qs.set("status", norm);

    const query = qs.toString();
    router.push(query ? `/crm/actions?${query}` : "/crm/actions");
  }

  async function completeAction(actionId: string) {
    setErr(null);
    setLoadingId(actionId);
    try {
      const res = await fetch(`/api/proxy/v1/crm/actions/${encodeURIComponent(actionId)}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || "complete_failed");
      }

      // optimistic: remove from list if we’re on open/overdue
      // If we're filtering to open/overdue, remove it immediately.
      // If we're viewing completed/all, refresh so it can re-appear with completed_at.
      setActions((prev) => {
        const next = prev.filter((a) => a.id !== actionId);
        if (status === "open" || status === "overdue") return next;
        return prev;
      });

      if (status !== "open" && status !== "overdue") {
        router.refresh();
      }
    } catch (e: any) {
      setErr(String(e?.message ?? "complete_failed"));
    } finally {
      setLoadingId(null);
    }
  }

  async function bulkCompleteVisible() {
    if (bulkLoading) return;
    setErr(null);
    setBulkLoading(true);

    try {
      const ids = (actions ?? [])
        .filter((a) => !a.completed_at && String(a.status ?? "open").toLowerCase() !== "completed")
        .map((a) => a.id)
        .filter(Boolean);

      if (ids.length === 0) return;

      // execute sequentially to keep it simple and avoid spiking the API
      for (const id of ids) {
        const res = await fetch(`/api/proxy/v1/crm/actions/${encodeURIComponent(id)}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.ok === false) {
          throw new Error(json?.error || "bulk_complete_failed");
        }
      }

      // Optimistic: remove completed items from the visible list for open/overdue.
      if (status === "open" || status === "overdue") {
        setActions((prev) => prev.filter((a) => !ids.includes(a.id)));
      } else {
        router.refresh();
      }
    } catch (e: any) {
      setErr(String(e?.message ?? "bulk_complete_failed"));
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-xs text-neutral-500 mr-2">Filter:</div>

        {([
          ["open", "Open"],
          ["overdue", "Overdue"],
          ["completed", "Completed"],
          ["all", "All"],
        ] as const).map(([key, label]) => {
          const active = key === "all" ? !sp.get("status") || sp.get("status") === "all" : status === key;

          return (
            <button
              key={key}
              onClick={() => setStatus(key)}
              className={[
                "rounded border px-3 py-1 text-sm",
                active
                  ? "border-neutral-600 bg-neutral-900 text-neutral-100"
                  : "border-neutral-800 text-neutral-300 hover:border-neutral-700",
              ].join(" ")}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold text-neutral-100">Actions</div>
          <div className="text-xs text-neutral-400">
            repId: <span className="text-neutral-200">{repId || "—"}</span> · status:{" "}
            <span className="text-neutral-200">{status}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(status === "open" || status === "overdue") && actions.length > 0 ? (
            <button
              className="px-3 py-1.5 rounded border border-neutral-800 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-50"
              disabled={bulkLoading}
              onClick={() => bulkCompleteVisible()}
              title="Marks all currently visible actions as completed"
            >
              {bulkLoading ? "Completing…" : "Complete visible"}
            </button>
          ) : null}

          <button
            className="px-3 py-1.5 rounded border border-neutral-800 text-sm text-neutral-200 hover:bg-neutral-900"
            onClick={() => router.refresh()}
          >
            Refresh
          </button>
        </div>
      </div>

      {err ? (
        <div className="rounded border border-red-900 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      {actions.length === 0 ? (
        <div className="rounded border border-neutral-800 bg-neutral-950/40 px-3 py-3 text-sm text-neutral-300">
          No actions found.
        </div>
      ) : (
        <div className="rounded border border-neutral-800 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs text-neutral-400 bg-neutral-950/50">
            <div className="col-span-5">Title</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-2">Due</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1 text-right">Action</div>
          </div>

          {actions.map((a) => {
            const isLoading = loadingId === a.id;
            const showComplete =
              !a.completed_at && String(a.status ?? "open").toLowerCase() !== "completed";
            const overdue = Boolean(a.is_overdue);
            const dueToday = !a.completed_at && !overdue && isDueToday(a.due_at);

            return (
              <div
                key={a.id}
                className={[
                  "grid grid-cols-12 gap-2 px-3 py-2 border-t items-center",
                  overdue && !a.completed_at
                    ? "border-red-900 bg-red-950/20"
                    : "border-neutral-900",
                ].join(" ")}
              >
                <div className="col-span-5">
                  <div className="text-sm text-neutral-100">{a.title ?? "—"}</div>
                  <div className="text-xs text-neutral-500">
                    id: <span className="text-neutral-400">{a.id}</span>
                    {a.contact_id ? (
                      <>
                        {" "}
                        · contact: <span className="text-neutral-400">{a.contact_id}</span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="col-span-2 text-sm text-neutral-200">{a.type ?? "—"}</div>

                <div className="col-span-2 text-sm text-neutral-200">
                  <div>{fmt(a.due_at)}</div>
                  {overdue ? <div className="text-xs text-red-300">Overdue</div> : null}
                  {dueToday ? <div className="text-xs text-emerald-300">Due today</div> : null}
                </div>

                <div className="col-span-2 text-sm text-neutral-200">{a.status ?? "—"}</div>

                <div className="col-span-1 flex justify-end">
                  {showComplete ? (
                    <button
                      disabled={isLoading}
                      className="px-2.5 py-1 rounded border border-neutral-800 text-xs text-neutral-200 hover:bg-neutral-900 disabled:opacity-50"
                      onClick={() => completeAction(a.id)}
                    >
                      {isLoading ? "..." : "Complete"}
                    </button>
                  ) : (
                    <span className="text-xs text-neutral-500">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}