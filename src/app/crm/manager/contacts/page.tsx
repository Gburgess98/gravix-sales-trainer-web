// src/app/crm/manager/contacts/page.tsx
import Link from "next/link";
import ManagerContactsClient from "./ManagerContactsClient";

type Health = {
  score?: number;
  band?: string;
  reasons?: string[];
  stats?: {
    open_actions?: number;
    overdue_actions?: number;
    last_contacted_days?: number;
    has_notes?: boolean;
    has_recent_call?: boolean;
  };
};

type ActionCounts = {
  open?: number;
  overdue?: number;
  completed?: number;
};

type ContactRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  company?: string | null;
  created_at?: string | null;
  last_contacted_at?: string | null;
  health?: Health | null;
  action_counts?: ActionCounts | null;
};

function safeStr(v: any): string {
  return typeof v === "string" ? v : "";
}

function safeObj<T extends object>(v: any): T | null {
  return v && typeof v === "object" ? (v as T) : null;
}

function absUrl(path: string) {
  const base = process.env.INTERNAL_API_BASE_URL ?? "http://localhost:3000";
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

export default async function ManagerContactsPage({
  searchParams,
}: {
  searchParams?: { [k: string]: string | string[] | undefined };
}) {
  const filterRaw = searchParams?.filter;
  const filter = Array.isArray(filterRaw) ? filterRaw[0] : filterRaw;
  const limitRaw = searchParams?.limit;
  const limitStr = Array.isArray(limitRaw) ? limitRaw[0] : limitRaw;
  const limit = Math.min(200, Math.max(1, Number(limitStr ?? 50) || 50));

  const qs = new URLSearchParams();
  if (filter) qs.set("filter", String(filter));
  qs.set("limit", String(limit));

  // Server fetch via /api/proxy so headers/auth are handled consistently.
  const url = absUrl(`/api/proxy/v1/crm/manager/contacts?${qs.toString()}`);

  let items: ContactRow[] = [];
  let ok = false;
  let error: string | null = null;

  try {
    const r = await fetch(url, { cache: "no-store" });
    const j = (await r.json().catch(() => null)) as any;
    ok = Boolean(j?.ok);

    if (!ok) {
      error = safeStr(j?.error) || "manager_contacts_failed";
    } else {
      const list = Array.isArray(j?.items) ? j.items : [];
      items = list
        .map((x: any) => {
          const id = safeStr(x?.id).trim();
          if (!id) return null;

          const health = safeObj<Health>(x?.health);
          const action_counts = safeObj<ActionCounts>(x?.action_counts);

          const row: ContactRow = {
            id,
            first_name: x?.first_name ?? null,
            last_name: x?.last_name ?? null,
            email: x?.email ?? null,
            company: x?.company ?? null,
            created_at: x?.created_at ?? null,
            last_contacted_at: x?.last_contacted_at ?? null,
            health: health ?? null,
            action_counts: action_counts ?? null,
          };
          return row;
        })
        .filter(Boolean) as ContactRow[];
    }
  } catch (e: any) {
    ok = false;
    error = String(e?.message ?? "manager_contacts_failed");
  }

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-neutral-100">Manager · Contacts</div>
          <div className="text-sm text-neutral-400">
            Triage your pipeline: overdue actions + contact health.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/crm/manager"
            className="px-3 py-2 rounded border border-neutral-800 text-neutral-200 hover:bg-neutral-900"
          >
            Back
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <ManagerContactsClient
          initialFilter={filter === "at-risk" ? "at-risk" : "all"}
          initialLimit={limit}
          initialOk={ok}
          initialError={error}
          initialItems={items}
        />
      </div>
    </div>
  );
}