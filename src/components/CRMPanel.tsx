type ContactHealth = {
  status: "hot" | "warm" | "cold";
  score: number;
  reasons?: string[];
  next_action?: string;
};
// src/components/CRMPanel.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type LinkInfo = {
  contact: { id: string; first_name?: string | null; last_name?: string | null; email?: string | null } | null;
  account: { id: string; name?: string | null; domain?: string | null } | null;
  opportunity: { id: string; name?: string | null; stage?: string | null } | null;
};

type Contact = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  account_id?: string | null;
  health_status?: 'hot' | 'warm' | 'cold' | 'stale' | null;
  health_score?: number | null;
  next_action?: string | null;
};

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
  const [health, setHealth] = useState<ContactHealth | null>(null);

  const [autoAssignBusyId, setAutoAssignBusyId] = useState<string | null>(null);
  const [autoAssignedIds, setAutoAssignedIds] = useState<Record<string, true>>({});

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
        if (j.link?.contact?.id) {
          try {
            const hr = await fetch(`/api/proxy/v1/crm/contacts/${encodeURIComponent(j.link.contact.id)}/health`);
            const hj = await hr.json();
            if (hr.ok && hj.ok) {
              setHealth(hj.health);
            }
          } catch {
            // non‑blocking
          }
        }
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
      const items = Array.isArray(j.items) ? [...j.items] : [];
      items.sort((a: any, b: any) => {
        const sa = typeof a.health_score === 'number' ? a.health_score : -1;
        const sb = typeof b.health_score === 'number' ? b.health_score : -1;
        if (sa !== sb) return sb - sa; // higher score first
        const na = [a.first_name, a.last_name].filter(Boolean).join(' ').toLowerCase();
        const nb = [b.first_name, b.last_name].filter(Boolean).join(' ').toLowerCase();
        return na.localeCompare(nb);
      });
      setResults(items);
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

  async function previewAutoAssignContact(contactId: string) {
    setAutoAssignBusyId(contactId);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch(
        `/api/proxy/v1/crm/contacts/${encodeURIComponent(contactId)}/auto-assign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dry_run: true }),
        }
      );
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);

      if (j.suggestion?.title) {
        setMsg(`Preview: ${j.suggestion.title}`);
      } else {
        setMsg("Preview generated.");
      }
    } catch (e: any) {
      setErr(e?.message || "Preview failed");
    } finally {
      setAutoAssignBusyId(null);
    }
  }

  async function autoAssignContact(contactId: string) {
    setAutoAssignBusyId(contactId);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch(`/api/proxy/v1/crm/contacts/${encodeURIComponent(contactId)}/auto-assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);

      setAutoAssignedIds((prev) => ({ ...prev, [contactId]: true }));

      // If this contact is currently linked, refresh its health (non-blocking)
      if (link?.contact?.id && link.contact.id === contactId) {
        try {
          const hr = await fetch(`/api/proxy/v1/crm/contacts/${encodeURIComponent(contactId)}/health`);
          const hj = await hr.json();
          if (hr.ok && hj.ok) setHealth(hj.health);
        } catch {
          // ignore
        }
      }

      setMsg(j.created ? "Auto-assigned." : "Already assigned (deduped).");
    } catch (e: any) {
      setErr(e?.message || "Auto-assign failed");
    } finally {
      setAutoAssignBusyId(null);
    }
  }

  const contactName = useMemo(() => {
    if (!link?.contact) return null;
    const n = [link.contact.first_name, link.contact.last_name].filter(Boolean).join(" ").trim();
    return n || link.contact.email || link.contact.id;
  }, [link]);

  const accountName = link?.account?.name || link?.account?.domain || null;

  function HealthPill({ status, score }: { status?: string | null; score?: number | null }) {
    if (!status) return null;
    const s = String(status).toLowerCase();
    const label = s.toUpperCase();
    const cls =
      s === "hot"
        ? "bg-green-600/20 text-green-400"
        : s === "warm"
        ? "bg-yellow-600/20 text-yellow-400"
        : "bg-neutral-700/30 text-neutral-300";
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>
        {label}
        {typeof score === "number" ? ` • ${score}` : ""}
      </span>
    );
  }

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
                <div className="flex items-center gap-2">
                  <span className="min-w-0 truncate">{contactName || <span className="opacity-60">None</span>}</span>
                  {health && <HealthPill status={health.status} score={health.score} />}

                  {link?.contact?.id && (
                    <div className="ml-auto flex gap-2">
                      <button
                        type="button"
                        onClick={() => previewAutoAssignContact(link.contact!.id)}
                        disabled={busy || autoAssignBusyId === link.contact.id}
                        className="rounded-lg px-2 py-1 text-xs border border-neutral-700 hover:bg-neutral-900 disabled:opacity-50"
                        title="Preview next-action assignment"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => autoAssignContact(link.contact!.id)}
                        disabled={busy || autoAssignBusyId === link.contact.id}
                        className="rounded-lg px-2 py-1 text-xs border border-neutral-700 hover:bg-neutral-900 disabled:opacity-50"
                        title="Create a next-action assignment from Health"
                      >
                        {autoAssignBusyId === link.contact.id ? "Assigning…" : autoAssignedIds[link.contact.id] ? "Auto-assigned" : "Auto-assign"}
                      </button>
                    </div>
                  )}
                </div>
                {health?.next_action && (
                  <div className="mt-2 text-xs text-neutral-300">
                    <span className="opacity-60">Action:</span>{" "}
                    <span className="font-medium">{health.next_action}</span>
                  </div>
                )}
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
                  const isAutoBusy = autoAssignBusyId === c.id;
                  const isAutoDone = !!autoAssignedIds[c.id];

                  return (
                    <button
                      key={c.id}
                      onClick={() => linkContactId(c.id)}
                      className="w-full text-left p-3 hover:bg-neutral-900 disabled:opacity-60"
                      disabled={busy}
                    >
                      <div className="flex items-start gap-3 justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm truncate">{name || c.email || c.id}</div>
                          {c.email && <div className="text-xs opacity-70 truncate">{c.email}</div>}
                          {c.next_action && (
                            <div className="mt-1 text-xs text-neutral-300">
                              <span className="opacity-60">Action:</span> <span className="font-medium">{c.next_action}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <HealthPill status={c.health_status} score={c.health_score} />
                        </div>

                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!busy && !isAutoBusy) previewAutoAssignContact(c.id);
                            }}
                            disabled={busy || isAutoBusy}
                            className="rounded-lg px-2 py-1 text-xs border border-neutral-700 hover:bg-neutral-800 disabled:opacity-50"
                            title="Preview next-action assignment"
                          >
                            Preview
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!busy && !isAutoBusy) autoAssignContact(c.id);
                            }}
                            disabled={busy || isAutoBusy}
                            className={`rounded-lg px-2 py-1 text-xs border border-neutral-700 hover:bg-neutral-800 disabled:opacity-50 ${
                              isAutoDone ? "bg-green-600/20 text-green-300 border-green-700/50" : ""
                            }`}
                            title="Create a next-action assignment from Health"
                          >
                            {isAutoDone ? "Auto-assigned" : isAutoBusy ? "Assigning…" : "Auto-assign"}
                          </button>
                        </div>
                      </div>
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