// src/components/CrmDrawer.tsx
'use client';

import { useCallback, useEffect, useState } from "react";
import { useDebouncedSearch } from "@/lib/useDebouncedSearch";
import { searchContacts, type ContactHit, getCrmLink } from "@/lib/api";

export default function CrmDrawer({
  open,
  onClose,
  onAttach,                 // existing: attach by contactId
  onAttachEmail,            // NEW (optional): attach by email
  callId,                   // NEW (optional): to load current link
}: {
  open: boolean;
  onClose: () => void;
  onAttach: (contactId: string) => void;
  onAttachEmail?: (email: string) => void;
  callId?: string;
}) {
  const [q, setQ] = useState("");
  const { data, loading, err } = useDebouncedSearch<ContactHit[]>(q, searchContacts, 250);

  // keyboard nav
  const [idx, setIdx] = useState(0);
  const list = data ?? [];
  useEffect(() => { setIdx(0); }, [q, loading]); // reset when query changes

  const onKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!list.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(i + 1, list.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = list[idx];
      if (!hit) return;
      if (onAttachEmail && hit.email) onAttachEmail(hit.email);
      else onAttach(hit.id);
    }
  }, [list, idx, onAttach, onAttachEmail]);

  // NEW: show current link (if callId provided)
  const [current, setCurrent] = useState<{ email?: string|null; name?: string|null } | null>(null);
  useEffect(() => {
    if (!open || !callId) return;
    getCrmLink(callId).then(r => setCurrent(r || null)).catch(() => setCurrent(null));
  }, [open, callId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex justify-end z-50">
      <div className="w-full max-w-md h-full bg-zinc-950 border-l border-zinc-800 p-4 flex flex-direction">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">Link / Review CRM</div>
          <button className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm" onClick={onClose}>Close</button>
        </div>

        {/* Current link pill */}
        {current && (current.email || current.name) && (
          <div className="mt-3 text-xs">
            <div className="text-zinc-400 mb-1">Linked contact</div>
            <div className="rounded-md border border-emerald-700/30 bg-emerald-900/10 px-3 py-2 text-emerald-300">
              {current.email ?? "—"}{current.name ? ` (${current.name})` : ""}
            </div>
          </div>
        )}

        {/* Search box */}
        <div className="flex items-center gap-2 mt-3">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search contacts by name/email/company…"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none"
          />
        </div>

        {/* Results */}
        <div className="mt-3 flex-1 overflow-auto rounded-lg border border-zinc-800">
          {q.trim() === "" && (
            <div className="p-3 text-sm text-zinc-400">Type to search contacts…</div>
          )}
          {loading && <div className="p-3 text-sm text-zinc-400">Searching…</div>}
          {err && <div className="p-3 text-sm text-red-300">Error: {err}</div>}

          {!loading && !err && list.length > 0 && (
            <ul role="listbox" aria-label="Contacts" className="divide-y divide-white/10">
              {list.map((c, i) => (
                <li
                  key={c.id}
                  role="option"
                  aria-selected={i === idx}
                  onMouseEnter={() => setIdx(i)}
                  className={`p-3 ${i === idx ? "bg-white/10" : "hover:bg-white/5"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm truncate">{c.name || c.email || "(no name)"}</div>
                      <div className="text-xs text-zinc-400 truncate">
                        {(c.email || "—")}{c.company ? ` • ${c.company}` : ""}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        className="text-xs rounded-md border border-zinc-700 px-2 py-1"
                        onClick={() => onAttach(c.id)}
                        title={`Attach by ID ${c.id}`}
                      >
                        Attach
                      </button>
                      {onAttachEmail && c.email && (
                        <button
                          className="text-xs rounded-md border border-zinc-700 px-2 py-1"
                          onClick={() => onAttachEmail!(c.email!)}
                          title={`Link ${c.email}`}
                        >
                          Link email
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!loading && !err && q.trim() && list.length === 0 && (
            <div className="p-3 text-sm text-zinc-400">No matches.</div>
          )}
        </div>

        <div className="mt-2 text-xs text-zinc-500">
          ↑/↓ to move • Enter to {onAttachEmail ? "link email (if present) or attach" : "attach"}
        </div>
      </div>
    </div>
  );
}
