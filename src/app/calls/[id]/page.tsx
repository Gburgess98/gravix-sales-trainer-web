// web/src/app/calls/[id]/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useRouter, usePathname } from 'next/navigation';
import AuthGate from '@/components/AuthGate';
import ScoreHistory from '@/components/ScoreHistory';
import ScoreSparkline from "@/components/ScoreSparkline";
import CopyLinkButton from "@/components/CopyLinkButton";
import ErrorBox from "@/components/ErrorBox";
import { linkCallByEmail, getCrmLink } from "@/lib/api";
import { fetchJsonWithRetry } from "@/lib/fetchJsonWithRetry";
import { useCallback } from "react";
import { useToast } from "@/components/Toast";
import dayjs from "dayjs";

import {
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

// Always hit the API via our proxy so x-user-id is injected from Supabase cookies
const api = (path: string) => `/api/proxy${path}`;

// Local proxy-bound getCall to avoid any direct API_BASE usage inside lib/api
async function getCallViaProxy(callId: string) {
  return await fetchJsonWithRetry<any>(api(`/v1/calls/${encodeURIComponent(callId)}`), { cache: 'no-store' });
}

export default function CallPage() {
  const { id } = useParams<{ id: string }>();
  const callId = (id ?? '').toString();

const toast = useToast();

  // url controls for crm panel
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [assignments, setAssignments] = useState<any[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [drills, setDrills] = useState<{ id: string; label: string }[]>([]);
  const [drillsLoading, setDrillsLoading] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string; email?: string | null }[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

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

  const [assignee, setAssignee] = useState<string>("");
  const [quickDrill, setQuickDrill] = useState<string>("");
  const [assignBusy, setAssignBusy] = useState(false);


  // Score trend (sparkline)
const [trend, setTrend] = useState<number[] | null>(null);
useEffect(() => {
  if (!callId) return;
  fetchJsonWithRetry(`/api/proxy/v1/calls/${callId}/scores?n=12`)
    .then(r => setTrend(r.values || []))
    .catch(() => setTrend(null));
}, [callId]);

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

  // Coach drawer state (deep-linkable via ?panel=coach&assign=1)
  const [coachOpen, setCoachOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false); // if true, show Assign Drill section

  // --- ADD (CRM linker) ---
const [crmQuery, setCrmQuery] = useState("");
const [crmResults, setCrmResults] = useState<any[]>([]);
const [crmLoading, setCrmLoading] = useState(false);
const [crmError, setCrmError] = useState<string | null>(null);

const searchContacts = useCallback(async () => {
  try {
    setCrmLoading(true); setCrmError(null);
    const resp = await fetchJsonWithRetry(`/api/proxy/v1/crm/contacts?q=${encodeURIComponent(crmQuery || "")}`);
    setCrmResults(resp.items || []);
  } catch (e: any) {
    setCrmError(e?.message || "Search failed");
  } finally {
    setCrmLoading(false);
  }
}, [crmQuery]);

const linkCall = useCallback(async (contactId: string) => {
  try {
    await fetchJsonWithRetry(`/api/proxy/v1/crm/link-call`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ callId, contactId })
    });
    await loadLinkInfo().catch(() => {});
    toast("Linked to contact.");
  } catch (e: any) {
    toast(e?.message || "Link failed");
  }
}, [callId, loadLinkInfo, toast]);

  // --- ADD: Assign form state ---
const [assignSaving, setAssignSaving] = useState(false);
const [assignError, setAssignError] = useState<string | null>(null);
const DEV_UID = process.env.NEXT_PUBLIC_DEV_USER_ID || "11111111-1111-1111-8111-111111111111";
const [assigneeUserId, setAssigneeUserId] = useState(DEV_UID);
const [drillId, setDrillId] = useState("intro-basics");
const [notes, setNotes] = useState("");
const searchParams = useSearchParams();

const [coachNotes, setCoachNotes] = useState("");
const [notesSaving, setNotesSaving] = useState(false);
const assignmentCount = assignments.length;
const loadAssignments = useCallback(async () => {
  const r = await fetchJsonWithRetry(`/api/proxy/v1/coach/assignments?callId=${callId}`);
  setAssignments(r.items || []);
}, [callId]);
useEffect(() => { if (coachOpen) loadAssignments().catch(()=>{}); }, [coachOpen, loadAssignments]);

