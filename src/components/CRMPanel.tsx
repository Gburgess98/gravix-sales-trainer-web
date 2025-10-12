// src/components/CRMPanel.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type LinkInfo = {
  contact: { id: string; first_name?: string | null; last_name?: string | null; email?: string | null } | null;
  account: { id: string; name?: string | null; domain?: string | null } | null;
  opportunity: { id: string; name?: string | null; stage?: string | null } | null;
};

type Contact = { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; account_id?: string | null };

export default function CRMPanel({
  callId,
  open,
  onClose,
}: {
  callId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<LinkInfo | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(`/api/proxy/v1/crm/calls/${encodeURIComponent(callId)}/link`, { method: "GET" });
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
        setLink(j.link);
      } catch (e: any) {
        setErr(e?.message || "Failed to load CRM link");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, callId]);

  async function searchContacts(term: string) {
    setQ(term);
    if (!term) { setResults([]); return; }
    try {
      const r = await fetch(`/api/proxy/v1/crm/contacts?query=${encodeURIComponent(term)}&limit=12`);
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setResults(j.items || []);
    } catch (e: any) {
      setErr(e?.message || "Search failed");
    }
  }

  async function linkByEmail(email: string) {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await fetch(`/api/proxy/v1/crm/link-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId, email }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setLink(j.link);
      setMsg("Linked via email.");
    } catch (e: any) {
      setErr(e?.message || "Link failed");
    } finally {
      setBusy(false);
    }
  }

  async function linkContactId(contactId: string) {
    setBusy(true); setErr(null); setMsg(null);
    try {
      // we don’t have a direct contactId endpoint; we can fetch the contact, then send their email
      const c = results.find((x) => x.id === contactId);
      if (c?.email) {
        await linkByEmail(c.email);
      } else {
        throw new Error("Selected contact has no email");
      }
    } catch (e: any) {
      setErr(e?.message || "Link failed");
    } finally {
      setBusy(false);
    }
  }

  const contactName = useMemo(() => {
    if (!link?.contact) return null;
    const n = [link.contact.first_name, link.contact.last_name].filter(Boolean).join(" ").trim();
    return n || link.contact.email || link.contact.id;
  }, [link]);

  const accountName = link?.account?.name || link?.account?.domain || null;

  return (
    <div
      className={`fixed inset-0 z-50 transition ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
      />

      {/* Panel */}
      <div
        className={`absolute right-0 top-0 h-full w-full max-w-md bg-neutral-950 border-l border-neutral-800 p-5
                    transform transition-transform ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">CRM Link</h2>
          <button onClick={onClose} className="ml-auto opacity-70 hover:opacity-100 underline text-sm">Close</button>
        </div>

        <div className="mt-4 space-y-3 text-sm">
          {loading ? (
            <div className="opacity-70">Loading…</div>
          ) : err ? (
            <div className="text-red-400">{err}</div>
          ) : (
            <>
              <div className="rounded-xl border p-3">
                <div className="opacity-70 text-xs mb-1">Linked Contact</div>
                <div>{contactName || <span className="opacity-60">None</span>}</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="opacity-70 text-xs mb-1">Linked Account</div>
                <div>{accountName || <span className="opacity-60">None</span>}</div>
              </div>
            </>
          )}

          <div className="border-t border-neutral-800 pt-3 mt-2" />

          <div className="space-y-2">
            <div className="opacity-80 text-xs">Link by email</div>
            <EmailQuickLink busy={busy} onSubmit={linkByEmail} />
          </div>

          <div className="space-y-2">
            <div className="opacity-80 text-xs">Search contacts</div>
            <input
              placeholder="Type name or email…"
              className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none"
              value={q}
              onChange={(e) => searchContacts(e.target.value)}
            />
            {q && (
              <div className="rounded-xl border divide-y max-h-56 overflow-auto">
                {results.length === 0 ? (
                  <div className="p-3 text-xs opacity-70">No results</div>
                ) : results.map((c) => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
                  return (
                    <button
                      key={c.id}
                      onClick={() => linkContactId(c.id)}
                      className="w-full text-left p-3 hover:bg-neutral-900"
                      disabled={busy}
                    >
                      <div className="text-sm">{name || c.email || c.id}</div>
                      {c.email && <div className="text-xs opacity-70">{c.email}</div>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {msg && <div className="text-green-400 text-xs">{msg}</div>}
        </div>
      </div>
    </div>
  );
}

function EmailQuickLink({ onSubmit, busy }: { onSubmit: (email: string) => Promise<void>; busy: boolean }) {
  const [email, setEmail] = useState("");
  const [vErr, setVErr] = useState<string | null>(null);
  const valid = (e: string) => /\S+@\S+\.\S+/.test(e);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setVErr(null);
    if (!valid(email)) { setVErr("Enter a valid email"); return; }
    await onSubmit(email);
    setEmail("");
  }

  return (
    <form onSubmit={go} className="flex gap-2">
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="name@company.com"
        className="flex-1 rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-xl px-3 py-2 bg-white text-black disabled:opacity-50"
      >
        Link
      </button>
      {vErr && <div className="text-xs text-red-400 self-center">{vErr}</div>}
    </form>
  );
}