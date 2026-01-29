"use client";

import { useEffect, useState } from "react";

type Item = {
  id: string;
  title?: string | null;
  type?: string | null;
  status?: string | null;
  due_at?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
};

function fmtDate(x?: string | null) {
  if (!x) return null;
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return x;
  return d.toLocaleString();
}

export default function ContactAssignmentsClient({ contactId }: { contactId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/proxy/v1/crm/contacts/${encodeURIComponent(contactId)}/assignments`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setItems(json.items || []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load assignments");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  const open = items.filter((x) => String(x.status || "").toLowerCase() !== "completed");
  const done = items.filter((x) => String(x.status || "").toLowerCase() === "completed");

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-neutral-100">Assignments</div>
          <div className="mt-1 text-xs text-neutral-400">Open work tied to this contact.</div>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex h-8 items-center rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-900 active:scale-[0.98]"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="mt-4 text-sm text-neutral-400">Loading…</div>
      ) : err ? (
        <div className="mt-4 rounded-xl border border-red-900/40 bg-red-950/40 p-4 text-sm text-red-200">
          {err}
        </div>
      ) : !items.length ? (
        <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-sm font-semibold text-neutral-200">No assignments yet</div>
          <div className="mt-1 text-xs text-neutral-400">
            This is where reps/manager tasks will show once linked to a contact.
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-2 text-xs font-semibold text-neutral-400">OPEN ({open.length})</div>
            <div className="space-y-2">
              {open.map((a) => (
                <div key={a.id} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-neutral-200">
                        {a.title || "(Untitled)"}
                      </div>
                      <div className="mt-1 text-xs text-neutral-400">
                        {a.type || "task"} {a.due_at ? `• Due ${fmtDate(a.due_at)}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-xs text-neutral-500">{fmtDate(a.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold text-neutral-400">COMPLETED ({done.length})</div>
            <div className="space-y-2">
              {done.slice(0, 5).map((a) => (
                <div key={a.id} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 opacity-75">
                  <div className="text-sm font-semibold text-neutral-200">{a.title || "(Untitled)"}</div>
                  <div className="mt-1 text-xs text-neutral-400">
                    Completed {a.completed_at ? fmtDate(a.completed_at) : "—"}
                  </div>
                </div>
              ))}
              {done.length > 5 ? <div className="text-xs text-neutral-500">+ {done.length - 5} more</div> : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}