useEffect(() => {
  if (!coachOpen) return;
  (async () => {
    try {
      const r = await fetchJsonWithRetry(`/api/proxy/v1/coach/notes?callId=${callId}`);
      setCoachNotes(r?.note?.notes || "");
    } catch {
      /* ignore */
    }
  })();
}, [coachOpen, callId]);

const onSaveAssign = useCallback(async () => {
  try {
    setAssignSaving(true); setAssignError(null);
    await fetchJsonWithRetry(`/api/proxy/v1/coach/assign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ callId, assigneeUserId, drillId, notes })
    });
    await loadAssignments().catch(() => {});
    toast("Assignment saved.");
  } catch (e: any) {
    setAssignError(e?.message || "Failed to save assignment.");
  } finally {
    setAssignSaving(false);
  }
}, [callId, assigneeUserId, drillId, notes, loadAssignments, toast]);


  // ------- Data loaders -------

  // Call (once)
  useEffect(() => {
    if (!callId) return;
    let alive = true;

    (async () => {
      try {
        setLoadingCall(true);
        const res = await getCallViaProxy(callId);
        if (!alive) return;

        setCallMeta(res.call);
        setAudioUrl(res?.call?.signedAudioUrl ?? null);
        console.debug('[CallPage] loaded via proxy', { id: callId, ok: !!res?.call });

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

  // Load coach assignments for this call
useEffect(() => {
  if (!callId) return;
  let cancelled = false;
  (async () => {
    try {
      setAssignmentsLoading(true);
      const r = await fetchJsonWithRetry<any>(`/api/proxy/v1/coach/assignments?callId=${encodeURIComponent(callId)}`);
      if (!cancelled && r?.ok) setAssignments(r.items || []);
    } catch {
      // swallow – non-critical for page
    } finally {
      if (!cancelled) setAssignmentsLoading(false);
    }
  })();
  return () => { cancelled = true; };
}, [callId]);

// Load drills catalog (static list from API)
useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      setDrillsLoading(true);
      const r = await fetchJsonWithRetry<any>(`/api/proxy/v1/coach/drills`);
      if (!cancelled && r?.ok) setDrills(r.items || []);
    } catch {
      // ignore
    } finally {
      if (!cancelled) setDrillsLoading(false);
    }
  })();
  return () => { cancelled = true; };
}, []);

// Load team users for assignment dropdown
useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      setUsersLoading(true);
      const r = await fetch('/api/proxy/v1/team/users?limit=100', { cache: 'no-store' });
      const j = await r.json();
      if (!cancelled && j?.ok && Array.isArray(j.items)) setUsers(j.items);
    } catch {}
    finally { if (!cancelled) setUsersLoading(false); }
  })();
  return () => { cancelled = true; };
}, []);

// --- ADD: deleteAssignment helper ---
async function deleteAssignment(id: string) {
  try {
    const r = await fetch(`/api/proxy/v1/coach/assignments/${id}`, { method: "DELETE" });
    if (!r.ok) throw new Error("Delete failed");
    setAssignments(xs => xs.filter(x => x.id !== id));
  } catch (e) {
    console.error("deleteAssignment", e);
  }
}

  // Try fetching a dedicated signed audio URL (fallback/refresh)
  useEffect(() => {
    if (!callId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchJsonWithRetry<any>(`/api/proxy/v1/calls/${callId}/signed-audio`, { cache: "no-store" });
        if (!cancelled && r?.ok && r.url) {
          setAudioUrl((prev) => prev || r.url);
        }
      } catch {
        // ignore; the player can still use the URL from getCall
      }
    })();
    return () => { cancelled = true; };
  }, [callId]);

  // Poll until scored (refresh status, score, and history)
  useEffect(() => {
    if (!callId) return;
    let cancelled = false;
    let timer: any = null;

    async function tick() {
      try {
        const res = await getCallViaProxy(callId);
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

  // open drawers automatically based on URL params
  useEffect(() => {
    const p = params.get("panel");
    const isAssign = params.get("assign") === "1";
    setCrmOpen(p === "crm");
    setCoachOpen(p === "coach");
    setAssignOpen(p === "coach" && isAssign);
  }, [params]);
  useEffect(() => {
    if (coachOpen && assignOpen) {
      const el = document.getElementById("assign-form");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        const input = el.querySelector("input") as HTMLInputElement | null;
        input?.focus();
      }
    }
  }, [coachOpen, assignOpen]);

  // Keyboard shortcuts: c = CRM, a = Coach (Assign)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      // ignore when typing in inputs/textareas or when modifier keys are held
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "c") {
        openCrm();
      } else if (e.key.toLowerCase() === "a") {
        openCoach(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCrm, openCoach]);

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
        const res = await getCallViaProxy(callId);
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

  // --- CRM: unlink contact/account ---
  async function unlink(target: "contact" | "account") {
    try {
      await fetchJsonWithRetry(`/api/proxy/v1/crm/unlink`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callId, target }),
      });
      await loadLinkInfo();
      toast(`${target} unlinked.`);
    } catch (e: any) {
      toast(e?.message || "Unlink failed");
    }
  }

  // contact search + link (by selecting a contact, we use their email)
  function debouncedSearchContacts(term: string) {
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
          `/api/proxy/v1/crm/contacts?q=${encodeURIComponent(term)}&limit=12`,
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

  const openCoach = (withAssign = false) => {
    const url = new URL(window.location.href);
    url.searchParams.set("panel", "coach");
    if (withAssign) url.searchParams.set("assign", "1");
    else url.searchParams.delete("assign");
    router.replace(`${pathname}?${url.searchParams.toString()}`);
  };
  const closeCoach = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("panel");
    url.searchParams.delete("assign");
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
            {loadingCall ? (
  <span className="inline-block h-6 w-48 rounded bg-white/10 animate-pulse" />
) : (
  <>
    {callMeta?.filename || `Call ${callId}`}
    {overall != null ? (
      <ScorePill score={overall} />
    ) : (
      <span className="text-sm px-2 py-1 rounded border bg-zinc-600/20 text-zinc-300">—</span>
    )}
  </>
)}
          </h1>

          <div className="ml-auto flex items-center gap-2">
            {/* Copy share link to open CRM panel */}
            <CopyLinkButton href={`/calls/${callId}?panel=crm`} size="md" />

            {/* --- ADD: CRM linker UI --- */}
<div className="mt-3 space-y-2">
  <div className="flex gap-2">
    <input className="flex-1 bg-neutral-900 border border-neutral-700 rounded p-2"
      placeholder="Search contacts…" value={crmQuery} onChange={e => setCrmQuery(e.target.value)} />
    <button onClick={searchContacts} className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500">
      {crmLoading ? "Searching..." : "Search"}
    </button>
  </div>
  {crmError && <ErrorBox msg={crmError} />}
  <ul className="divide-y divide-neutral-800">
    {crmResults.map(c => (
      <li key={c.id} className="py-2 flex items-center justify-between">
        <div>
          <div className="font-medium">{c.name}</div>
          <div className="opacity-70 text-sm">{c.email}</div>
        </div>
        <button onClick={() => linkCall(c.id)} className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500">Link</button>
      </li>
    ))}
    {!crmLoading && crmResults.length === 0 && <li className="py-2 opacity-60">No results</li>}
  </ul>
</div>

            {/* Existing action */}
            <button onClick={openCrm} className="rounded-xl border px-3 py-1.5 text-sm">
              Link / Review CRM
            </button>
            <button onClick={() => openCoach(true)} className="rounded-xl border px-3 py-1.5 text-sm">
              Assign Drill {assignmentCount > 0 && <span className="ml-1 opacity-70">({assignmentCount})</span>}
           </button>
            {process.env.NEXT_PUBLIC_SHOW_ADMIN === "true" && (
              <a
                href={`/api/proxy/v1/admin/preview-slack?callId=${encodeURIComponent(callId)}&overall=${overall ?? 80}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border px-3 py-1.5 text-sm"
                title="Preview Slack payload"
              >
                Preview Slack
              </a>
            )}
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
         
          {trend && trend.length > 1 && (
            <div className="ml-auto flex items-center gap-2 text-xs opacity-80">
              <span>Trend</span>
              <div className="text-emerald-400">
                <ScoreSparkline scores={trend} />
              </div>
            </div>
          )}
          <p className="text-xs opacity-60">Hint: press <kbd className="px-1 border rounded">c</kbd> for CRM, <kbd className="px-1 border rounded">a</kbd> for Coach.</p>
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

        {/* Coach assignments (main panel) */}
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Coach assignments</h2>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">Assignments</div>
              <div className="text-xs text-neutral-400">
                {assignmentsLoading ? "Loading…" : `${assignments.length} item${assignments.length === 1 ? "" : "s"}`}
              </div>
            </div>

            {assignments.length === 0 && !assignmentsLoading && (
              <div className="text-sm text-neutral-500">No assignments yet.</div>
            )}

            {assignments.length > 0 && (
              <ul className="divide-y divide-neutral-800">
                {assignments.map((a:any) => (
                  <li key={a.id} className="py-2 flex items-center justify-between gap-3">
                    <div className="text-sm">
                      <div className="font-medium">{a.drill_id}</div>
                      {a.notes && <div className="text-neutral-400 text-xs mt-0.5">{a.notes}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => deleteAssignment(a.id)}
                        className="text-xs px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Quick-assign actionable form */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
              <label className="text-xs text-neutral-400">Drill</label>
              <input
                value={quickDrill}
                onChange={(e) => setQuickDrill(e.target.value)}
                placeholder="e.g. Objection: Budget"
                className="sm:col-span-2 w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
              <label className="text-xs text-neutral-400">Assignee</label>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="sm:col-span-2 w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
              >
                <option value="">{usersLoading ? 'Loading users…' : 'Select a user'}</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name}{u.email ? ` (${u.email})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2">
              <button
                onClick={async () => {
                  if (!quickDrill || !assignee) return;
                  setAssignBusy(true);
                  try {
                    const r = await fetch("/api/proxy/v1/coach/assign", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ callId, assigneeUserId: assignee, drillId: quickDrill }),
                    });
                    const j = await r.json();
                    if (!r.ok || !j?.ok) throw new Error(j?.error || "failed");
                    setAssignments((xs) => [j.item, ...xs]);
                    setQuickDrill("");
                    setAssignee("");
                  } catch (e) {
                    console.error(e);
                  } finally {
                    setAssignBusy(false);
                  }
                }}
                disabled={assignBusy}
                className="text-xs px-3 py-1.5 rounded border border-neutral-700"
              >
                {assignBusy ? "Assigning…" : "Assign to rep"}
              </button>
            </div>
          </div>
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
              <span className="px-2 py-0.5 rounded-full border inline-flex items-center gap-2">
                <span>Contact: {contactChip}</span>
                <button
                  onClick={() => unlink("contact")}
                  className="opacity-60 hover:opacity-100"
                  aria-label="Unlink contact"
                  title="Unlink contact"
                >
                  ×
                </button>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full border bg-zinc-700/30">No contact linked</span>
            )}
            {accountChip ? (
              <span className="px-2 py-0.5 rounded-full border inline-flex items-center gap-2">
                <span>Account: {accountChip}</span>
                <button
                  onClick={() => unlink("account")}
                  className="opacity-60 hover:opacity-100"
                  aria-label="Unlink account"
                  title="Unlink account"
                >
                  ×
                </button>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full border bg-zinc-700/30">No account linked</span>
            )}
          </div>
          <button onClick={openCrm} className="rounded-xl border px-3 py-1.5 text-sm">
            Open CRM panel
          </button>
        </section>

        {coachOpen && assignOpen && (
          <div className="rounded border border-purple-400/30 bg-purple-500/10 p-3 text-sm text-purple-200">
            Coach panel opened via deep link — “Assign Drill” preset is active.
          </div>
        )}
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
                onChange={(e) => debouncedSearchContacts(e.target.value)}  // debounced now
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

      {/* === COACH DRAWER === */}
      <div
        className={`fixed inset-0 z-50 transition ${coachOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!coachOpen}
      >

        {/* Backdrop */}
        <div
          onClick={closeCoach}
          className={`absolute inset-0 bg-black/40 transition-opacity ${coachOpen ? "opacity-100" : "opacity-0"}`}
        />
        {/* Panel */}
        <div
          className={`absolute right-0 top-0 h-full w-full max-w-md bg-neutral-950 border-l border-neutral-800 p-5 transform transition-transform ${coachOpen ? "translate-x-0" : "translate-x-full"}`}
        >
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Coach</h2>
            <button onClick={closeCoach} className="ml-auto opacity-70 hover:opacity-100 underline text-sm">
              Close
            </button>
          </div>
          {assignments.slice(0,3).map((a:any) => (
  <span key={a.id} className="ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs opacity-80">
    <span>{a.drill_id}</span>
    <span className="opacity-60">· {a.created_at ? new Date(a.created_at).toLocaleString() : ""}</span>
  </span>
))}

          <div className="mt-4 space-y-4 text-sm">

{/* --- ADD: Assign form --- */}
<div id="assign-form" className="space-y-2 mt-3">
  <label className="block text-sm opacity-80">Assignee User ID</label>
  <input className="w-full bg-neutral-900 border border-neutral-700 rounded p-2"
    value={assigneeUserId} onChange={e => setAssigneeUserId(e.target.value)} />

  <label className="block text-sm opacity-80">Drill</label>
  <select className="w-full bg-neutral-900 border border-neutral-700 rounded p-2"
    value={drillId} onChange={e => setDrillId(e.target.value)}>
 {drills.length ? (
  drills.map(d => <option key={d.id} value={d.id}>{d.label}</option>)
) : (
  <>
    <option value="intro-basics">Intro: Basics</option>
    <option value="discovery-5qs">Discovery: Top 5 Qs</option>
    <option value="objection-too-expensive">Objection: “Too expensive”</option>
    <option value="close-trial">Close: Trial close</option>
  </>
)}
  </select>

  <label className="block text-sm opacity-80">Notes</label>
  <textarea className="w-full bg-neutral-900 border border-neutral-700 rounded p-2"
    rows={3} value={notes} onChange={e => setNotes(e.target.value)} />

  {assignError && <ErrorBox msg={assignError} />}

  <button
    onClick={onSaveAssign}
    disabled={assignSaving || !assigneeUserId || !drillId}
    className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50">
    {assignSaving ? "Saving..." : "Save Assignment"}
  </button>
</div>

{/* Assignments list (remove) */}
<div className="rounded-xl border p-3 space-y-2">
  <h3 className="font-medium">Assignments</h3>
  {assignments.length === 0 ? (
    <div className="text-sm opacity-70">No assignments yet.</div>
  ) : (
    <ul className="divide-y divide-neutral-800">
      {assignments.map((a:any) => (
        <li key={a.id} className="py-2 flex items-center justify-between text-sm">
          <div className="flex flex-col">
            <span className="font-medium">{a.drill_id}</span>
            <span className="opacity-60">{new Date(a.created_at).toLocaleString()}</span>
          </div>
          <button
            onClick={async () => {
              try {
                await fetchJsonWithRetry(`/api/proxy/v1/coach/assignments/${a.id}`, { method: "DELETE" });
                await loadAssignments();
                toast("Assignment removed.");
              } catch (e:any) {
                toast(e?.message || "Failed to remove.");
              }
            }}
            className="px-2 py-1 rounded bg-red-600 hover:bg-red-500"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  )}
</div>

            
            </div>

            {/* Coaching notes */}
<div className="rounded-xl border p-3">
  <div className="flex items-center gap-2 mb-2">
    <h3 className="font-medium">Notes</h3>
    {notesSaving && <span className="text-xs opacity-70">Saving…</span>}
  </div>
  <textarea
    className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 min-h-[100px]"
    placeholder="Add quick guidance for the rep…"
    value={coachNotes}
    onChange={(e) => setCoachNotes(e.target.value)}
    onBlur={async () => {
      try {
        setNotesSaving(true);
        await fetchJsonWithRetry(`/api/proxy/v1/coach/notes`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ callId, notes: coachNotes })
        });
        toast("Saved");
      } catch (e:any) {
        toast(e?.message || "Failed to save");
      } finally {
        setNotesSaving(false);
      }
    }}
  />
</div>
          </div>
        </div>
      </div>
      {/* === /COACH DRAWER === */}
    </AuthGate>
  );
}
