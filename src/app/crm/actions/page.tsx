import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";

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

type Props = {
  actions: ActionRow[];
  repId?: string;
  status?: string;
  loadError?: string | null;
};

export default function ActionsClient({ actions, repId: initialRepId, status: initialStatus, loadError }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const repId = (searchParams?.get("repId") ?? "").trim();
  const activeStatus = (searchParams?.get("status") ?? "open").trim();

  function hrefForStatus(nextStatus: string) {
    const qs = new URLSearchParams(searchParams?.toString() ?? "");
    if (repId) qs.set("repId", repId);
    if (nextStatus) qs.set("status", nextStatus);
    else qs.delete("status");
    return `/crm/actions?${qs.toString()}`;
  }

  function goStatus(nextStatus: string) {
    router.push(hrefForStatus(nextStatus));
    router.refresh();
  }

  // Safe client-side filtering
  let filtered = [...actions];

  if (repId) {
    filtered = filtered.filter((a) => String(a.rep_id ?? "").trim() === repId);
  }

  if (activeStatus === "open") {
    filtered = filtered.filter((a) => !a.completed_at);
  } else if (activeStatus === "completed") {
    filtered = filtered.filter((a) => !!a.completed_at);
  } else if (activeStatus === "overdue") {
    filtered = filtered.filter((a) => safeBool(a.is_overdue) && !a.completed_at);
  } else if (activeStatus === "all") {
    // no filter
  } else {
    // default to open if unknown status
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

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Actions</h1>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => goStatus("open")}
          className={`rounded border px-3 py-1 text-sm ${
            activeStatus === "open" || activeStatus === "" ? "border-neutral-600 text-neutral-100" : "border-neutral-800 text-neutral-300 hover:border-neutral-700"
          }`}
        >
          Open
        </button>

        <button
          type="button"
          onClick={() => goStatus("overdue")}
          className={`rounded border px-3 py-1 text-sm ${activeStatus === "overdue" ? "border-neutral-600 text-neutral-100" : "border-neutral-800 text-neutral-300 hover:border-neutral-700"}`}
        >
          Overdue
        </button>

        <button
          type="button"
          onClick={() => goStatus("completed")}
          className={`rounded border px-3 py-1 text-sm ${activeStatus === "completed" ? "border-neutral-600 text-neutral-100" : "border-neutral-800 text-neutral-300 hover:border-neutral-700"}`}
        >
          Completed
        </button>

        <button
          type="button"
          onClick={() => goStatus("all")}
          className={`rounded border px-3 py-1 text-sm ${activeStatus === "all" ? "border-neutral-600 text-neutral-100" : "border-neutral-800 text-neutral-300 hover:border-neutral-700"}`}
        >
          All
        </button>

        <div className="ml-auto text-xs text-neutral-500">
          repId: <span className="text-neutral-300">{repId || "—"}</span>
        </div>
      </div>

      {loadError ? (
        <div className="text-sm text-red-500">Failed to load actions: {loadError}</div>
      ) : !repId ? (
        <div className="text-sm text-neutral-400">
          Select a rep to view actions. Go back to the Manager page and click a rep name.
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-neutral-400">No actions found.</div>
      ) : (
        <table className="w-full text-sm border-collapse border border-neutral-700">
          <thead>
            <tr className="border-b border-neutral-700">
              <th className="py-2 px-3 text-left font-medium">Status</th>
              <th className="py-2 px-3 text-left font-medium">Action</th>
              <th className="py-2 px-3 text-left font-medium">Rep</th>
              <th className="py-2 px-3 text-left font-medium">Contact</th>
              <th className="py-2 px-3 text-left font-medium">Due</th>
              <th className="py-2 px-3 text-left font-medium">Completed</th>
              <th className="py-2 px-3 text-left font-medium">Complete</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const id = pickId(a);
              const overdue = safeBool(a.is_overdue) && !a.completed_at;
              const open = !a.completed_at;

              return (
                <tr key={id} className="border-b border-neutral-800">
                  <td className="py-2 px-3">
                    {overdue ? (
                      <span className="text-amber-300">Overdue</span>
                    ) : open ? (
                      <span className="text-neutral-200">Open</span>
                    ) : (
                      <span className="text-neutral-500">Done</span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    {safeStr(a.title ?? a.label)}
                    <div className="text-xs text-neutral-500">id: {safeStr(id)}</div>
                  </td>
                  <td className="py-2 px-3">{safeStr(a.rep_name ?? a.rep_id)}</td>
                  <td className="py-2 px-3">
                    {a.contact_id ? (
                      <Link
                        className="text-neutral-200 underline decoration-neutral-700 hover:decoration-neutral-500"
                        href={`/crm/contacts/${encodeURIComponent(String(a.contact_id))}`}
                      >
                        {safeStr(a.contact_id)}
                      </Link>
                    ) : (
                      safeStr(a.contact_id)
                    )}
                  </td>
                  <td className="py-2 px-3">{fmtDt(a.due_at)}</td>
                  <td className="py-2 px-3">{fmtDt(a.completed_at)}</td>
                  <td className="py-2 px-3">
                    {open ? (
                      <button
                        type="button"
                        className="rounded border border-green-600 bg-green-700 px-2 py-1 text-xs text-green-100 hover:bg-green-600"
                        onClick={async () => {
                          try {
                            const res = await fetch(`/v1/crm/actions/${encodeURIComponent(id)}/complete`, {
                              method: "POST",
                            });
                            if (!res.ok) throw new Error(`Failed to complete action: ${res.status}`);
                            router.refresh();
                          } catch (err) {
                            alert(String(err));
                          }
                        }}
                      >
                        Complete
                      </button>
                    ) : (
                      <span className="text-neutral-500 text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}