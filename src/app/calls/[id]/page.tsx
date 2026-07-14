// web/src/app/calls/[id]/page.tsx
'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useSearchParams, useRouter, usePathname } from 'next/navigation';
import AuthGate from '@/components/AuthGate';
import ScoreHistory from '@/components/ScoreHistory';
import ScoreSparkline from "@/components/ScoreSparkline";
import CopyLinkButton from "@/components/CopyLinkButton";
import ErrorBox from "@/components/ErrorBox";
// NOTE: Call page uses direct proxy CRM endpoints (single source of truth)
import { fetchJsonWithRetry } from "@/lib/fetchJsonwithretry";
import { useCallback } from "react";
import { useToast } from "@/components/Toast";
import { proxyFetch, getAdminConfig } from "@/lib/api";
import { formatCallDisplayTitle, isRawCallLabel } from "@/lib/callDisplay";
import { SectionCard, Button, buttonClasses, EmptyState } from "@/components/ui";

import {
  listPins,
  createPin,
  deletePin,
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
type Account = { id: string; name?: string | null; domain?: string | null };

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

function ReviewTagChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${ok
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
        : "border-amber-500/30 bg-amber-500/10 text-amber-300"
        }`}
    >
      {label}
    </span>
  );
}

// Day 215 — stage verdicts reuse the score-status thresholds (green/amber/red = status only).
function stageVerdict(score: number): { label: string; chip: string; bar: string } {
  if (score >= 80) {
    return {
      label: "Strong",
      chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      bar: "bg-emerald-500/70",
    };
  }
  if (score >= 60) {
    return {
      label: "Developing",
      chip: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      bar: "bg-amber-500/70",
    };
  }
  return {
    label: "Needs work",
    chip: "border-red-500/30 bg-red-500/10 text-red-300",
    bar: "bg-red-500/70",
  };
}

const STAGE_LABELS: Record<string, string> = {
  intro: "Intro",
  discovery: "Discovery",
  pitch: "Pitch",
  objection: "Objection handling",
  close: "Close",
};

function getVoiceData(callMeta: any) {
  const analysis = callMeta?.analysis_json ?? null;

  const voiceFromAnalysis = analysis?.voice ?? null;

  const directVoiceScore =
    typeof voiceFromAnalysis?.overall === "number"
      ? Math.round(Number(voiceFromAnalysis.overall))
      : typeof callMeta?.voice_score === "number"
        ? Math.round(Number(callMeta.voice_score))
        : null;

  const voiceRubric =
    voiceFromAnalysis ??
    callMeta?.voice_rubric ??
    callMeta?.rubric?._meta?.voice ??
    null;

  const reviewTags =
    callMeta?.review_tags ??
    callMeta?.rubric?.review_tags ??
    null;

  return {
    voiceScore: directVoiceScore,
    voiceRubric,
    reviewTags,
  };
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Always hit the API via our proxy so x-user-id is injected from Supabase cookies
const api = (path: string) => `/api/proxy${path}`;

// Local proxy-bound getCall to avoid any direct API_BASE usage inside lib/api
async function getCallViaProxy(callId: string) {
  return await fetchJsonWithRetry<any>(api(`/v1/calls/${encodeURIComponent(callId)}`), { cache: 'no-store' });
}

function formatCallDuration(meta: any): string {
  if (!meta) return "—";

  // Prefer ms if present
  if (typeof meta.duration_ms === "number" && meta.duration_ms > 0) {
    const totalSeconds = Math.floor(meta.duration_ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }

  if (typeof meta.duration_sec === "number" && meta.duration_sec > 0) {
    const minutes = Math.floor(meta.duration_sec / 60);
    const seconds = meta.duration_sec % 60;
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }

  return "—";
}

function statusDotColour(status: string | undefined | null): string {
  if (!status) return "bg-neutral-500";
  const s = status.toLowerCase();
  if (s === "failed" || s === "error") return "bg-red-400";
  if (s === "processing" || s === "queued" || s === "running") return "bg-amber-300";
  if (s === "scored" || s === "processed" || s === "completed") return "bg-emerald-400";
  return "bg-neutral-500";
}

function renderTranscriptText(meta: any): string | null {
  const raw =
    meta?.transcript ??
    meta?.transcript_text ??
    meta?.rubric?._meta?.transcript ??
    null;

  const text = typeof raw === "string" ? raw.trim() : "";
  return text.length ? text : null;
}

export default function CallPage() {
  const { id } = useParams<{ id: string }>();
  const callId = (id ?? '').toString();

  const toast = useToast();

  // url controls for crm panel
  const searchParams = useSearchParams();
  const assignmentId =
    searchParams.get("assignmentId") || searchParams.get("assignment") || undefined;
  const router = useRouter();
  const pathname = usePathname();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoCompletedRef = useRef(false);


  // Manager review (Sprint 4 Day 91; read state Day 96)
  const [managerReviewed, setManagerReviewed] = useState(false);
  const [markingReviewed, setMarkingReviewed] = useState(false);
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState<string | null>(null);

  const markCallReviewed = useCallback(async () => {
    if (!callId || markingReviewed || managerReviewed) return;
    setMarkingReviewed(true);
    try {
      const res = await proxyFetch(`/v1/calls/${encodeURIComponent(callId)}/manager-review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok) {
        setManagerReviewed(true);
        setReviewedAt(data?.review?.createdAt || new Date().toISOString());
        setReviewNote(data?.review?.note ?? null);
        toast("Call marked as reviewed.");
      } else if (data?.error === "migration_required") {
        toast(data?.hint || "Review history migration required.");
      } else {
        toast("Could not mark this call as reviewed.");
      }
    } catch {
      toast("Could not mark this call as reviewed.");
    } finally {
      setMarkingReviewed(false);
    }
  }, [callId, markingReviewed, managerReviewed, toast]);

  // Assign coaching from this call (Sprint 4 Day 92)
  const [assigningCoaching, setAssigningCoaching] = useState(false);
  const [coachingAssigned, setCoachingAssigned] = useState(false);

  // Whisperer moments linked to this call (Tier 2B Day 115)
  const [whispererMoments, setWhispererMoments] = useState<any[]>([]);
  const [whispererMomentsError, setWhispererMomentsError] = useState(false);
  useEffect(() => {
    if (!callId) return;
    let alive = true;
    (async () => {
      try {
        const res = await proxyFetch(`/v1/calls/${encodeURIComponent(callId)}/whisperer-triggers`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (data?.ok && Array.isArray(data.items)) setWhispererMoments(data.items);
        else setWhispererMomentsError(true);
      } catch {
        if (alive) setWhispererMomentsError(true);
      }
    })();
    return () => { alive = false; };
  }, [callId]);

  // Day 122: mark a Whisperer suggestion's usefulness from call review.
  const [momentOutcomeNotice, setMomentOutcomeNotice] = useState<string | null>(null);
  const [momentOutcomeBusyId, setMomentOutcomeBusyId] = useState<string | null>(null);
  const markMomentOutcome = useCallback(async (triggerId: string, outcome: "used" | "ignored" | "not_relevant") => {
    const NOTICE: Record<string, string> = { used: "Marked used.", ignored: "Marked ignored.", not_relevant: "Marked not relevant." };
    setMomentOutcomeBusyId(triggerId);
    setMomentOutcomeNotice(null);
    const prev = whispererMoments.find((m) => m.triggerId === triggerId)?.suggestionOutcome ?? null;
    setWhispererMoments((list) => list.map((m) => (m.triggerId === triggerId ? { ...m, suggestionOutcome: outcome } : m)));
    try {
      const res = await proxyFetch(`/v1/whisperer/triggers/${encodeURIComponent(triggerId)}/outcome`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ outcome }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok) {
        setMomentOutcomeNotice(NOTICE[outcome]);
      } else {
        setWhispererMoments((list) => list.map((m) => (m.triggerId === triggerId ? { ...m, suggestionOutcome: prev } : m)));
        setMomentOutcomeNotice("Could not update suggestion outcome.");
      }
    } catch {
      setWhispererMoments((list) => list.map((m) => (m.triggerId === triggerId ? { ...m, suggestionOutcome: prev } : m)));
      setMomentOutcomeNotice("Could not update suggestion outcome.");
    } finally {
      setMomentOutcomeBusyId(null);
    }
  }, [whispererMoments]);

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

  // Score history
  const [history, setHistory] = useState<ScoreHistoryItem[]>([]);
  const [histErr, setHistErr] = useState<string | null>(null);
  const [postAction, setPostAction] = useState<null | {
    strongest: string;
    improve: string;
    xpGained: number;
  }>(null);

  // Rep Momentum Chain v1 — Call Reviews
  const momentumNext = useMemo(() => {
    if (!postAction) return null;

    // extract weakest focus label (string-safe)
    const focus = postAction.improve?.replace(/^Improve your\s+/i, "") || null;

    return {
      focus,
      difficulty: "normal",
    };
  }, [postAction]);

  const [assignee, setAssignee] = useState<string>("");
  const [quickDrill, setQuickDrill] = useState<string>("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [managerCheckDone, setManagerCheckDone] = useState(false);
  const [callMissing, setCallMissing] = useState(false);
  const [pinsErr, setPinsErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        await getAdminConfig();
        if (!alive) return;
        setIsManager(true);
      } catch {
        if (!alive) return;
        setIsManager(false);
      } finally {
        if (!alive) return;
        setManagerCheckDone(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Day 96: load manager review state so Reviewed ✓ survives refresh
  useEffect(() => {
    if (!callId || !managerCheckDone || !isManager) return;
    let alive = true;
    (async () => {
      try {
        const res = await proxyFetch(`/v1/calls/${encodeURIComponent(callId)}/manager-review`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!alive || !data?.ok) return;
        if (data.reviewed && data.review) {
          setManagerReviewed(true);
          setReviewedAt(data.review.createdAt || null);
          setReviewNote(data.review.note ?? null);
        }
      } catch {
        // best-effort — the Mark Reviewed action still works without it
      }
    })();
    return () => { alive = false; };
  }, [callId, managerCheckDone, isManager]);

  // Active section for sticky nav
  const [activeSection, setActiveSection] = useState('summary');

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
  // Guard against stale / out-of-order CRM link fetches (prevents unlink flicker)
  const linkFetchSeqRef = useRef(0);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);

  // CRM drawer state
  const [crmOpen, setCrmOpen] = useState(false);
  const crmRequested = String(searchParams?.get("crm") || "").trim() === "1";
  const [crmAutoOpened, setCrmAutoOpened] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [accountQ, setAccountQ] = useState("");
  const [accountResults, setAccountResults] = useState<Account[]>([]);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [idx, setIdx] = useState(0); // highlighted result index for ↑/↓
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // debounce timer
  const searchAbortRef = useRef<AbortController | null>(null); // cancel in-flight request
  const accountSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accountSearchAbortRef = useRef<AbortController | null>(null);

  // Coach drawer state (deep-linkable via ?panel=coach&assign=1)
  const [coachOpen, setCoachOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false); // if true, show Assign Drill section


  // --- ADD: Assign form state ---
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [drillId, setDrillId] = useState("intro-basics");
  const [notes, setNotes] = useState("");
  const coachAssigneeAutofilledRef = useRef(false);

  const [coachNotes, setCoachNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const assignmentCount = assignments.length;
  const loadAssignments = useCallback(async () => {
    const r = await fetchJsonWithRetry(`/api/proxy/v1/coach/assignments?callId=${callId}`);
    setAssignments(r.items || []);
  }, [callId]);
  useEffect(() => { if (coachOpen) loadAssignments().catch(() => { }); }, [coachOpen, loadAssignments]);

  // Assign coaching from this call (Sprint 4 Day 92) — rule-based pre-fill,
  // creates via the existing POST /v1/assignments engine. The assignment
  // appears in /coaching Open Coaching, not the legacy coach panel above.
  const assignCoachingFromCall = useCallback(async () => {
    if (!callId || assigningCoaching) return;

    const repId = String(callMeta?.user_id || "");
    if (!repId) {
      toast("Could not assign coaching because this call is not linked to a rep.");
      return;
    }

    const overallScore =
      typeof callMeta?.score_overall === "number" ? Math.round(Number(callMeta.score_overall)) : null;

    // Weakest stage from analysis_json (intro/discovery/pitch/objection/close),
    // with the rubric column as fallback for seeded/demo rows.
    const stages = callMeta?.analysis_json?.stages ?? callMeta?.rubric?.stages ?? null;
    const SKILLS: Array<{ key: string; label: string; title: string }> = [
      { key: "intro", label: "Intro", title: "Opening Script Practice" },
      { key: "discovery", label: "Discovery", title: "Discovery Drill" },
      { key: "pitch", label: "Pitch", title: "Pitch Clarity Drill" },
      { key: "objection", label: "Objection", title: "Objection Handling Drill" },
      { key: "close", label: "Close", title: "Closing Drill" },
    ];
    let weakest: { key: string; label: string; title: string } | null = null;
    let weakestScore = Number.POSITIVE_INFINITY;
    let anyStageBelow40 = false;
    let anyStageBelow50 = false;
    for (const skill of SKILLS) {
      const s = Number((stages as any)?.[skill.key]?.score);
      if (!Number.isFinite(s)) continue;
      if (s < 40) anyStageBelow40 = true;
      if (s < 50) anyStageBelow50 = true;
      if (s < weakestScore) {
        weakestScore = s;
        weakest = skill;
      }
    }

    const title = weakest ? weakest.title : "Call Review Coaching";
    const noteParts: string[] = [];
    if (overallScore != null && overallScore < 70) {
      noteParts.push("This call was flagged because the overall score was below target.");
    }
    if (weakest) noteParts.push(`Focus on the weakest skill: ${weakest.label}.`);
    if (!noteParts.length) noteParts.push("Review this call and complete coaching notes.");
    noteParts.push("Review the call and complete the recommended practice.");

    const priority =
      (overallScore != null && overallScore < 50) || anyStageBelow40
        ? "high"
        : (overallScore != null && overallScore < 70) || anyStageBelow50
          ? "medium"
          : "low";

    setAssigningCoaching(true);
    try {
      const res = await proxyFetch("/v1/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rep_id: repId,
          type: "call_review",
          target_id: callId,
          title,
          due_at: new Date(Date.now() + 3 * 86400000).toISOString(),
          source: "manager_review",
          notes: noteParts.join(" "),
          meta: {
            assignment_origin: "manager_review",
            flag_section: weakest?.key ?? "general",
            score_before: overallScore,
            priority,
            source_call_id: callId,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok && data?.skipped) {
        toast("Not assigned — this rep already has an active drill for this skill.");
      } else if (data?.ok) {
        setCoachingAssigned(true);
        toast("Coaching assigned.");
      } else {
        toast("Could not assign coaching.");
      }
    } catch {
      toast("Could not assign coaching.");
    } finally {
      setAssigningCoaching(false);
    }
  }, [callId, assigningCoaching, callMeta, toast]);

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
        body: JSON.stringify({
          callId,
          assigneeUserId,
          drillId,
          notes,
          ...(assignmentId ? { assignmentId } : {}),
        }),
      });
      await loadAssignments().catch(() => { });
      toast("Assignment saved.");
    } catch (e: any) {
      setAssignError(e?.message || "Failed to save assignment.");
    } finally {
      setAssignSaving(false);
    }
  }, [callId, assigneeUserId, drillId, notes, loadAssignments, toast, assignmentId]);


  function pickBestWorstFromScores(obj: any) {
    if (!obj || typeof obj !== "object") return null;

    const keys = ["intro", "discovery", "pitch", "objection", "close", "overall"];
    const pairs: { k: string; v: number }[] = [];

    for (const k of keys) {
      const v = (obj as any)[k];
      if (typeof v === "number" && Number.isFinite(v)) pairs.push({ k, v });
    }

    if (!pairs.length) return null;

    pairs.sort((a, b) => b.v - a.v);
    const best = pairs[0];
    const worst = pairs[pairs.length - 1];

    const label = (k: string) =>
      k === "intro"
        ? "Opening"
        : k === "discovery"
          ? "Discovery"
          : k === "pitch"
            ? "Pitch"
            : k === "objection"
              ? "Objection handling"
              : k === "close"
                ? "Close"
                : "Overall";

    return { best: label(best.k), worst: label(worst.k) };
  }

  function buildCallPostAction(payload: any) {
    const xp =
      typeof payload?.xp_awarded_total === "number"
        ? payload.xp_awarded_total
        : typeof payload?.xp_awarded === "number"
          ? payload.xp_awarded
          : 0;

    const scores =
      payload?.call?.scores ||
      payload?.call?.score_breakdown ||
      payload?.call?.rubric ||
      payload?.scores ||
      null;

    const bw = pickBestWorstFromScores(scores);

    const strongest = bw?.best || "Structure + momentum";
    const improve = bw?.worst
      ? `Improve your ${bw.worst.toLowerCase()}`
      : "Ask 2 more discovery questions before pitching";

    return { strongest, improve, xpGained: xp };
  }


  useEffect(() => {
    if (!crmRequested) return;
    if (!callId) return;
    if (crmAutoOpened) return;
    setCrmOpen(true);
    setCrmAutoOpened(true);
  }, [crmRequested, callId, crmAutoOpened]);


  // ------- Data loaders -------

  // Call (once)
  useEffect(() => {
    if (!callId) return;
    setPostAction(null);
    let alive = true;

    (async () => {
      try {
        setLoadingCall(true);
        const res = await getCallViaProxy(callId);
        if (!alive) return;

        setCallMeta(res.call);
        setCallMissing(false);
        if (res?.call?.signedAudioUrl) {
          setAudioUrl(res.call.signedAudioUrl);
        }
        setErr(null);
      } catch (e: any) {
        if (!alive) return;
        const msg = String(e?.message || "");
        if (msg.toLowerCase().includes("not_found") || msg.includes("404")) {
          setCallMissing(true);
          setErr("Call not found or no longer available.");
        } else {
          setErr(e?.message ?? 'Failed to load call');
        }
      } finally {
        if (alive) setLoadingCall(false);
      }
    })();

    return () => { alive = false; };
  }, [callId]);

  // Load coach assignments for this call (initial) + refresh when coach panel opens
  useEffect(() => {
    if (!callId) return;
    let cancelled = false;
    (async () => {
      try {
        setAssignmentsLoading(true);
        await loadAssignments();
      } catch {
        // ignore
      } finally {
        if (!cancelled) setAssignmentsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [callId, loadAssignments]);

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
        const r = await proxyFetch("/v1/team/users?limit=100", { cache: "no-store" });
        const j = await r.json();
        if (!cancelled && j?.ok && Array.isArray(j.items)) setUsers(j.items);
      } catch { }
      finally { if (!cancelled) setUsersLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (coachAssigneeAutofilledRef.current) return;
    if (!callMeta?.user_id) return;
    if (!Array.isArray(users) || users.length === 0) return;

    const ownerId = String(callMeta.user_id);
    const hasOwnerInUsers = users.some((u) => String(u.id) === ownerId);
    if (!hasOwnerInUsers) return;

    if (!assigneeUserId) setAssigneeUserId(ownerId);
    if (!assignee) setAssignee(ownerId);
    coachAssigneeAutofilledRef.current = true;
  }, [callMeta?.user_id, users, assigneeUserId, assignee]);

  // --- ADD: deleteAssignment helper ---
  async function deleteAssignment(id: string) {
    try {
      const r = await proxyFetch(`/v1/coach/assignments/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Delete failed");
      setAssignments((xs) => xs.filter((x) => x.id !== id));
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
          setAudioUrl(r.url);
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
    if (callMissing) return;
    let cancelled = false;
    let timer: any = null;

    async function tick() {
      try {
        const res = await getCallViaProxy(callId);
        if (cancelled) return;
        setCallMeta(res.call);
        setCallMissing(false);

        if (res?.call?.signedAudioUrl) {
          setAudioUrl((prev) =>
            prev !== res.call.signedAudioUrl ? res.call.signedAudioUrl : prev
          );
        }

        if (res.call?.status !== 'scored') {
          timer = setTimeout(tick, 1500);
        } else {
          // refresh history when it becomes scored
          try {
            const h = await getScoreHistory(callId, 8);
            if (!cancelled) setHistory(h);
            // Day 23: Rep Feedback Loop — build post-action summary
            setPostAction(buildCallPostAction({ call: res.call }));
          } catch (e: any) {
            if (!cancelled) setHistErr(e?.message || "Failed to load score history");
          }
          // --- Auto-complete assignment on call review score (momentum loop)
          if (!autoCompletedRef.current && assignmentId) {
            try {
              autoCompletedRef.current = true;
              await fetchJsonWithRetry(`/api/proxy/v1/assignments/${encodeURIComponent(assignmentId)}/complete`, {
                method: 'PATCH',
              });
              toast('Assignment completed via call review ✓');
            } catch (e) {
              console.error('auto-complete assignment failed', e);
            }
          }
        }
      } catch (e: any) {
        const msg = String(e?.message || "").toLowerCase();
        const isNotFound = msg.includes("not_found") || msg.includes("404");

        if (isNotFound) {
          if (!cancelled) {
            setCallMissing(true);
            setErr("Call not found or no longer available.");
          }
          return;
        }

        timer = setTimeout(tick, 2000);
      }
    }

    if (!callMissing && (!callMeta || callMeta.status !== 'scored')) {
      tick();
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, callMeta?.status, callMissing]);

  // Pins (initial)
  async function refreshPins() {
    setPinsErr(null);
    // Demo calls may not have real pins; fail-soft.
    if (String(callId).startsWith("demo-")) {
      setPins([]);
      setPinsErr(null);
      return;
    }
    const res = await listPins(callId);
    setPins((res?.pins ?? []).sort((a: Pin, b: Pin) => a.t - b.t));
  }
  useEffect(() => {
    if (!callId) return;
    let alive = true;
    setLoadingPins(true);
    refreshPins()
      .catch(() => {
        // Load failures (including 403 on calls the viewer can't pin) fall
        // back to the calm empty state — never surface raw API error strings.
        if (!alive) return;
        setPins([]);
        setPinsErr(null);
      })
      .finally(() => alive && setLoadingPins(false));
    return () => { alive = false; };
  }, [callId]);

  // CRM link info (single source of truth: proxy GET)
  async function loadLinkInfo() {
    if (!callId) return;

    // bump sequence so only the latest response can win
    const seq = ++linkFetchSeqRef.current;

    try {
      const j: any = await fetchJsonWithRetry(
        `/api/proxy/v1/crm/link?callId=${encodeURIComponent(callId)}`,
        { cache: "no-store" }
      );

      // ignore out-of-order responses
      if (seq !== linkFetchSeqRef.current) return;

      if (!j || j?.ok === false) {
        setLinkInfo(null);
        return;
      }

      setLinkInfo({
        contact: j?.contact ?? null,
        account: j?.account ?? null,
        opportunity: j?.opportunity ?? null,
      });
    } catch {
      // ignore out-of-order errors too
      if (seq !== linkFetchSeqRef.current) return;
      setLinkInfo(null);
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
    const p = searchParams.get("panel");
    const isAssign = searchParams.get("assign") === "1";
    setCrmOpen(p === "crm" || (crmRequested && !crmAutoOpened));
    setCoachOpen(p === "coach");
    setAssignOpen(p === "coach" && isAssign);
  }, [searchParams, crmRequested]);
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
  }, [audioUrl]);

  // Player: resign URL if it errors (TTL expiry)
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onError = async () => {
      try {
        const r = await fetchJsonWithRetry<any>(`/api/proxy/v1/calls/${callId}/signed-audio`, { cache: 'no-store' });
        if (r?.ok && r.url) {
          setAudioUrl(r.url);
        }
      } catch { /* ignore */ }
    };

    el.addEventListener('error', onError);
    return () => el.removeEventListener('error', onError);
  }, [callId, audioUrl]);

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
    } catch {
      setPinsErr('Could not add a pinned note to this call.');
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(id: string) {
    try {
      await deletePin(id);
      setPins((p) => p.filter((x) => x.id !== id));
    } catch {
      setPinsErr('Could not remove that pinned note.');
    }
  }

  // --- CRM: link by email (single source of truth: proxy POST) ---
  async function onLinkByEmail() {
    try {
      const email = String(linkEmail || "").trim();
      if (!email || !email.includes("@")) return;

      setLinkLoading(true);
      setLinkMsg(null);

      const resp: any = await fetchJsonWithRetry(`/api/proxy/v1/crm/link-call`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callId, email }),
      });

      if (resp?.ok === false) {
        throw new Error(resp?.error || "Link failed");
      }

      await loadLinkInfo();
      setLinkMsg("Linked ✓");
      toast("Linked ✓");
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
    const prev = linkInfo;

    // Invalidate any in-flight link fetch so it can't overwrite our optimistic state.
    // The next call to loadLinkInfo() will bump the seq again and become the winner.
    linkFetchSeqRef.current++;

    try {
      // Optimistic UI clear
      setLinkInfo((cur) => {
        if (!cur) return cur;
        if (target === "contact") {
          return { ...cur, contact: null, opportunity: null };
        }
        return { ...cur, account: null, opportunity: null };
      });

      const payload: any = {
        callId,
        target,
        ...(target === "contact" ? { contact_id: null, contactId: null } : {}),
        ...(target === "account" ? { account_id: null, accountId: null } : {}),
        opportunity_id: null,
        opportunityId: null,
      };

      const resp: any = await fetchJsonWithRetry(`/api/proxy/v1/crm/unlink`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (resp?.ok === false) {
        throw new Error(resp?.error || "Unlink failed");
      }

      // Source of truth refresh (guarded against stale responses)
      await loadLinkInfo();

      toast(`${target} unlinked ✓`);
    } catch (e: any) {
      setLinkInfo(prev ?? null);
      toast(e?.message || "Unlink failed");
    }
  }

  // --- CRM: open linked entities ---
  const openContact = useCallback(() => {
    const cid = linkInfo?.contact?.id;
    if (!cid) return;
    router.push(`/crm/contacts/${encodeURIComponent(String(cid))}`);
  }, [linkInfo?.contact?.id, router]);

  const openAccount = useCallback(() => {
    const aid = linkInfo?.account?.id;
    if (!aid) return;
    router.push(`/crm/accounts/${encodeURIComponent(String(aid))}`);
  }, [linkInfo?.account?.id, router]);

  // contact search + link (by selecting a contact, we use their email)
  function debouncedSearchContacts(term: string) {
    setQ(term);
    setSearchErr(null);

    // clear previous debounce + abort previous in-flight request
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchAbortRef.current?.abort();

    const cleaned = term.trim();

    // Guard: don’t search for 0–1 chars (prevents spam + feels snappier)
    if (cleaned.length < 2) {
      setResults([]);
      setIdx(0);
      return;
    }

    // debounce 250ms
    searchTimerRef.current = setTimeout(async () => {
      const ac = new AbortController();
      searchAbortRef.current = ac;
      try {
        const r = await proxyFetch(
          `/v1/crm/contacts?query=${encodeURIComponent(cleaned)}&limit=12`,
          { signal: ac.signal, cache: "no-store" }
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
      const email = String(c?.email ?? "").trim();
      if (!email) throw new Error("Selected contact has no email");

      // Source of truth: direct proxy POST to the backend endpoint
      const resp: any = await fetchJsonWithRetry(`/api/proxy/v1/crm/link-call`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callId, email }),
      });

      // If fetchJsonWithRetry doesn't throw but returns ok:false
      if (resp?.ok === false) {
        throw new Error(resp?.error || "Link failed");
      }

      toast("Linked ✓");
      await loadLinkInfo();

      // Close results list / reset search UI
      setQ("");
      setResults([]);
      setIdx(0);
    } catch (e: any) {
      setSearchErr(e?.message || "Link failed");
    } finally {
      setBusy(false);
    }
  }

  function debouncedSearchAccounts(term: string) {
    setAccountQ(term);
    setSearchErr(null);

    if (accountSearchTimerRef.current) clearTimeout(accountSearchTimerRef.current);
    accountSearchAbortRef.current?.abort();

    const cleaned = term.trim();
    if (cleaned.length < 2) {
      setAccountResults([]);
      return;
    }

    accountSearchTimerRef.current = setTimeout(async () => {
      const ac = new AbortController();
      accountSearchAbortRef.current = ac;
      try {
        const r = await proxyFetch(
          `/v1/crm/accounts?query=${encodeURIComponent(cleaned)}&limit=12`,
          { signal: ac.signal, cache: "no-store" }
        );
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${r.status}`);
        setAccountResults(j.items || []);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setSearchErr(e?.message || "Account search failed");
      }
    }, 250);
  }

  async function linkAccountId(accountId: string) {
    setBusy(true);
    setSearchErr(null);

    try {
      const resp: any = await fetchJsonWithRetry(`/api/proxy/v1/crm/link-call`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callId, accountId, account_id: accountId }),
      });

      if (resp?.ok === false) {
        throw new Error(resp?.error || "Account link failed");
      }

      toast("Account linked ✓");
      await loadLinkInfo();
      setAccountQ("");
      setAccountResults([]);
    } catch (e: any) {
      setSearchErr(e?.message || "Account link failed");
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
    setCrmOpen(false);
    setCrmAutoOpened(true);

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

  // Track active section as user scrolls
  useEffect(() => {
    const ids = ['summary', 'review', 'transcript', 'player', 'crm', 'coach'];
    const observers = ids.map((id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(id); },
        { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
      );
      obs.observe(el);
      return obs;
    });
    return () => observers.forEach((o) => o?.disconnect());
  }, []);

  const overall: number | null =
    typeof callMeta?.score_overall === 'number'
      ? Math.round(Number(callMeta.score_overall))
      : null;

  const reviewBot = useMemo(() => {
    const { voiceScore, voiceRubric, reviewTags } = getVoiceData(callMeta);

    const fillerCount =
      typeof reviewTags?.filler_count === "number"
        ? Number(reviewTags.filler_count)
        : 0;

    const fillerWords = Array.isArray(reviewTags?.filler_words)
      ? reviewTags.filler_words.filter(Boolean)
      : [];

    const weakClose = Boolean(reviewTags?.weak_close);

    const rubricRows = [
      { key: "clarity", label: "Clarity", value: typeof voiceRubric?.clarity === "number" ? Math.round(Number(voiceRubric.clarity)) : null },
      { key: "confidence", label: "Confidence", value: typeof voiceRubric?.confidence === "number" ? Math.round(Number(voiceRubric.confidence)) : null },
      { key: "filler_density", label: "Filler density", value: typeof voiceRubric?.filler_density === "number" ? Math.round(Number(voiceRubric.filler_density)) : null },
      { key: "pace", label: "Pace", value: typeof voiceRubric?.pace === "number" ? Math.round(Number(voiceRubric.pace)) : null },
      { key: "overall", label: "Overall", value: typeof voiceRubric?.overall === "number" ? Math.round(Number(voiceRubric.overall)) : null },
    ].filter((x) => x.value !== null);

    return {
      voiceScore,
      fillerCount,
      fillerWords,
      weakClose,
      rubricRows,
      hasData:
        voiceScore !== null ||
        fillerCount > 0 ||
        fillerWords.length > 0 ||
        rubricRows.length > 0 ||
        reviewTags?.weak_close === true,
    };
  }, [callMeta]);

  // Day 215 — score reasoning is derived from the existing scored rubric only
  // (rubric column with analysis_json.stages fallback). No new data, no new scoring.
  const rubricStages = useMemo(() => {
    const rubric = callMeta?.rubric ?? null;
    const analysisStages = callMeta?.analysis_json?.stages ?? null;
    const rows: { key: string; label: string; score: number | null; notes: string | null }[] = [];
    for (const key of ["intro", "discovery", "pitch", "objection", "close"]) {
      const sec = (rubric as any)?.[key] ?? (analysisStages as any)?.[key] ?? null;
      if (!sec || typeof sec !== "object") continue;
      const score = typeof sec.score === "number" && Number.isFinite(sec.score) ? Math.round(Number(sec.score)) : null;
      const notes = typeof sec.notes === "string" && sec.notes.trim() ? sec.notes.trim() : null;
      if (score === null && !notes) continue;
      rows.push({ key, label: STAGE_LABELS[key] ?? key, score, notes });
    }
    return rows;
  }, [callMeta]);

  const scoredStages = useMemo(() => rubricStages.filter((r) => r.score !== null), [rubricStages]);
  const strongestStage = useMemo(
    () => (scoredStages.length ? scoredStages.reduce((a, b) => ((b.score as number) > (a.score as number) ? b : a)) : null),
    [scoredStages]
  );
  const weakestStage = useMemo(
    () => (scoredStages.length ? scoredStages.reduce((a, b) => ((b.score as number) < (a.score as number) ? b : a)) : null),
    [scoredStages]
  );

  function formatContactName(c: any): string | null {
    if (!c) return null;
    const first = String(c?.first_name ?? c?.firstName ?? "").trim();
    const last = String(c?.last_name ?? c?.lastName ?? "").trim();
    const full = [first, last].filter(Boolean).join(" ").trim();
    return full || String(c?.email ?? "").trim() || String(c?.id ?? "").trim() || null;
  }
  const contactChip = formatContactName(linkInfo?.contact);
  const accountChip = linkInfo?.account
    ? (linkInfo.account.name || linkInfo.account.domain || linkInfo.account.id)
    : null;

  const opportunityChip = linkInfo?.opportunity
    ? (linkInfo.opportunity.name || linkInfo.opportunity.id)
    : null;

  const durationLabel = formatCallDuration(callMeta);
  const flags: string[] =
    Array.isArray(callMeta?.flags) ? (callMeta.flags as string[]).filter(Boolean) : [];

  // Day 172 — human header title: never show a raw filename or UUID up top.
  const headerStages = callMeta?.analysis_json?.stages ?? callMeta?.rubric?.stages ?? null;
  let headerWeakest: string | null = null;
  {
    let lowest = Number.POSITIVE_INFINITY;
    for (const [key, label] of [
      ["intro", "Intro"],
      ["discovery", "Discovery"],
      ["pitch", "Pitch"],
      ["objection", "Objection"],
      ["close", "Close"],
    ] as const) {
      const s = Number((headerStages as any)?.[key]?.score);
      if (Number.isFinite(s) && s < lowest) {
        lowest = s;
        headerWeakest = label;
      }
    }
  }
  const callDisplayTitle = formatCallDisplayTitle({
    title: callMeta?.filename,
    repName: callMeta?.rep_name,
    weakestSkill: headerWeakest,
  });
  const rawFileLabel =
    callMeta?.filename && isRawCallLabel(String(callMeta.filename))
      ? String(callMeta.filename)
      : null;

  const transcriptText = renderTranscriptText(callMeta);
  const transcriptSegments = callMeta?.analysis_json?.transcript?.segments ?? null;
  const analysisMoments = Array.isArray(callMeta?.analysis_json?.moments)
    ? callMeta.analysis_json.moments
    : [];

  return (
    <AuthGate>
      <main className="mx-auto w-full max-w-[1400px] px-6 py-6 lg:px-8 space-y-6">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500 mb-1">Call review</div>
            <h1 className="text-xl font-semibold break-words flex items-center gap-3">
              {loadingCall ? (
                <span className="inline-block h-6 w-48 rounded bg-white/10 animate-pulse" />
              ) : (
                <>
                  {callDisplayTitle}
                  {overall != null ? (
                    <ScorePill score={overall} />
                  ) : (
                    <span className="text-sm px-2 py-1 rounded border bg-zinc-600/20 text-zinc-300">—</span>
                  )}
                </>
              )}
            </h1>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {trend && trend.length > 1 && (
              <div className="flex items-center gap-1 text-xs text-neutral-500">
                <span>Trend</span>
                <div className="text-emerald-400"><ScoreSparkline scores={trend} /></div>
              </div>
            )}
            <CopyLinkButton href={`/calls/${callId}?panel=crm`} size="md" />
            <Button onClick={openCrm}>
              Link CRM
            </Button>
            {managerCheckDone && isManager && (
              <Button onClick={() => openCoach(true)}>
                Assign Drill {assignmentCount > 0 && <span className="ml-1 opacity-60">({assignmentCount})</span>}
              </Button>
            )}
            {process.env.NEXT_PUBLIC_SHOW_ADMIN === "true" && (
              <a
                href={`/api/proxy/v1/admin/preview-slack?callId=${encodeURIComponent(callId)}&overall=${overall ?? 80}`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses()}
                title="Preview Slack payload"
              >
                Preview Slack
              </a>
            )}
          </div>
        </div>

        {/* Section nav — sticky */}
        <div className="sticky top-0 z-10 -mx-6 px-6 lg:-mx-8 lg:px-8 bg-[#060609]/90 backdrop-blur-md border-b border-neutral-800/80">
          <div className="flex items-center gap-1 overflow-x-auto py-2">
            {[
              { id: "summary", label: "Summary" },
              { id: "review", label: "Review" },
              { id: "transcript", label: "Transcript" },
              { id: "player", label: "Player" },
              { id: "crm", label: "CRM" },
              { id: "coach", label: "Coach" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth" })}
                className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                  activeSection === item.id
                    ? "bg-indigo-500/20 text-indigo-200"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60"
                }`}
              >
                {item.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1 text-[11px] text-neutral-600 whitespace-nowrap shrink-0 pl-2">
              <kbd className="px-1 py-0.5 border border-neutral-800 rounded text-[10px]">c</kbd>
              <span className="mr-2">CRM</span>
              <kbd className="px-1 py-0.5 border border-neutral-800 rounded text-[10px]">a</kbd>
              <span>Coach</span>
            </div>
          </div>
        </div>

        {/* Processing status banner */}
        {callMeta && callMeta.status !== 'scored' && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 shadow-md shadow-black/20 px-4 py-3 text-sm flex items-center gap-2">
            {callMeta.status !== "failed" && (
              <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-indigo-400 animate-pulse" />
            )}
            {callMeta.status === "queued" && (
              <span>Transcribing call…</span>
            )}

            {callMeta.status === "processing" && (
              <span>Processing transcript…</span>
            )}

            {callMeta.status === "processed" && (
              <span>Transcript ready. Scoring…</span>
            )}

            {callMeta.status === "scoring" && (
              <span>Scoring call…</span>
            )}

            {callMeta.status === "failed" && (
              <span className="text-red-400">Processing failed. Please retry.</span>
            )}

            {!["queued", "processing", "processed", "scoring", "failed"].includes(callMeta.status) && (
              <span>Processing…</span>
            )}
          </div>
        )}


        {/* Call hero — outcome, metadata, score reasoning and next actions */}
        <section id="summary" className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 shadow-md shadow-black/20 px-4 py-4 sm:px-5 sm:py-5 space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            {/* Left: score + status + duration */}
            <div className="flex items-center gap-4">
              <div
                className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 text-xl font-semibold tabular-nums ${
                  overall == null
                    ? "border-neutral-700 text-neutral-400"
                    : overall >= 80
                      ? "border-emerald-500/50 text-emerald-300"
                      : overall >= 60
                        ? "border-amber-500/50 text-amber-300"
                        : "border-red-500/50 text-red-300"
                }`}
              >
                {overall != null ? overall : "—"}
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-2 w-2 rounded-full ${statusDotColour(
                      callMeta?.status
                    )}`}
                  />
                  <span className="text-neutral-300 capitalize">
                    {callMeta?.status ?? "queued"}
                  </span>
                </div>
                <div className="text-neutral-400">
                  Duration:{" "}
                  <span className="text-neutral-100">{durationLabel}</span>
                </div>
                {(rubricStages.length > 0 || callMeta?.ai_model) && (
                  <div className="text-xs text-neutral-500">
                    {rubricStages.length > 0
                      ? `Scored with the Gravix default rubric${callMeta?.ai_model ? ` · ${callMeta.ai_model}` : ""}`
                      : `Scored by ${callMeta.ai_model}`}
                  </div>
                )}
                {rawFileLabel && (
                  <div className="text-xs text-neutral-600 truncate max-w-[16rem]" title={rawFileLabel}>
                    File: {rawFileLabel}
                  </div>
                )}
              </div>
            </div>

            {/* Right: summary + flags */}
            <div className="md:max-w-md space-y-2 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
                  Summary
                </div>
                <p className="text-neutral-200">
                  {callMeta?.summary ||
                    "No summary has been generated for this call yet."}
                </p>
              </div>

              {managerReviewed && reviewNote && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                  <div className="text-xs uppercase tracking-wide text-emerald-400/80 mb-1">
                    Manager Review Note
                  </div>
                  <p className="text-neutral-200 text-xs leading-relaxed">{reviewNote}</p>
                </div>
              )}

              {flags.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
                    Flags
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {flags.map((flag) => (
                      <span
                        key={flag}
                        className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-0.5 text-[11px] font-medium text-neutral-200"
                      >
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Why this scored — reasoning band from the existing scored rubric */}
          {callMeta?.status === "scored" && (
            <div className="border-t border-neutral-800 pt-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs uppercase tracking-wide text-neutral-500">
                  {overall != null ? `Why this scored ${overall}` : "Score reasoning"}
                </div>
                {scoredStages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => document.getElementById("review")?.scrollIntoView({ behavior: "smooth" })}
                    className="text-xs text-indigo-300 hover:text-indigo-200 underline underline-offset-2"
                  >
                    Open the full review audit
                  </button>
                )}
              </div>
              {scoredStages.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  {strongestStage && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-300">
                      Strongest · {strongestStage.label} {strongestStage.score}
                    </span>
                  )}
                  {weakestStage && weakestStage.key !== strongestStage?.key && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-medium text-amber-300">
                      Weakest · {weakestStage.label} {weakestStage.score}
                    </span>
                  )}
                  {reviewBot.weakClose && (
                    <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-medium text-amber-300">
                      Weak close detected
                    </span>
                  )}
                  {reviewBot.fillerCount > 0 && (
                    <span className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-neutral-300">
                      Fillers · {reviewBot.fillerCount}
                    </span>
                  )}
                  {reviewBot.voiceScore != null && (
                    <span className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-neutral-300">
                      Voice · {reviewBot.voiceScore}
                    </span>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-neutral-500">
                  Stage-by-stage reasoning will appear here once this call has a scored rubric.
                </p>
              )}
            </div>
          )}

          {/* Manager next actions */}
          {managerCheckDone && isManager && callMeta?.status === "scored" && (
            <div className="border-t border-neutral-800 pt-3">
              <div className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Next actions</div>
              <div className="flex items-center gap-2 flex-wrap">
                {managerReviewed ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                    Reviewed ✓
                    {reviewedAt && (
                      <span className="text-emerald-400/70 font-normal">
                        {new Date(reviewedAt).toLocaleDateString("en-GB")}
                      </span>
                    )}
                  </span>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={markCallReviewed}
                    disabled={markingReviewed}
                  >
                    {markingReviewed ? "Marking…" : "Mark Reviewed"}
                  </Button>
                )}
                {coachingAssigned ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                    Coaching assigned ✓
                  </span>
                ) : (
                  <Button
                    onClick={assignCoachingFromCall}
                    disabled={assigningCoaching}
                    className="bg-neutral-900 font-semibold text-neutral-200"
                  >
                    {assigningCoaching ? "Assigning…" : "Assign Coaching"}
                  </Button>
                )}
                <Button onClick={() => openCoach(true)}>Assign Drill</Button>
                <Button onClick={openCrm}>Review CRM link</Button>
              </div>
            </div>
          )}
        </section>

        {/* Review audit — why this call scored the way it did */}
        <section id="review" className="rounded-xl border border-neutral-800 bg-neutral-950 shadow-md shadow-black/20 px-4 py-4 sm:px-5 space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Review audit</div>
              <h2 className="text-lg font-medium text-neutral-100">
                {overall != null ? `Why this call scored ${overall}/100` : "Call review audit"}
              </h2>
            </div>
            {rubricStages.length > 0 && (
              <span className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300">
                Gravix default rubric
              </span>
            )}
          </div>

          {/* Criteria rows from the existing rubric stages */}
          {rubricStages.length > 0 ? (
            <div className="divide-y divide-neutral-800 rounded-xl border border-neutral-800 bg-black/30">
              {rubricStages.map((stage) => {
                const verdict = stage.score !== null ? stageVerdict(stage.score) : null;
                return (
                  <div key={stage.key} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-sm font-medium text-neutral-100">{stage.label}</span>
                        {verdict ? (
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${verdict.chip}`}>
                            {verdict.label}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-400">
                            Not scored
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-neutral-200">
                        {stage.score !== null ? `${stage.score}/100` : "—"}
                      </span>
                    </div>
                    {stage.score !== null && verdict && (
                      <div className="mt-2 h-1.5 w-full rounded-full bg-neutral-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${verdict.bar}`}
                          style={{ width: `${Math.max(2, Math.min(100, stage.score))}%` }}
                        />
                      </div>
                    )}
                    {stage.notes && (
                      <p className="mt-2 text-sm leading-6 text-neutral-400 whitespace-pre-wrap">
                        <span className="text-neutral-500">Evidence: </span>
                        {stage.notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              message="No scored rubric for this call yet."
              sub="Stage-by-stage reasoning and evidence appear here once scoring completes."
            />
          )}

          {/* Voice Personality Score — supporting signal */}
          <div className="rounded-xl border border-neutral-800 bg-black/30 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Supporting signal</div>
                <h3 className="text-sm font-medium text-neutral-100">Voice Personality Score</h3>
              </div>
              {reviewBot.voiceScore != null ? (
                <ScorePill score={reviewBot.voiceScore} className="text-xs px-2 py-1" />
              ) : (
                <span className="text-xs px-2 py-1 rounded border bg-zinc-600/20 text-zinc-300">No voice score yet</span>
              )}
            </div>

            {reviewBot.hasData ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <ReviewTagChip
                      ok={!reviewBot.weakClose}
                      label={reviewBot.weakClose ? "Weak close detected" : "Close looks healthy"}
                    />
                    <span className="inline-flex items-center rounded-full border border-neutral-700 px-2.5 py-1 text-xs text-neutral-200">
                      Filler count: {reviewBot.fillerCount}
                    </span>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Filler words found</div>
                    {reviewBot.fillerWords.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {reviewBot.fillerWords.map((word: string) => (
                          <span
                            key={word}
                            className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-200"
                          >
                            {word}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-neutral-400">No filler words tagged on this review.</div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
                  <div className="text-xs uppercase tracking-wide text-neutral-500 mb-3">Voice rubric</div>
                  {reviewBot.rubricRows.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {reviewBot.rubricRows.map((item) => (
                        <div
                          key={item.key}
                          className="min-w-[110px] rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2"
                        >
                          <div className="text-[11px] uppercase tracking-wide text-neutral-500">{item.label}</div>
                          <div className="mt-1 text-lg font-semibold text-neutral-100">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-neutral-400">Voice breakdown will appear once a scored review includes clarity, confidence, filler density, and pace data.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-neutral-400">
                No voice and delivery breakdown has been generated for this call yet.
              </div>
            )}
          </div>

          {/* Coaching priority — what to practise next */}
          {postAction ? (
            <div className="rounded-xl border border-neutral-800 bg-black/30 p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">
                What to practise next
              </div>

              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
                  <div className="text-neutral-400">Strongest area on this call</div>
                  <div className="mt-1 font-semibold text-neutral-100">
                    {postAction.strongest}
                  </div>
                </div>

                <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
                  <div className="text-neutral-400">Coaching priority</div>
                  <div className="mt-1 font-semibold text-neutral-100">
                    {postAction.improve}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {momentumNext && momentumNext.focus && (
                  <button
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
                    onClick={() => {
                      const params = new URLSearchParams();
                      params.set("focus", momentumNext.focus);
                      params.set("source", "call-review");
                      // Day 178 — the legacy "new" sparring path is not a supported route; /sparring/default
                      // is the launch shortcut that creates a session and redirects into it.
                      window.location.href = `/sparring/default?${params.toString()}`;
                    }}
                  >
                    Practise this next →
                  </button>
                )}

                <a
                  href="/call-library"
                  className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-900"
                >
                  Review another call
                </a>
              </div>
            </div>
          ) : null}
        </section>

        <section id="transcript" className="rounded-xl border border-neutral-800 bg-neutral-950 shadow-md shadow-black/20 px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Transcript</div>
              <h2 className="text-lg font-medium text-neutral-100">Call transcript</h2>
            </div>
            {transcriptText ? (
              <span className="text-xs px-2 py-1 rounded border bg-emerald-600/10 text-emerald-300 border-emerald-500/20">
                Available
              </span>
            ) : (
              <span className="text-xs px-2 py-1 rounded border bg-zinc-600/20 text-zinc-300">
                Not available yet
              </span>
            )}
          </div>

          {analysisMoments.length > 0 && (
            <div className="mt-4 rounded-xl border border-neutral-800 bg-black/30 p-4">
              <div className="mb-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Moments</div>
                <div className="mt-1 text-base font-medium text-neutral-100">Key moments</div>
              </div>
              <div className="mt-3 space-y-2">
                {analysisMoments.map((moment: any, i: number) => {
                  const ts = typeof moment?.timestamp === "number" ? moment.timestamp : null;
                  const type = String(moment?.type || "moment");
                  const text = String(moment?.text || "");
                  const severity = String(moment?.severity || "medium");

                  return (
                    <div
                      key={`${type}-${ts ?? i}-${i}`}
                      className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-neutral-200">
                            {ts !== null ? fmt(ts) : "—"}
                          </span>
                          <span className="capitalize text-neutral-300">{type.replace(/_/g, " ")}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 capitalize ${severity === "high"
                              ? "bg-red-500/10 text-red-300"
                              : severity === "medium"
                                ? "bg-amber-500/10 text-amber-300"
                                : "bg-neutral-800 text-neutral-300"
                              }`}
                          >
                            {severity}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-neutral-200">{text}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {transcriptSegments && Array.isArray(transcriptSegments) && transcriptSegments.length > 0 ? (
            <div className="mt-4 rounded-xl border border-neutral-800 bg-black/30 p-4">
              <div className="mb-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Conversation</div>
                <div className="mt-1 text-base font-medium text-neutral-100">Full transcript</div>
              </div>
              <div className="max-h-[420px] overflow-auto space-y-3">
                {transcriptSegments.map((seg: any, i: number) => {
                  const speaker = seg?.speaker || "Unknown";
                  const text = seg?.text || "";
                  const start = typeof seg?.start_sec === "number" ? seg.start_sec : null;

                  return (
                    <div key={i} className="flex gap-3 text-sm">
                      <div className="w-20 shrink-0 text-neutral-400 underline-offset-2 hover:text-neutral-200">
                        {start !== null ? fmt(start) : ""}
                      </div>

                      <div className="flex-1">
                        <span
                          className={`font-semibold mr-2 ${speaker === "Rep"
                            ? "text-indigo-300"
                            : "text-neutral-300"
                            }`}
                        >
                          {speaker}:
                        </span>
                        <span className="text-neutral-200">{text}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : transcriptText ? (
            <div className="mt-4 rounded-xl border border-neutral-800 bg-black/30 p-4">
              <div className="mb-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Conversation</div>
                <div className="mt-1 text-base font-medium text-neutral-100">Full transcript</div>
              </div>
              <div className="max-h-[420px] overflow-auto">
                <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-200 font-sans">
                  {transcriptText}
                </pre>
              </div>
            </div>
          ) : (
            <EmptyState
              className="mt-2"
              message="No transcript has been generated for this call yet."
              sub="The transcript appears here automatically once processing completes."
            />
          )}
        </section>

        {/* Player */}
        <section id="player">
          <SectionCard eyebrow="Playback" title="Call recording" padded>
            {loadingCall ? (
              <p className="text-sm text-neutral-400">Loading call…</p>
            ) : audioUrl ? (
              <div className="space-y-3">
                <audio ref={audioRef} src={audioUrl} controls className="w-full" />
                {duration > 0 && (
                  <div className="relative h-2 bg-neutral-800 rounded w-full">
                    {pins.map((p) => {
                      const pct = Math.max(0, Math.min(100, (p.t / duration) * 100));
                      return (
                        <button
                          key={p.id}
                          title={`${fmt(p.t)}${p.note ? ' • ' + p.note : ''}`}
                          className="absolute top-0 h-2 w-[2px] bg-indigo-400 hover:h-3 hover:-top-0.5 transition"
                          style={{ left: `${pct}%` }}
                          onClick={() => seek(p.t)}
                          aria-label={`Jump to ${fmt(p.t)}`}
                        />
                      );
                    })}
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm text-neutral-400">Current: <span className="text-neutral-200 tabular-nums">{fmt(t)}</span></div>
                  <div className="ml-auto flex items-center gap-2">
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Optional note…"
                      className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-neutral-500"
                      style={{ minWidth: 220 }}
                    />
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={onCreatePin}
                      disabled={creating}
                    >
                      {creating ? 'Pinning…' : `Pin at ${fmt(t)}`}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                message="No audio available for this call."
                sub="The recording may still be uploading, or this call was logged without audio."
              />
            )}
          </SectionCard>
        </section>

        {/* Pins */}
        <section id="pins">
          <SectionCard
            eyebrow="Moments"
            title="Pins"
            actions={pins.length > 0 ? <span className="text-xs text-neutral-400">{pins.length} pin{pins.length === 1 ? "" : "s"}</span> : undefined}
            padded
          >
            {pinsErr ? <p className="text-sm text-red-400 mb-2">{pinsErr}</p> : null}
            {loadingPins ? (
              <p className="text-sm text-neutral-400">Loading pins…</p>
            ) : pins.length === 0 ? (
              <EmptyState
                message="No pinned coaching notes yet."
                sub="Pin a moment from the player to build a coaching timeline for this call."
              />
            ) : (
              <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
                {pins.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-3 py-2">
                    <div className="text-sm">
                      <button
                        onClick={() => seek(p.t)}
                        className="text-indigo-300 underline underline-offset-2 hover:text-indigo-200 tabular-nums"
                        title="Jump"
                      >
                        {fmt(p.t)}
                      </button>
                      {p.note && <span className="ml-2 text-neutral-400">— {p.note}</span>}
                    </div>
                    <Button onClick={() => onDelete(p.id)}>
                      Delete
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </section>

        {/* Whisperer Moments (Tier 2B Day 115) — live coaching moments linked to this call */}
        <section id="whisperer-moments">
          <SectionCard
            variant="ai"
            eyebrow="Live coaching"
            title="Whisperer Moments"
            actions={
              whispererMoments.length > 0 ? (
                <span className="text-xs text-neutral-400">{whispererMoments.length} moment{whispererMoments.length === 1 ? "" : "s"}</span>
              ) : undefined
            }
            padded
          >
            {whispererMomentsError ? (
              <div className="text-sm text-red-400">Could not load Whisperer moments.</div>
            ) : whispererMoments.length === 0 ? (
              <EmptyState
                message="No Whisperer moments linked to this call yet."
                sub="Live coaching moments appear here when this call ran with the Whisperer."
              />
            ) : (
              <div className="space-y-2">
                {momentOutcomeNotice && <div className="text-[11px] text-neutral-400">{momentOutcomeNotice}</div>}
                {whispererMoments.map((m) => (
                  <div key={m.triggerId} className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full border border-neutral-700 bg-neutral-900 text-neutral-300 shrink-0">
                          {String(m.type).replace("_", " ")}
                        </span>
                        {m.phrase && <span className="text-xs text-neutral-400 truncate">“{m.phrase}”</span>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {m.suggestion?.urgency && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border uppercase tracking-wide font-semibold ${
                            m.suggestion.urgency === "high" ? "border-red-500/30 bg-red-500/10 text-red-300"
                            : m.suggestion.urgency === "medium" ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                            : "border-neutral-700 bg-neutral-900 text-neutral-400"
                          }`}>
                            {m.suggestion.urgency}
                          </span>
                        )}
                        {m.source && m.source !== "unknown" && (
                          <span className="text-[10px] text-neutral-500 capitalize">{m.source}</span>
                        )}
                      </div>
                    </div>
                    {m.segmentText && <div className="text-xs text-neutral-400 italic">{m.segmentText}</div>}
                    {m.suggestion?.title && (
                      <div className="text-sm font-medium text-neutral-100">
                        {m.suggestion.emoji ? `${m.suggestion.emoji} ` : ""}{m.suggestion.title}
                      </div>
                    )}
                    {m.suggestion?.response && <p className="text-xs text-neutral-300 leading-relaxed">{m.suggestion.response}</p>}
                    <div className="flex flex-wrap gap-x-3 text-[11px] text-neutral-500">
                      {m.detectedAt && <span>{new Date(m.detectedAt).toLocaleString("en-GB")}</span>}
                      {typeof m.latencyMs === "number" && <span>{m.latencyMs}ms</span>}
                    </div>
                    {/* Day 122: suggestion outcome — show current + allow manager to mark on review */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      {([
                        { value: "used", label: "Used" },
                        { value: "ignored", label: "Ignored" },
                        { value: "not_relevant", label: "Not relevant" },
                      ] as const).map((b) => {
                        const selected = m.suggestionOutcome === b.value;
                        return (
                          <button
                            key={b.value}
                            type="button"
                            onClick={() => markMomentOutcome(m.triggerId, b.value)}
                            disabled={momentOutcomeBusyId === m.triggerId}
                            className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors disabled:opacity-50 ${selected ? "border-indigo-400/40 bg-indigo-500/10 text-indigo-200" : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:bg-neutral-800"}`}
                          >
                            {b.label}{selected ? " ✓" : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </section>

        {/* Coach assignments (main panel) */}
        <section id="coach">
          <SectionCard
            eyebrow="Coaching"
            title="Coach assignments"
            actions={
              <span className="text-xs text-neutral-400">
                {assignmentsLoading ? "Loading…" : `${assignments.length} item${assignments.length === 1 ? "" : "s"}`}
              </span>
            }
            padded
          >
            {(!Array.isArray(assignments) || assignments.filter(Boolean).length === 0) && !assignmentsLoading && (
              <EmptyState
                message="No coaching assignments for this call yet."
                sub="Drills assigned from this review appear here."
              />
            )}

            {Array.isArray(assignments) && assignments.filter(Boolean).length > 0 && (
              <ul className="divide-y divide-neutral-800">
                {(Array.isArray(assignments) ? assignments : [])
                  .filter((a): a is Record<string, any> => !!a && typeof a === "object")
                  .map((a, idx) => {
                    const id = String(a.id ?? `assignment-${idx}`);
                    const drillLabel = String(a.drill_id ?? a.title ?? a.type ?? "Untitled drill");
                    const notes = typeof a.notes === "string" && a.notes.trim() ? a.notes.trim() : null;

                    return (
                      <li key={id} className="py-2 flex items-center justify-between gap-3">
                        <div className="text-sm">
                          <div className="font-medium">{drillLabel}</div>
                          {notes && (
                            <div className="text-neutral-400 text-xs mt-0.5">{notes}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button onClick={() => deleteAssignment(id)}>
                            Delete
                          </Button>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}

            {/* Quick-assign actionable form */}
            {managerCheckDone && isManager && (
              <>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                  <label className="text-xs text-neutral-400">Drill</label>
                  <input
                    value={quickDrill}
                    onChange={(e) => setQuickDrill(e.target.value)}
                    placeholder="e.g. Objection: Budget"
                    className="sm:col-span-2 w-full bg-neutral-900 border border-neutral-700 rounded-md px-2 py-1 text-sm outline-none focus:border-neutral-500"
                  />
                </div>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                  <label className="text-xs text-neutral-400">Assignee</label>
                  <select
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    className="sm:col-span-2 w-full bg-neutral-900 border border-neutral-700 rounded-md px-2 py-1 text-sm outline-none focus:border-neutral-500"
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
                  <Button
                    variant="primary"
                    onClick={async () => {
                      if (!quickDrill || !assignee) return;
                      setAssignBusy(true);
                      try {
                        const r = await proxyFetch("/v1/coach/assign", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({
                            callId,
                            assigneeUserId: assignee,
                            drillId: quickDrill,
                            ...(assignmentId ? { assignmentId } : {}),
                          }),
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
                  >
                    {assignBusy ? "Assigning…" : "Assign to rep"}
                  </Button>
                </div>
              </>
            )}
          </SectionCard>
        </section>

        {/* CRM summary chips (quick glance) */}
        <section id="crm">
          <SectionCard
            eyebrow="CRM"
            title="Linked records"
            actions={
              <Button onClick={openCrm}>
                Open CRM panel
              </Button>
            }
            padded
          >
          <div className="flex flex-wrap gap-2 text-sm">
            {/* Contact */}
            {contactChip ? (
              <span className="px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-900 inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={openContact}
                  className="underline underline-offset-2 hover:opacity-90"
                  title="Open contact"
                >
                  Contact: {contactChip}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    unlink("contact");
                  }}
                  className="opacity-60 hover:opacity-100"
                  aria-label="Unlink contact"
                  title="Unlink contact"
                >
                  ×
                </button>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full border border-neutral-800 bg-neutral-900/60 text-neutral-500">Contact: none</span>
            )}

            {/* Account */}
            {accountChip ? (
              <span className="px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-900 inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={openAccount}
                  className="underline underline-offset-2 hover:opacity-90"
                  title="Open account"
                >
                  Account: {accountChip}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    unlink("account");
                  }}
                  className="opacity-60 hover:opacity-100"
                  aria-label="Unlink account"
                  title="Unlink account"
                >
                  ×
                </button>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full border border-neutral-800 bg-neutral-900/60 text-neutral-500">Account: none</span>
            )}

            {/* Opportunity (placeholder only for now) */}
            {opportunityChip ? (
              <span className="px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-900 text-neutral-200">Opportunity: {opportunityChip}</span>
            ) : (
              <span className="px-2 py-0.5 rounded-full border border-neutral-800 bg-neutral-900/60 text-neutral-500">Opportunity: none</span>
            )}
          </div>
          </SectionCard>
        </section>

        {coachOpen && assignOpen && (
          <div className="rounded border border-indigo-400/30 bg-indigo-500/10 p-3 text-sm text-indigo-200">
            Coach panel opened via deep link — “Assign Drill” preset is active.
          </div>
        )}
        {err && (
          <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {err === "invalid callId"
              ? "This is a demo placeholder call. No full metadata or audio is stored for this ID."
              : err === "Call not found or no longer available."
                ? "This call could not be found in the system. It may have been deleted, never fully created, or the page was opened from a stale link."
                : err}
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
          className={`absolute right-0 top-0 h-full w-full max-w-md bg-neutral-950 border-l border-neutral-800 shadow-2xl shadow-black/50 p-5 transform transition-transform ${crmOpen ? "translate-x-0" : "translate-x-full"}`}
        >
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">CRM Link</h2>
            <button onClick={closeCrm} className="ml-auto opacity-70 hover:opacity-100 underline text-sm">
              Close
            </button>
          </div>

          <div className="mt-4 space-y-3 text-sm">
            {/* Current links */}
            <div className="rounded-xl border border-neutral-800 p-3">
              <div className="opacity-70 text-xs mb-2">Current links</div>

              <div className="flex flex-wrap gap-2">
                {contactChip ? (
                  <span className="px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-900 inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={openContact}
                      className="underline underline-offset-2 hover:opacity-90"
                      title="Open contact"
                    >
                      Contact: {contactChip}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        unlink("contact");
                      }}
                      className="opacity-60 hover:opacity-100"
                      aria-label="Unlink contact"
                      title="Unlink contact"
                    >
                      ×
                    </button>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full border border-neutral-800 bg-neutral-900/60 text-neutral-500">Contact: none</span>
                )}

                {accountChip ? (
                  <span className="px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-900 inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={openAccount}
                      className="underline underline-offset-2 hover:opacity-90"
                      title="Open account"
                    >
                      Account: {accountChip}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        unlink("account");
                      }}
                      className="opacity-60 hover:opacity-100"
                      aria-label="Unlink account"
                      title="Unlink account"
                    >
                      ×
                    </button>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full border border-neutral-800 bg-neutral-900/60 text-neutral-500">Account: none</span>
                )}

                {opportunityChip ? (
                  <span className="px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-900 text-neutral-200">Opportunity: {opportunityChip}</span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full border border-neutral-800 bg-neutral-900/60 text-neutral-500">Opportunity: none</span>
                )}
              </div>
            </div>

            <div className="border-t border-neutral-800 pt-3 mt-2" />

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
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={linkLoading || !linkEmail.includes("@")}
                >
                  {linkLoading ? "Linking…" : "Link"}
                </Button>
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
                <div
                  className="rounded-xl border border-neutral-800 divide-y divide-neutral-800 max-h-56 overflow-auto"
                  role="listbox"
                  aria-label="Contacts"
                >
                  {results.length === 0 ? (
                    <>
                      <div className="p-3 text-xs opacity-70">No results</div>

                      {q.includes("@") && (
                        <button
                          onClick={async () => {
                            try {
                              setBusy(true);
                              setSearchErr(null);

                              const resp: any = await fetchJsonWithRetry(
                                `/api/proxy/v1/crm/link-call`,
                                {
                                  method: "POST",
                                  headers: { "content-type": "application/json" },
                                  body: JSON.stringify({ callId, email: q.trim() }),
                                }
                              );

                              if (resp?.ok === false) {
                                throw new Error(resp?.error || "Link failed");
                              }

                              toast("Linked ✓");
                              await loadLinkInfo();

                              setQ("");
                              setResults([]);
                              setIdx(0);
                            } catch (e: any) {
                              setSearchErr(e?.message || "Create + link failed");
                            } finally {
                              setBusy(false);
                            }
                          }}
                          disabled={busy}
                          className="w-full text-left p-3 hover:bg-neutral-900 border-t border-neutral-800 text-indigo-300"
                        >
                          Create contact: {q}
                        </button>
                      )}
                    </>
                  ) : (
                    results.map((c, i) => {
                      const name = [c.first_name, c.last_name]
                        .filter(Boolean)
                        .join(" ")
                        .trim();
                      const selected = i === idx;

                      return (
                        <button
                          key={c.id}
                          id={c.id}
                          role="option"
                          aria-selected={selected}
                          onMouseEnter={() => setIdx(i)}
                          onClick={() => linkContactId(c.id)}
                          className={`w-full text-left p-3 ${selected ? "bg-white/10" : "hover:bg-neutral-900"
                            }`}
                          disabled={busy}
                        >
                          <div className="text-sm">
                            {name || c.email || c.id}
                          </div>
                          {c.email && (
                            <div className="text-xs opacity-70">
                              {c.email}
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Search accounts */}
            <div className="space-y-2">
              <div className="opacity-80 text-xs">Search accounts</div>
              <input
                placeholder="Type company or domain…"
                className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none"
                value={accountQ}
                onChange={(e) => debouncedSearchAccounts(e.target.value)}
              />
              {accountQ && (
                <div className="rounded-xl border border-neutral-800 divide-y divide-neutral-800 max-h-56 overflow-auto">
                  {accountResults.length === 0 ? (
                    <div className="p-3 text-xs opacity-70">No account results</div>
                  ) : (
                    accountResults.map((a) => {
                      const label = a.name || a.domain || a.id;
                      const linked = linkInfo?.account?.id === a.id;
                      return (
                        <button
                          key={a.id}
                          onClick={() => linkAccountId(a.id)}
                          className="w-full text-left p-3 hover:bg-neutral-900 disabled:opacity-60"
                          disabled={busy || linked}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm truncate">{label}</div>
                              {a.domain && <div className="text-xs opacity-70 truncate">{a.domain}</div>}
                            </div>
                            {linked ? (
                              <span className="rounded-full border border-green-700/50 bg-green-600/20 px-2 py-0.5 text-[11px] text-green-300">
                                Linked
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <p className="text-xs opacity-60">
              Tip: ↑/↓ to move • Enter to attach. Selecting a contact links by email; use Search accounts to attach a company directly.
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
          className={`absolute right-0 top-0 h-full w-full max-w-md bg-neutral-950 border-l border-neutral-800 shadow-2xl shadow-black/50 p-5 transform transition-transform ${coachOpen ? "translate-x-0" : "translate-x-full"}`}
        >
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Coach</h2>
            <button onClick={closeCoach} className="ml-auto opacity-70 hover:opacity-100 underline text-sm">
              Close
            </button>
          </div>
          {(Array.isArray(assignments) ? assignments : [])
            .filter((a): a is Record<string, any> => !!a && typeof a === "object")
            .slice(0, 3)
            .map((a, idx) => {
              const id = String(a.id ?? `coach-drawer-assignment-${idx}`);
              const drillLabel = String(a.drill_id ?? a.title ?? a.type ?? "Untitled drill");
              const createdLabel = a.created_at ? new Date(a.created_at).toLocaleString() : "";

              return (
                <span
                  key={id}
                  className="ml-2 inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs opacity-80"
                >
                  <span>{drillLabel}</span>
                  <span className="opacity-60">· {createdLabel}</span>
                </span>
              );
            })}

          <div className="mt-4 space-y-4 text-sm">

            {/* --- ADD: Assign form --- */}
            {managerCheckDone && isManager && (
              <div id="assign-form" className="space-y-2 mt-3">
                <label className="block text-sm opacity-80">Assignee</label>
                <select
                  className="w-full bg-neutral-900 border border-neutral-700 rounded p-2"
                  value={assigneeUserId}
                  onChange={e => setAssigneeUserId(e.target.value)}
                  disabled={usersLoading}
                >
                  <option value="">
                    {usersLoading ? "Loading reps…" : "Select a rep"}
                  </option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}{u.email ? ` (${u.email})` : ""}
                    </option>
                  ))}
                </select>

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

                <Button
                  variant="primary"
                  size="md"
                  onClick={onSaveAssign}
                  disabled={assignSaving || !assigneeUserId || !drillId}
                >
                  {assignSaving ? "Saving…" : "Save Assignment"}
                </Button>
              </div>
            )}

            {/* Assignments list (remove) */}
            <div className="rounded-xl border border-neutral-800 p-3 space-y-2">
              <h3 className="font-medium">Assignments</h3>
              {assignments.length === 0 ? (
                <div className="text-sm opacity-70">No assignments yet.</div>
              ) : (
                <ul className="divide-y divide-neutral-800">
                  {(Array.isArray(assignments) ? assignments : [])
                    .filter((a): a is Record<string, any> => !!a && typeof a === "object")
                    .map((a, idx) => {
                      const id = String(a.id ?? `assignment-${idx}`);
                      const drillLabel = String(a.drill_id ?? a.title ?? a.type ?? "Untitled drill");
                      const createdLabel = a.created_at ? new Date(a.created_at).toLocaleString() : "";
                      return (
                        <li key={id} className="py-2 flex items-center justify-between text-sm">
                          <div className="flex flex-col">
                            <span className="font-medium">{drillLabel}</span>
                            <span className="opacity-60">{createdLabel}</span>
                          </div>
                          <Button
                            variant="danger"
                            onClick={async () => {
                              try {
                                await fetchJsonWithRetry(`/api/proxy/v1/coach/assignments/${a.id}`, { method: "DELETE" });
                                await loadAssignments();
                                toast("Assignment removed.");
                              } catch (e: any) {
                                toast(e?.message || "Failed to remove.");
                              }
                            }}
                          >
                            Remove
                          </Button>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>


          </div>

          {/* Coaching notes */}
          <div className="rounded-xl border border-neutral-800 p-3">
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
                } catch (e: any) {
                  toast(e?.message || "Failed to save");
                } finally {
                  setNotesSaving(false);
                }
              }}
            />
          </div>
        </div>
      </div>
      {/* === /COACH DRAWER === */}
    </AuthGate>
  );
}
