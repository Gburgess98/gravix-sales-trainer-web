import Link from "next/link";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Nudge = {
  contact_id: string;
  name?: string | null;
  email?: string | null;
  company?: string | null;
  priority?: number | null;
  last_contacted_at?: string | null;
  created_at?: string | null;
  health?: {
    score?: number | null;
    band?: string | null;
    next_action?: unknown;
    reasons?: unknown;
    stats?: {
      open_actions?: number | null;
      overdue_actions?: number | null;
      last_contacted_days?: number | null;
    } | null;
  } | null;
  action_counts?: {
    open?: number | null;
    overdue?: number | null;
    completed?: number | null;
  } | null;
};

function fmtRel(iso?: string | null) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diffMs = Date.now() - t;
  const s = Math.max(0, Math.floor(diffMs / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return `${s}s ago`;
}

function pillForPriority(p?: number | null) {
  const v = Number(p ?? 0);
  if (v >= 300) return "border-red-800/60 bg-red-950/30 text-red-200";
  if (v >= 200) return "border-amber-800/60 bg-amber-950/25 text-amber-200";
  return "border-neutral-800 bg-neutral-950 text-neutral-300";
}

function pillForBand(band?: string | null) {
  const b = String(band ?? "").toLowerCase();
  if (b === "hot") return "border-emerald-800/60 bg-emerald-950/30 text-emerald-200";
  if (b === "warm") return "border-amber-800/60 bg-amber-950/25 text-amber-200";
  if (b === "watch") return "border-red-800/60 bg-red-950/25 text-red-200";
  return "border-neutral-800 bg-neutral-950 text-neutral-300";
}

export default async function ManagerNudgesPage() {
  const h = await headers();

  const base = process.env.INTERNAL_API_BASE_URL ?? "http://localhost:3000";
  const limit = 25;

  const res = await fetch(`${base}/api/proxy/v1/crm/manager/nudges?limit=${limit}`, {
    headers: {
      "x-user-id": h.get("x-user-id") ?? "",
      "x-org-id": h.get("x-org-id") ?? "",
    },
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);

  const nudges: Nudge[] = (json?.ok && Array.isArray(json?.nudges)) ? json.nudges : [];
  const err = !json?.ok ? (json?.error ?? "nudges_failed") : null;

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Manager Nudges</h1>
          <p className="text-sm text-neutral-400">
            Sorted by urgency. Click a row to jump into the contact.
          </p>
        </div>

        <Link href="/crm/overview" className="text-sm text-neutral-400 hover:text-neutral-200 underline">
          ← Back to CRM
        </Link>
      </div>

      {err ? (
        <div className="rounded-lg border border-red-900 bg-red-950/20 px-4 py-2 text-sm text-red-200">
          Failed to load nudges — {String(err)}
        </div>
      ) : null}

      <div className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-900">
          <div className="text-sm font-semibold text-neutral-200">Nudges</div>
          <div className="text-xs text-neutral-500">{nudges.length ? `${nudges.length} shown` : "—"}</div>
        </div>

        {nudges.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-xs text-neutral-500">
                <tr className="border-b border-neutral-900">
                  <th className="px-4 py-2 font-medium">Contact</th>
                  <th className="px-4 py-2 font-medium">Company</th>
                  <th className="px-4 py-2 font-medium">Priority</th>
                  <th className="px-4 py-2 font-medium">Health</th>
                  <th className="px-4 py-2 font-medium">Open/Overdue</th>
                  <th className="px-4 py-2 font-medium">Last touched</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {nudges.map((n) => {
                  const open = Number(n.action_counts?.open ?? n.health?.stats?.open_actions ?? 0);
                  const overdue = Number(n.action_counts?.overdue ?? n.health?.stats?.overdue_actions ?? 0);
                  const score = n.health?.score ?? null;
                  const band = n.health?.band ?? null;

                  return (
                    <tr key={n.contact_id} className="border-b border-neutral-900 hover:bg-neutral-900/20">
                      <td className="px-4 py-3">
                        <Link
                          href={`/crm/contacts/${encodeURIComponent(n.contact_id)}`}
                          className="text-neutral-200 hover:text-white underline underline-offset-4"
                        >
                          {String(n.name ?? "—")}
                        </Link>
                        <div className="mt-1 text-xs text-neutral-500">{n.email ? String(n.email) : "—"}</div>
                      </td>

                      <td className="px-4 py-3 text-neutral-200">{n.company ? String(n.company) : "—"}</td>

                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${pillForPriority(n.priority)}`}>
                          {Number(n.priority ?? 0)}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${pillForBand(band)}`}>
                          {String(band ?? "—").toUpperCase()}
                        </span>
                        <div className="mt-1 text-xs text-neutral-500">
                          Score: {score == null ? "—" : String(Number(score))}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-neutral-200">{open}</span>
                          <span className="text-neutral-600">/</span>
                          <span className={overdue > 0 ? "text-red-300 font-semibold" : "text-neutral-400"}>
                            {overdue}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-neutral-300">
                        {fmtRel(n.last_contacted_at ?? null)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-6 text-sm text-neutral-400">No nudges yet.</div>
        )}
      </div>
    </div>
  );
}
