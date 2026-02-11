// src/app/crm/actions/page.tsx
import Link from "next/link";

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

export default async function CrmActionsPage({
  searchParams,
}: {
  searchParams?: { repId?: string; status?: string };
}) {
  const repId = String(searchParams?.repId ?? "").trim() || null;
  const status = String(searchParams?.status ?? "").trim() || null;

  // Reuse the same aggregated endpoint the Overview uses.
  // Keep no-store so Manager clicks always show current state.
  let actions: ActionRow[] = [];
  let loadError: string | null = null;

  try {
    const resp = await fetch(
      "/api/proxy/v1/crm/actions?scope=rep&window=all&limit=500",
      { cache: "no-store" }
    );
    const json = await resp.json().catch(() => ({} as any));

    // expected: { ok: true, actions: [...] }
    const arr = Array.isArray((json as any)?.actions) ? (json as any).actions : [];
    actions = arr as ActionRow[];
  } catch (e: any) {
    loadError = String(e?.message ?? "actions_load_failed");
  }

  // Client-side filters (safe even if API doesn’t support filtering yet)
  if (repId) {
    actions = actions.filter((a) => String(a.rep_id ?? "").trim() === repId);
  }

  if (status === "open") {
    actions = actions.filter((a) => !a.completed_at);
  } else if (status === "overdue") {
    actions = actions.filter((a) => (a.is_overdue === true) && !a.completed_at);
  }

  // Sort: overdue first, then due date asc (best-effort)
  actions.sort((a, b) => {
    const ao = a.is_overdue === true ? 1 : 0;
    const bo = b.is_overdue === true ? 1 : 0;
    if (ao !== bo) return bo - ao;

    const ad = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
    const bd = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;
    return ad - bd;
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold text-neutral-100">CRM Actions</div>
          <div className="text-sm text-neutral-400">
            Filtered view for rep follow-ups.
          </div>

          <div className="mt-2 text-xs text-neutral-500">
            repId: <span className="text-neutral-300">{repId ?? "—"}</span>{" "}
            | status: <span className="text-neutral-300">{status ?? "—"}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            className="rounded border border-neutral-800 px-3 py-1 text-sm text-neutral-200 hover:border-neutral-700"
            href="/crm/manager"
          >
            Back to Manager
          </Link>
          <Link
            className="rounded border border-neutral-800 px-3 py-1 text-sm text-neutral-200 hover:border-neutral-700"
            href="/crm/overview"
          >
            Back to CRM Overview
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-950/30 p-4">
        {loadError ? (
          <div className="text-sm text-red-300">
            Failed to load actions: {loadError}
          </div>
        ) : actions.length === 0 ? (
          <div className="text-sm text-neutral-400">No actions found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-neutral-400">
                <tr className="border-b border-neutral-800">
                  <th className="py-2 pr-3 text-left font-medium">Status</th>
                  <th className="py-2 pr-3 text-left font-medium">Action</th>
                  <th className="py-2 pr-3 text-left font-medium">Rep</th>
                  <th className="py-2 pr-3 text-left font-medium">Contact</th>
                  <th className="py-2 pr-3 text-left font-medium">Due</th>
                  <th className="py-2 pr-3 text-left font-medium">Completed</th>
                </tr>
              </thead>
              <tbody className="text-neutral-200">
                {actions.map((a) => {
                  const id = pickId(a);
                  const overdue = a.is_overdue === true && !a.completed_at;
                  const open = !a.completed_at;

                  return (
                    <tr key={id || Math.random()} className="border-b border-neutral-900">
                      <td className="py-2 pr-3">
                        {overdue ? (
                          <span className="text-amber-300">Overdue</span>
                        ) : open ? (
                          <span className="text-neutral-200">Open</span>
                        ) : (
                          <span className="text-neutral-500">Done</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {safeStr(a.title ?? a.label)}
                        <div className="text-xs text-neutral-500">id: {safeStr(id)}</div>
                      </td>
                      <td className="py-2 pr-3">{safeStr(a.rep_name ?? a.rep_id)}</td>
                      <td className="py-2 pr-3">{safeStr(a.contact_id)}</td>
                      <td className="py-2 pr-3">{fmtDt(a.due_at)}</td>
                      <td className="py-2 pr-3">{fmtDt(a.completed_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}