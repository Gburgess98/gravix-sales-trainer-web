// web/src/app/calls/[id]/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useRouter, usePathname } from 'next/navigation';
import AuthGate from '@/components/AuthGate';
import ScoreHistory from '@/components/ScoreHistory';
import CopyLinkButton from "@/components/CopyLinkButton";
// import CrmDrawer from "@/components/CrmDrawer"; // (not used; you render an inline drawer)
import { linkCallByEmail, getCrmLink } from "@/lib/api";

import {
  getCall,
  listPins,
  createPin,
  deletePin,
  setScore,
  getScoreHistory,
  type ScoreHistoryItem,
} from '@/lib/api';

type Pin = {
  id: string;
  call_id: string;
  user_id: string;
  t: number;
  note: string | null;
  created_at: string;
};

type Contact = { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; account_id?: string | null };

function scoreColour(score: number) {
  if (score >= 80) return "bg-green-600/20 text-green-400";
  if (score >= 60) return "bg-amber-600/20 text-amber-300";
  return "bg-red-600/20 text-red-300";
}

function ScorePill({ score, className = "" }: { score: number; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-sm ${scoreColour(score)} ${className}`}>
      {score}/100
    </span>
  );
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function CallPage() {
  const { id } = useParams<{ id: string }>();
  const callId = (id ?? '').toString();

  // url controls for crm panel
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Player state
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const [duration, setDuration] = useState(0);

  // Pins
  const [pins, setPins] = useState<Pin[]>([]);
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [loadingPins, setLoadingPins] = useState(true);

  // Call meta
  const [callMeta, setCallMeta] = useState<any>(null);
  const [loadingCall, setLoadingCall] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Score UI state
  const [scoreVal, setScoreVal] = useState<number>(80);
  const [savingScore, setSavingScore] = useState(false);
  const [scoreMsg, setScoreMsg] = useState<string | null>(null);

  // Score history
  const [history, setHistory] = useState<ScoreHistoryItem[]>([]);
  const [histErr, setHistErr] = useState<string | null>(null);

  // CRM link (inline state)
  const [linkInfo, setLinkInfo] = useState<{
    contact: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
    account: { id: string; name: string | null; domain: string | null } | null;
    opportunity: { id: string; name: string; stage: string } | null;
  } | null>(null);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);

  // CRM drawer state
  const [crmOpen, setCrmOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [idx, setIdx] = useState(0); // highlighted result index for ↑/↓
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // debounce timer
  const searchAbortRef = useRef<AbortController | null>(null); // cancel in-flight request

  // ------- Data loaders -------

  // Call (once)
  useEffect(() => {
    if (!callId) return;
    let alive = true;

    (async () => {
      try {
        setLoadingCall(true);
        const res = await getCall(callId);
        if (!alive) return;

        setCallMeta(res.call);
        setAudioUrl(res?.call?.signedAudioUrl ?? null);

        if (typeof res?.call?.score_overall === 'number') {
          setScoreVal(Number(res.call.score_overall));
        }
        setErr(null);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? 'Failed to load call');
      } finally {
        if (alive) setLoadingCall(false);
      }
    })();

    return () => { alive = false; };
  }, [callId]);

  // Poll until scored (refresh status, score, and history)
  useEffect(() => {
    if (!callId) return;
    let cancelled = false;
    let timer: any = null;

    async function tick() {
      try {
        const res = await getCall(callId);
        if (cancelled) return;
        setCallMeta(res.call);

        if (typeof res?.call?.score_overall === 'number') {
          setScoreVal(Number(res.call.score_overall));
        }

        if (res?.call?.signedAudioUrl && res.call.signedAudioUrl !== audioUrl) {
          setAudioUrl(res.call.signedAudioUrl);
        }

        if (res.call?.status !== 'scored') {
          timer = setTimeout(tick, 1500);
        } else {
          // refresh history when it becomes scored
          try {
            const h = await getScoreHistory(callId, 8);
            if (!cancelled) setHistory(h);
          } catch (e: any) {
            if (!cancelled) setHistErr(e?.message || "Failed to load score history");
          }
        }
      } catch {
        timer = setTimeout(tick, 2000);
      }
    }

    if (!callMeta || callMeta.status !== 'scored') {
      tick();
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, callMeta?.status, audioUrl]);

  // Pins (initial)
  async function refreshPins() {
    const res = await listPins(callId);
    setPins((res?.pins ?? []).sort((a: Pin, b: Pin) => a.t - b.t));
  }
  useEffect(() => {
    if (!callId) return;
    let alive = true;
    setLoadingPins(true);
    refreshPins()
      .catch((e) => alive && setErr(e?.message ?? 'Failed to load pins'))
      .finally(() => alive && setLoadingPins(false));
    return () => { alive = false; };
  }, [callId]);

  // CRM link info (now using helper)
  async function loadLinkInfo() {
    if (!callId) return;
    try {
      const link = await getCrmLink(callId);
      setLinkInfo(link || null);
    } catch {
      // ignore
    }
  }
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!alive) return;
      await loadLinkInfo();
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  // open drawer automatically on ?panel=crm
  useEffect(() => {
    setCrmOpen(params.get("panel") === "crm");
  }, [params]);

  // Player: track time + duration
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onTime = () => setT(el.currentTime || 0);
    const onMeta = () => {
      const d = Number(el.duration);
      setDuration(Number.isFinite(d) ? d : 0);
    };

    el.addEventListener('timeupdate', onTime);
    el.addEventListener('seeked', onTime);
    el.addEventListener('loadedmetadata', onMeta);

    onMeta();

    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('seeked', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
    };
  }, [audioRef.current, audioUrl]);

  // Player: resign URL if it errors (TTL expiry)
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onError = async () => {
      try {
        const res = await getCall(callId);
        setAudioUrl(res?.call?.signedAudioUrl ?? null);
      } catch { /* ignore */ }
    };

    el.addEventListener('error', onError);
    return () => el.removeEventListener('error', onError);
  }, [callId, audioRef.current]);

  // ------- Actions -------

  const seek = (sec: number) => {
    const el = audioRef.current;
    if (el) el.currentTime = sec;
  };

  async function onCreatePin() {
    try {
      setCreating(true);
      await createPin({ callId, t: Math.floor(t), note: note || null });
      setNote('');
      await refreshPins();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to create pin');
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(id: string) {
    try {
      await deletePin(id);
      setPins((p) => p.filter((x) => x.id !== id));
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to delete pin');
    }
  }

  async function onSaveScore() {
    try {
      setSavingScore(true);
      setScoreMsg(null);
      await setScore(callId, Math.max(0, Math.min(100, Number(scoreVal))));
      setScoreMsg('Saved ✓');
      setTimeout(() => setScoreMsg(null), 1500);
    } catch (e: any) {
      setScoreMsg(e?.message || 'Failed');
    } finally {
      setSavingScore(false);
    }
  }

  // --- CRM: link by email (helper) ---
  async function onLinkByEmail() {
    try {
      setLinkLoading(true);
      setLinkMsg(null);
      await linkCallByEmail(callId, linkEmail);
      await loadLinkInfo();
      setLinkMsg("Linked ✓");
      setTimeout(() => setLinkMsg(null), 1500);
      setLinkEmail("");
    } catch (e: any) {
      setLinkMsg(e?.message || "Failed");
    } finally {
      setLinkLoading(false);
    }
  }

  // contact search + link (by selecting a contact, we use their email)
  function searchContacts(term: string) {
    setQ(term);
    setSearchErr(null);

    // clear previous debounce + abort previous in-flight request
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchAbortRef.current?.abort();

    if (!term.trim()) {
      setResults([]);
      setIdx(0);
      return;
    }

    // debounce 250ms
    searchTimerRef.current = setTimeout(async () => {
      const ac = new AbortController();
      searchAbortRef.current = ac;
      try {
        const r = await fetch(
          `/api/proxy/v1/crm/contacts?query=${encodeURIComponent(term)}&limit=12`,
          { signal: ac.signal }
        );
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${r.status}`);
        setResults(j.items || []);
        setIdx(0); // reset highlight to first result when results change
      } catch (e: any) {
        if (e?.name === "AbortError") return; // ignore aborted
        setSearchErr(e?.message || "Search failed");
      }
    }, 250);
  }

  async function linkContactId(contactId: string) {
    setBusy(true);
    setSearchErr(null);
    try {
      const c = results.find((x) => x.id === contactId);
      if (c?.email) {
        await linkCallByEmail(callId, c.email);
        await loadLinkInfo();
        setQ("");
        setResults([]);
      } else {
        throw new Error("Selected contact has no email");
      }
    } catch (e: any) {
      setSearchErr(e?.message || "Link failed");
    } finally {
      setBusy(false);
    }
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[idx];
      if (hit) void linkContactId(hit.id);
    }
  }

  const openCrm = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("panel", "crm");
    router.replace(`${pathname}?${url.searchParams.toString()}`);
  };
  const closeCrm = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("panel");
    router.replace(`${pathname}?${url.searchParams.toString()}`);
  };

  const overall: number | null =
    typeof callMeta?.score_overall === 'number'
      ? Math.round(Number(callMeta.score_overall))
      : null;

  const contactChip = linkInfo?.contact
    ? ([linkInfo.contact.first_name, linkInfo.contact.last_name].filter(Boolean).join(" ").trim() || linkInfo.contact.email || linkInfo.contact.id)
    : null;
  const accountChip = linkInfo?.account
    ? (linkInfo.account.name || linkInfo.account.domain || linkInfo.account.id)
    : null;

  return (
    <AuthGate>
      <main className="py-6 space-y-6">
        <div className="flex items-start gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold break-all flex items-center gap-3">
            {callMeta?.filename || `Call ${callId}`}
            {overall != null ? (
              <ScorePill score={overall} />
            ) : (
              <span className="text-sm px-2 py-1 rounded border bg-zinc-600/20 text-zinc-300">—</span>
            )}
          </h1>

          <div className="ml-auto flex items-center gap-2">
            {/* Copy share link to open CRM panel */}
            <CopyLinkButton href={`/calls/${callId}?panel=crm`} size="md" />

            {/* Existing action */}
            <button onClick={openCrm} className="rounded-xl border px-3 py-1.5 text-sm">
              Link / Review CRM
            </button>
          </div>
        </div>

        {/* Live status + AI badge */}
        <div className="text-sm flex items-center gap-3">
          <span className="inline-block rounded-full border px-2 py-0.5">
            {callMeta?.status ?? 'queued'}
          </span>
          {overall != null && <ScorePill score={overall} className="text-xs px-1.5 py-0.5" />}
          {callMeta?.status === 'scored' && (
            <span
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
              title={callMeta?.ai_model ? `Scored by ${callMeta.ai_model}` : 'AI scored'}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M5 12l2 2 4-5 4 6 4-8" />
              </svg>
              AI
            </span>
          )}
        </div>

        {/* Rubric (if available) */}
        {callMeta?.rubric ? (
          <section className="grid md:grid-cols-2 gap-4">
            {(['intro', 'discovery', 'objection', 'close'] as const).map((k) => {
              const sec = callMeta.rubric?.[k];
              if (!sec) return null;
              const s = typeof sec.score === 'number' ? Math.round(Number(sec.score)) : null;
              return (
                <div key={k} className="rounded-xl border border-white/10 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium capitalize">{k}</h3>
                    {s != null ? (
                      <ScorePill score={s} className="text-xs px-1.5 py-0.5" />
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded border bg-zinc-600/20 text-zinc-300">—</span>
                    )}
                  </div>
                  <p className="text-sm opacity-80 whitespace-pre-wrap">{sec.notes || '—'}</p>
                </div>
              );
            })}
          </section>
        ) : null}

        {/* Player */}
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Player</h2>
          {loadingCall ? (
            <p className="text-sm opacity-70">Loading call…</p>
          ) : audioUrl ? (
            <>
              <audio ref={audioRef} src={audioUrl} controls className="w-full" />
              {duration > 0 && (
                <div className="relative h-2 bg-neutral-700 rounded w-full">
                  {pins.map((p) => {
                    const pct = Math.max(0, Math.min(100, (p.t / duration) * 100));
                    return (
                      <button
                        key={p.id}
                        title={`${fmt(p.t)}${p.note ? ' • ' + p.note : ''}`}
                        className="absolute top-0 h-2 w-[2px] bg-white/90 hover:h-3 hover:-top-0.5 transition"
                        style={{ left: `${pct}%` }}
                        onClick={() => seek(p.t)}
                        aria-label={`Jump to ${fmt(p.t)}`}
                      />
                    );
                  })}
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="text-sm opacity-70">Current: {fmt(t)}</div>
                <div className="ml-auto flex items-center gap-2">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional note…"
                    className="border rounded px-2 py-1 text-sm bg-transparent"
                    style={{ minWidth: 220 }}
                  />
                  <button
                    onClick={onCreatePin}
                    disabled={creating}
                    className="border rounded px-3 py-1 text-sm"
                  >
                    {creating ? 'Pinning…' : `Pin at ${fmt(t)}`}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-red-600">No audio available for this call.</p>
          )}
        </section>

        {/* Pins */}
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Pins</h2>
          {loadingPins ? (
            <p className="text-sm opacity-70">Loading pins…</p>
          ) : pins.length === 0 ? (
            <p className="text-sm opacity-70">No pins yet.</p>
          ) : (
            <ul className="divide-y border rounded">
              {pins.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-3 py-2">
                  <div className="text-sm">
                    <button
                      onClick={() => seek(p.t)}
                      className="underline underline-offset-2"
                      title="Jump"
                    >
                      {fmt(p.t)}
                    </button>
                    {p.note && <span className="ml-2 opacity-70">— {p.note}</span>}
                  </div>
                  <button
                    onClick={() => onDelete(p.id)}
                    className="border rounded px-2 py-1 text-xs"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Manual override */}
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Score</h2>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              value={Number.isFinite(scoreVal) ? scoreVal : 0}
              onChange={(e) => setScoreVal(Number(e.target.value))}
              className="border rounded px-2 py-1 text-sm bg-transparent w-24"
            />
            <button
              onClick={onSaveScore}
              disabled={savingScore}
              className="border rounded px-3 py-1 text-sm"
            >
              {savingScore ? 'Saving…' : 'Save Score'}
            </button>
            {scoreMsg && <span className="text-sm opacity-70">{scoreMsg}</span>}
          </div>
          <p className="text-xs opacity-60">Tip: 0–100. Saving updates the card on /recent-calls.</p>
        </section>

        {/* CRM summary chips (quick glance) */}
        <section className="space-y-2">
          <h2 className="text-lg font-medium">CRM</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            {contactChip ? (
              <span className="px-2 py-0.5 rounded-full border">Contact: {contactChip}</span>
            ) : (
              <span className="px-2 py-0.5 rounded-full border bg-zinc-700/30">No contact linked</span>
            )}
            {accountChip ? (
              <span className="px-2 py-0.5 rounded-full border">Account: {accountChip}</span>
            ) : (
              <span className="px-2 py-0.5 rounded-full border bg-zinc-700/30">No account linked</span>
            )}
          </div>
          <button onClick={openCrm} className="rounded-xl border px-3 py-1.5 text-sm">
            Open CRM panel
          </button>
        </section>

        {err && (
          <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {err}
          </div>
        )}
      </main>

      {/* === CRM DRAWER === */}
      <div
        className={`fixed inset-0 z-50 transition ${crmOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!crmOpen}
      >
        {/* Backdrop */}
        <div
          onClick={closeCrm}
          className={`absolute inset-0 bg-black/40 transition-opacity ${crmOpen ? "opacity-100" : "opacity-0"}`}
        />
        {/* Panel */}
        <div
          className={`absolute right-0 top-0 h-full w-full max-w-md bg-neutral-950 border-l border-neutral-800 p-5 transform transition-transform ${crmOpen ? "translate-x-0" : "translate-x-full"}`}
        >
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">CRM Link</h2>
            <button onClick={closeCrm} className="ml-auto opacity-70 hover:opacity-100 underline text-sm">
              Close
            </button>
          </div>

          <div className="mt-4 space-y-3 text-sm">
            {/* Current links */}
            <div className="rounded-xl border p-3">
              <div className="opacity-70 text-xs mb-1">Linked Contact</div>
              <div>{contactChip || <span className="opacity-60">None</span>}</div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="opacity-70 text-xs mb-1">Linked Account</div>
              <div>{accountChip || <span className="opacity-60">None</span>}</div>
            </div>

            <div className="border-top border-neutral-800 pt-3 mt-2" />

            {/* Link by email */}
            <div className="space-y-2">
              <div className="opacity-80 text-xs">Link by email</div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onLinkByEmail();
                }}
                className="flex gap-2"
              >
                <input
                  value={linkEmail}
                  onChange={(e) => setLinkEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="flex-1 rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none"
                />
                <button
                  type="submit"
                  disabled={linkLoading || !linkEmail.includes("@")}
                  className="rounded-xl px-3 py-2 bg-white text-black disabled:opacity-50"
                >
                  {linkLoading ? "Linking…" : "Link"}
                </button>
              </form>
              {linkMsg && <div className="text-green-400 text-xs">{linkMsg}</div>}
            </div>

            {/* Search contacts */}
            <div className="space-y-2">
              <div className="opacity-80 text-xs">Search contacts</div>
              <input
                placeholder="Type name or email…"
                className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none"
                value={q}
                onChange={(e) => searchContacts(e.target.value)}  // debounced now
                onKeyDown={onSearchKeyDown}                       // ↑/↓/Enter
                aria-activedescendant={results[idx]?.id ?? undefined}
                aria-autocomplete="list"
              />
              {searchErr && <div className="text-xs text-red-400">{searchErr}</div>}
              {q && (
                <div className="rounded-xl border divide-y max-h-56 overflow-auto" role="listbox" aria-label="Contacts">
                  {results.length === 0 ? (
                    <div className="p-3 text-xs opacity-70">No results</div>
                  ) : (
                    results.map((c, i) => {
                      const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
                      const selected = i === idx;
                      return (
                        <button
                          key={c.id}
                          id={c.id}
                          role="option"
                          aria-selected={selected}
                          onMouseEnter={() => setIdx(i)}
                          onClick={() => linkContactId(c.id)}
                          className={`w-full text-left p-3 ${selected ? "bg-white/10" : "hover:bg-neutral-900"}`}
                          disabled={busy}
                        >
                          <div className="text-sm">{name || c.email || c.id}</div>
                          {c.email && <div className="text-xs opacity-70">{c.email}</div>}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <p className="text-xs opacity-60">
              Tip: ↑/↓ to move • Enter to attach. Selecting a contact links by email; linking by email auto-creates the account by domain.
            </p>
          </div>
        </div>
      </div>
      {/* === /CRM DRAWER === */}
    </AuthGate>
  );
}
