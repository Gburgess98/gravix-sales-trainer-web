"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

type Item = {
  id: string;
  title?: string | null;
  type?: string | null;
  status?: string | null;
  due_at?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
};

export type ContactAssignmentsClientHandle = {
  reload: () => Promise<void>;
};

function fmtDate(x?: string | null) {
  if (!x) return null;
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return x;
  return d.toLocaleString();
}

const ContactAssignmentsClient = forwardRef<
  ContactAssignmentsClientHandle,
  { contactId: string }
>(function ContactAssignmentsClient({ contactId }, ref) {
  const [open, setOpen] = useState<Item[]>([]);
  const [completed, setCompleted] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/proxy/v1/crm/contacts/${encodeURIComponent(contactId)}/actions`,
        {
          cache: "no-store",
        }
      );
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setOpen(json.open || []);
      setCompleted(json.completed || []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load assignments");
      setOpen([]);
      setCompleted([]);
    } finally {
      setLoading(false);
    }
  }

  async function completeAction(actionId: string) {
    setErr(null);
    try {
      const res = await fetch(`/api/proxy/v1/crm/actions/${actionId}/complete`, {
        method: "POST",
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to complete action");
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      reload: load,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contactId]
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-neutral-100">Actions</div>
          <div className="mt-1 text-xs text-neutral-400">Next actions tied to this contact.</div>
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
      ) : !(open.length + completed.length) ? (
        <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-sm font-semibold text-neutral-200">No actions yet</div>
          <div className="mt-1 text-xs text-neutral-400">
            This is where follow-ups and next actions for this contact will appear.
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-2 text-xs font-semibold text-neutral-400">OPEN ACTIONS ({open.length})</div>
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
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-xs text-neutral-500">{fmtDate(a.created_at)}</div>
                      <button
                        type="button"
                        onClick={() => completeAction(a.id)}
                        disabled={loading}
                        className="inline-flex h-6 items-center rounded-md border border-neutral-700 bg-neutral-800 px-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Complete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold text-neutral-400">COMPLETED ACTIONS ({completed.length})</div>
            <div className="space-y-2">
              {completed.slice(0, 5).map((a) => (
                <div key={a.id} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 opacity-75">
                  <div className="text-sm font-semibold text-neutral-200">{a.title || "(Untitled)"}</div>
                  <div className="mt-1 text-xs text-neutral-400">
                    Completed {a.completed_at ? fmtDate(a.completed_at) : "—"}
                  </div>
                </div>
              ))}
              {completed.length > 5 ? (
                <div className="text-xs text-neutral-500">+ {completed.length - 5} more</div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

ContactAssignmentsClient.displayName = "ContactAssignmentsClient";

export default ContactAssignmentsClient;