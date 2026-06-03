'use client';

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";

type ActionRow = {
  id?: string;
  action_id?: string;
  contact_id?: string;
  rep_id?: string;
  rep_name?: string;
  title?: string;
  label?: string;
  due_at?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  is_overdue?: boolean;
};

function pickId(a: ActionRow) {
  return String(a.id ?? a.action_id ?? "").trim();
}

function safeStr(v: any) {
  const s = String(v ?? "").trim();
  return s || "—";
}

function fmtDt(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

function safeBool(v: any) {
  return v === true;
}

export default function ActionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const repId = (searchParams?.get("repId") ?? "").trim();
  const activeStatus = (searchParams?.get("status") ?? "open").trim();

  const [actions, setActions] = useState<ActionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [completingIds, setCompletingIds] = useState<Record<string, boolean>>({});

  const loadActions = useCallback(async () => {
    if (!repId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const qs = new URLSearchParams({ limit: "200" });
      qs.set("repId", repId);
      const res = await fetch(`/api/proxy/v1/crm/actions?${qs.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) throw new Error(data?.error || "Failed to load actions");
      setActions(Array.isArray(data.actions) ? data.actions : Array.isArray(data.items) ? data.items : []);
    } catch (e: any) {
      setLoadError(e?.message || "Failed to load actions");
    } finally {
      setLoading(false);
    }
  }, [repId]);

  useEffect(() => {
    loadActions();
  }, [loadActions]);

  function hrefForStatus(nextStatus: string) {
    const qs = new URLSearchParams(searchParams?.toString() ?? "");
    if (repId) qs.set("repId", repId);
    if (nextStatus) qs.set("status", nextStatus);
    else qs.delete("status");
    return `/crm/actions?${qs.toString()}`;
  }

  function goStatus(nextStatus: string) {
    router.push(hrefForStatus(nextStatus));
  }

  async function completeAction(id: string) {
    setCompletingIds((m) => ({ ...m, [id]: true }));
    try {
      const res = await fetch(`/api/proxy/v1/crm/actions/${encodeURIComponent(id)}/complete`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Failed to complete action: ${res.status}`);
      setActions((prev) => prev.map((a) => pickId(a) === id ? { ...a, completed_at: new Date().toISOString() } : a));
    } catch (err) {
      toast.error(String(err));
    } finally {
      setCompletingIds((m) => { const n = { ...m }; delete n[id]; return n; });
    }
  }

  // Client-side filtering
  let filtered = [...actions];

  if (activeStatus === "open") {
    filtered = filtered.filter((a) => !a.completed_at);
  } else if (activeStatus === "completed") {
    filtered = filtered.filter((a) => !!a.completed_at);
  } else if (activeStatus === "overdue") {
    filtered = filtered.filter((a) => safeBool(a.is_overdue) && !a.completed_at);
  } else if (activeStatus === "all") {
    // no filter
  } else {
    filtered = filtered.filter((a) => !a.completed_at);
  }

  // Sort: overdue first, then due date asc
  filtered.sort((a, b) => {
    const ao = safeBool(a.is_overdue) && !a.completed_at ? 1 : 0;
    const bo = safeBool(b.is_overdue) && !b.completed_at ? 1 : 0;
    if (ao !== bo) return bo - ao;
    const ad = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
    const bd = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;
    return ad - bd;
  });

  const STATUS_TABS = [
    { value: "open", label: "Open" },
    { value: "overdue", label: "Overdue" },
    { value: "completed", label: "Completed" },
    { value: "all", label: "All" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">CRM</div>
          <h1 className="mt-0.5 text-xl font-semibold text-white">Actions</h1>
          {repId && (
            <p className="mt-0.5 text-sm text-neutral-400">
              Rep: <span className="text-neutral-300">{repId}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {repId && (
            <Link
              href={`/crm/reps/${encodeURIComponent(repId)}`}
              className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 transition-colors"
            >
              ← Rep Profile
            </Link>
          )}
          <button
            type="button"
            onClick={loadActions}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => goStatus(t.value)}
            className={`rounded-xl border px-3 py-1.5 text-xs transition-all ${
              activeStatus === t.value
                ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
                : "border-neutral-800 bg-black/30 text-neutral-400 hover:border-neutral-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      {!repId ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-5 py-8 text-center text-sm text-neutral-400">
          Select a rep to view their actions.
        </div>
      ) : loading ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-5 py-4 text-sm text-neutral-400">
          Loading actions…
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
          {loadError}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-5 py-4 text-sm text-neutral-400">
          No {activeStatus !== "all" ? activeStatus + " " : ""}actions found.
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="py-3 px-4 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Status</th>
                <th className="py-3 px-4 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Action</th>
                <th className="py-3 px-4 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Rep</th>
                <th className="py-3 px-4 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Contact</th>
                <th className="py-3 px-4 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Due</th>
                <th className="py-3 px-4 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Completed</th>
                <th className="py-3 px-4 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {filtered.map((a) => {
                const id = pickId(a);
                const overdue = safeBool(a.is_overdue) && !a.completed_at;
                const open = !a.completed_at;

                return (
                  <tr key={id} className="hover:bg-neutral-900/40 transition-colors">
                    <td className="py-3 px-4">
                      {overdue ? (
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">Overdue</span>
                      ) : open ? (
                        <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300">Open</span>
                      ) : (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">Done</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-white">{safeStr(a.title ?? a.label)}</div>
                      <div className="text-[10px] text-neutral-600">id: {safeStr(id)}</div>
                    </td>
                    <td className="py-3 px-4 text-sm text-neutral-300">{safeStr(a.rep_name ?? a.rep_id)}</td>
                    <td className="py-3 px-4 text-sm">
                      {a.contact_id ? (
                        <Link
                          href={`/crm/contacts/${encodeURIComponent(String(a.contact_id))}`}
                          className="text-cyan-400 hover:underline"
                        >
                          {safeStr(a.contact_id)}
                        </Link>
                      ) : (
                        <span className="text-neutral-500">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-neutral-400">{fmtDt(a.due_at)}</td>
                    <td className="py-3 px-4 text-sm text-neutral-400">{fmtDt(a.completed_at)}</td>
                    <td className="py-3 px-4">
                      {open && (
                        <button
                          type="button"
                          disabled={Boolean(completingIds[id])}
                          onClick={() => completeAction(id)}
                          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-60 transition-colors"
                        >
                          {completingIds[id] ? "Completing…" : "Complete"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
