"use client";

import { useEffect, useState } from "react";

type Importance = "normal" | "important" | "critical";

type Note = {
  id: string;
  body: string;
  created_at: string | null;
  author_name?: string | null;
  author_id?: string | null;
  importance?: Importance | null;
};

export default function RepNotesClient({
  contactId,
  authorName,
}: {
  contactId: string;
  authorName?: string;
}) {
  const [items, setItems] = useState<Note[]>([]);
  const [body, setBody] = useState("");
  const [importance, setImportance] = useState<Importance>("normal");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadNotes() {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/proxy/v1/crm/contacts/${encodeURIComponent(contactId)}/notes`,
        { method: "GET", headers: { "cache-control": "no-cache" } }
      );
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Failed to load notes (${res.status})`);
      }

      // ✅ API returns { notes: [...] }
      const raw = Array.isArray(json.notes) ? (json.notes as Note[]) : [];
      const sorted = [...raw].sort((a, b) => {
        const at = a.created_at ? new Date(a.created_at).getTime() : -Infinity;
        const bt = b.created_at ? new Date(b.created_at).getTime() : -Infinity;
        return bt - at;
      });
      setItems(sorted);
    } catch (e: any) {
      setErr(e?.message || "Failed to load notes");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function addNote() {
    const trimmed = body.trim();
    if (!trimmed) return;

    setErr(null);
    setSaving(true);

    try {
      const res = await fetch(
        `/api/proxy/v1/crm/contacts/${encodeURIComponent(contactId)}/notes`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            body: trimmed,
            importance,
          }),
        }
      );

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Failed to save note (${res.status})`);
      }

      setBody("");
      setImportance("normal");
      // ✅ always refresh list after save
      await loadNotes();
    } catch (e: any) {
      setErr(e?.message || "Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  return (
    <div className="mt-3 space-y-3">
      {err ? (
        <div className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          <div className="font-semibold">Notes error</div>
          <div className="opacity-90">{err}</div>
        </div>
      ) : null}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add notes about previous conversations, objections, or personal context..."
        className="w-full min-h-[110px] rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-700"
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="text-xs font-semibold text-neutral-400">Importance</div>
        <div className="flex items-center gap-1">
          {(["normal", "important", "critical"] as const).map((k) => {
            const active = importance === k;
            const base =
              "inline-flex h-8 items-center rounded-lg border px-2.5 text-xs font-semibold transition-all duration-150";
            const on =
              k === "normal"
                ? "border-neutral-700 bg-neutral-900 text-neutral-200"
                : k === "important"
                ? "border-amber-700 bg-amber-950/40 text-amber-200"
                : "border-red-700 bg-red-950/40 text-red-200";
            const off = "border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900";
            return (
              <button
                key={k}
                type="button"
                onClick={() => setImportance(k)}
                className={[base, active ? on : off].join(" ")}
                aria-pressed={active}
              >
                {k === "normal" ? "Normal" : k === "important" ? "Important" : "Critical"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={addNote}
          disabled={saving || !body.trim()}
          className="rounded-lg bg-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-900 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add note"}
        </button>

        <button
          onClick={loadNotes}
          disabled={loading}
          className="rounded-lg border border-neutral-800 px-3 py-2 text-sm text-neutral-200 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <div className="pt-1">
        {loading ? (
          <div className="text-xs text-neutral-500">Loading notes…</div>
        ) : items.length === 0 ? (
          <div className="text-xs text-neutral-500">No notes yet.</div>
        ) : (
          <ul className="space-y-2">
            {items.map((n) => (
              <li
                key={n.id}
                className={(() => {
                  const imp = (n.importance || "normal") as Importance;
                  const base = "rounded-lg border px-3 py-2";
                  if (imp === "critical") return `${base} border-red-800 bg-red-950/30`;
                  if (imp === "important") return `${base} border-amber-800 bg-amber-950/20`;
                  return `${base} border-neutral-800 bg-neutral-950`;
                })()}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] text-neutral-400">
                    {n.author_name ? (
                      <span className="font-semibold text-neutral-300">{n.author_name}</span>
                    ) : authorName ? (
                      <span className="font-semibold text-neutral-300">{authorName}</span>
                    ) : (
                      <span className="text-neutral-500">Unknown rep</span>
                    )}
                  </div>

                  <div
                    className={(() => {
                      const imp = (n.importance || "normal") as Importance;
                      const base =
                        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold";
                      if (imp === "critical") return `${base} border-red-800 bg-red-950/40 text-red-200`;
                      if (imp === "important") return `${base} border-amber-800 bg-amber-950/30 text-amber-200`;
                      return `${base} border-neutral-800 bg-neutral-950 text-neutral-300`;
                    })()}
                  >
                    {(n.importance || "normal") === "critical"
                      ? "Critical"
                      : (n.importance || "normal") === "important"
                      ? "Important"
                      : "Normal"}
                  </div>
                </div>

                <div className="mt-1 text-sm text-neutral-100 whitespace-pre-wrap">{n.body}</div>

                <div className="mt-1 text-[11px] text-neutral-500">
                  {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}