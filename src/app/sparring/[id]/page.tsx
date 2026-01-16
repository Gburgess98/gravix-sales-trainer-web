"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { fetchJsonWithRetry } from "@/lib/fetchJsonwithretry";
import ErrorBox from "@/components/ErrorBox";
import { useToast } from "@/components/Toast";
import { triggerConfetti } from "@/lib/confetti";
import { proxyFetch } from "@/lib/api";

type ScoreBreakdown = {
  opener?: number;
  discovery?: number;
  pitch?: number;
  objections?: number;
  close?: number;
};

type VoiceBreakdown = {
  tone?: number;
  clarity?: number;
  control?: number;
  filler?: number;
};

type TranscriptTurn = {
  role: string; // "rep" | "buyer" | etc
  text: string;
  ts?: number;
  label?: string;
};

type SparTurn = {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  text: string;
  created_at: string;
  micro?: {
    turn_score: number;
    micro_breakdown?: ScoreBreakdown;
    coach_note?: string;
    flags?: string[];
  } | null;
};

type SparringMeta = {
  total?: number;
  breakdown?: ScoreBreakdown;
  voice?: VoiceBreakdown;
  streak?: number;
  best_streak?: number;
  xp_multiplier?: number;
  xp_bonus_pending?: number;
  comeback_pending?: boolean;
  last_turn_score?: number;
  streak_threshold?: number;
  transcript?: TranscriptTurn[];
  // keep it open for any extra fields
  [key: string]: any;
};

type SparringSession = {
  id: string;
  rep_id: string | null;
  persona_id: string | null;
  difficulty?: string | null;
  total?: number | null;
  total_score?: number | null;
  xp_awarded: number | null;
  created_at: string;
  duration_ms?: number | null;
  turns?: number | null;
  summary?: string | null;
  flags?: string[] | null;
  meta?: SparringMeta | null;
};

type PersonaStats = {
  wins: number;
  losses: number;
  total: number;
  winRate: number | null;
};

type WhisperTag = "PRICE" | "ROI" | "TRUST" | "STALL" | "GEN";

type WhisperItem = {
  tag: WhisperTag;
  text: string;
};

type WhispererHit = {
  t: number | null;
  type: string;
  text: string;
  suggestion: WhisperItem;
};

function formatScore(v?: number | null): string {
  if (typeof v !== "number" || Number.isNaN(v)) return "—";
  return `${Math.round(v)}`;
}

function scoreBadgeColour(v?: number | null): string {
  if (typeof v !== "number" || Number.isNaN(v)) return "border-neutral-700 text-neutral-200";
  if (v >= 80) return "border-emerald-500 text-emerald-300";
  if (v >= 60) return "border-amber-500 text-amber-300";
  return "border-red-500 text-red-300";
}

function scoreBarWidth(v?: number | null): string {
  if (typeof v !== "number" || Number.isNaN(v)) return "w-[5%]";
  const clamped = Math.max(0, Math.min(100, v));
  return `w-[${clamped}%]`;
}

function formatDuration(seconds?: number | null): string {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function formatModeLabel(mode?: string | null): string | null {
  if (!mode) return null;
  const m = String(mode).toLowerCase();
  if (m === "time_trial") return "Time trial";
  if (m === "close_in_2_min" || m === "close_in_2m") return "Close in 2 minutes";
  return String(mode).replace(/_/g, " ");
}

function modeObjectiveLabel(mode?: string | null): string | null {
  if (!mode) return null;
  const m = String(mode).toLowerCase();
  if (m === "time_trial") return "Survive the full timer";
  if (m === "close_in_2_min" || m === "close_in_2m") {
    return "Get a clear yes in under 2 minutes";
  }
  return null;
}

function formatDifficultyLabel(diff?: string | null): string {
  if (!diff) return "";
  const d = String(diff).toLowerCase();
  if (d === "easy") return "Easy";
  if (d === "normal") return "Normal";
  if (d === "hard") return "Hard";
  if (d === "nightmare") return "Nightmare";
  return diff.toString();
}

function inferWhisperTag(s: string): WhisperTag {
  const t = String(s || "").toLowerCase();

  // price / cost
  if (
    t.includes("price") ||
    t.includes("cost") ||
    t.includes("expensive") ||
    t.includes("budget") ||
    t.includes("payment")
  ) {
    return "PRICE";
  }

  // ROI / payback
  if (
    t.includes("roi") ||
    t.includes("return") ||
    t.includes("payback") ||
    t.includes("paid for itself") ||
    t.includes("numbers") ||
    t.includes("savings")
  ) {
    return "ROI";
  }

  // trust / proof
  if (
    t.includes("case study") ||
    t.includes("proof") ||
    t.includes("guarantee") ||
    t.includes("risk") ||
    t.includes("warranty") ||
    t.includes("reference")
  ) {
    return "TRUST";
  }

  // stall / delay
  if (
    t.includes("think about it") ||
    t.includes("circle back") ||
    t.includes("send me") ||
    t.includes("email") ||
    t.includes("later") ||
    t.includes("not now")
  ) {
    return "STALL";
  }

  return "GEN";
}

function tagBadgeClasses(tag: WhisperTag): string {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]";
  switch (tag) {
    case "PRICE":
      return base + " border-amber-500/60 bg-amber-500/10 text-amber-300";
    case "ROI":
      return base + " border-emerald-500/60 bg-emerald-500/10 text-emerald-300";
    case "TRUST":
      return base + " border-sky-500/60 bg-sky-500/10 text-sky-300";
    case "STALL":
      return base + " border-rose-500/60 bg-rose-500/10 text-rose-300";
    default:
      return base + " border-neutral-600 bg-neutral-900 text-neutral-200";
  }
}

function normaliseText(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isMeaningfulBuyerTurn(text: string): boolean {
  const t = normaliseText(text);
  if (!t) return false;

  // prevent whisper spam on tiny/ack messages
  if (t.length < 18) return false;

  // trigger only on buyer messages that actually contain something we can coach
  const keywords = [
    "price",
    "cost",
    "expensive",
    "budget",
    "roi",
    "return",
    "payback",
    "prove",
    "case study",
    "guarantee",
    "risk",
    "warranty",
    "send",
    "email",
    "think about it",
    "later",
    "not now",
    "decision",
  ];

  return keywords.some((k) => t.includes(k));
}

// Tiny helper: turn session.meta into an array of emotion values (-100..+100)
function buildEmotionalSeries(meta: any | null | undefined): number[] {
  if (!meta) return [];

  // Preferred: explicit history array
  if (Array.isArray(meta.emotional_history)) {
    return meta.emotional_history
      .map((entry: any) => {
        if (typeof entry === "number") return entry;
        if (entry && typeof entry.value === "number") return entry.value;
        return null;
      })
      .filter((v: number | null): v is number => v !== null);
  }

  // Fallback: single emotional_state value
  if (typeof meta.emotional_state === "number") {
    return [meta.emotional_state];
  }

  return [];
}

type SparringMode = "normal" | "time_trial" | "close_in_2m";

function getTotalSecondsForMode(mode: SparringMode | null | undefined) {
  switch (mode) {
    case "time_trial":
      return 180; // 3-minute survive round
    case "close_in_2m":
      return 120; // 2-minute close-the-deal round
    default:
      return null; // open practice, no timer
  }
}

type SparringOutcome = "win" | "loss" | "neutral";

function deriveOutcomeFromScore(score?: number | null): SparringOutcome | null {
  if (typeof score !== "number" || Number.isNaN(score)) return null;

  // Simple thresholds aligned with our scoring toasts
  if (score >= 80) return "win";   // smashed it
  if (score < 60) return "loss";   // needs work

  // Anything in between is a neutral / solid round
  return "neutral";
}

function formatEndReasonLabel(reason?: string | null): string {
  if (!reason) return "";
  const r = String(reason).toLowerCase();
  if (r === "angry") return "Hung up (angry)";
  if (r === "bored") return "Hung up (bored)";
  if (r === "timeout") return "Hung up (time out)";
  if (r === "closed") return "Session closed";
  return "Session ended";
}


function endReasonBadgeClasses(reason?: string | null): string {
  const base =
    "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.12em]";
  const r = String(reason || "").toLowerCase();
  if (r === "angry") {
    return (
      base +
      " border-red-500/80 bg-red-500/10 text-red-300"
    );
  }
  if (r === "bored" || r === "timeout") {
    return (
      base +
      " border-amber-500/80 bg-amber-500/10 text-amber-300"
    );
  }
  if (r === "closed") {
    return (
      base +
      " border-neutral-500/80 bg-neutral-500/10 text-neutral-200"
    );
  }
  return (
    base +
    " border-neutral-700 bg-neutral-900 text-neutral-200"
  );
}

function isSessionEnded(s: SparringSession | null) {
  return Boolean(
    s?.meta && ((s.meta as any).ended || (s.meta as any).end_reason)
  );
}

function getRepMicroTurns(turns: SparTurn[]) {
  return turns.filter(
    (t) => t.role === "user" && t.micro && typeof t.micro.turn_score === "number"
  );
}

function getLastNRepMicroScores(turns: SparTurn[], n = 5): number[] {
  const rep = getRepMicroTurns(turns);
  const scores = rep
    .map((t) => Number(t.micro!.turn_score))
    .filter((x) => Number.isFinite(x));
  return scores.slice(-n);
}

function microTrendLabel(scores: number[]) {
  if (scores.length < 2) return { label: "—", dir: "flat" as const };
  const a = scores[scores.length - 2];
  const b = scores[scores.length - 1];
  const d = Math.round(b - a);
  if (d > 0) return { label: `↑ +${d}`, dir: "up" as const };
  if (d < 0) return { label: `↓ ${d}`, dir: "down" as const };
  return { label: "→ 0", dir: "flat" as const };
}

function prevRepMicroScore(turns: SparTurn[], currentTurnId: string): number | null {
  const rep = getRepMicroTurns(turns);
  const idx = rep.findIndex((t) => t.id === currentTurnId);
  if (idx <= 0) return null;
  const prev = rep[idx - 1]?.micro?.turn_score;
  return typeof prev === "number" ? prev : null;
}

function microPillClasses(dir: "up" | "down" | "flat") {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold";
  if (dir === "up")
    return base + " border-emerald-500/60 bg-emerald-500/10 text-emerald-300";
  if (dir === "down")
    return base + " border-rose-500/60 bg-rose-500/10 text-rose-300";
  return base + " border-neutral-700 bg-neutral-900 text-neutral-200";
}

function buildSuggestedRepLine(buyerText: string, hint: WhisperItem): string {
  const tag = hint.tag;
  if (tag === "PRICE") {
    return "Totally fair — price only matters relative to payback. If I can show this pays for itself in ~60 days, would it be worth exploring?";
  }
  if (tag === "ROI") {
    return "Makes sense. What payback window would feel safe for you — 30, 60, or 90 days?";
  }
  if (tag === "TRUST") {
    return "Fair. If I share a quick case study with real numbers from a similar business, would you be open to a closer look?";
  }
  if (tag === "STALL") {
    return "Before I send anything, what would you need to see for this to be a yes?";
  }
  return "That’s fair — can I ask one quick thing so I don’t give you a generic answer?";
}

function clampNumber(v: any, min: number, max: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : NaN;
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function projectedXpLabel(session: SparringSession | null): string | null {
  if (!session) return null;
  const base = typeof session.xp_awarded === "number" ? session.xp_awarded : null;
  // If already scored, don't show projection (it is final)
  const alreadyScored =
    typeof session.total === "number" ||
    typeof session.total_score === "number" ||
    typeof session.meta?.total === "number";

  if (alreadyScored) return null;
  if (base == null) return null;

  const mult = typeof session.meta?.xp_multiplier === "number" ? session.meta.xp_multiplier : 1;
  const pending = typeof session.meta?.xp_bonus_pending === "number" ? session.meta.xp_bonus_pending : 0;
  const est = Math.round(base * mult + pending);

  const multNice = (typeof mult === "number" ? mult : 1).toFixed(1);
  const bonusNice = pending > 0 ? ` +${pending}` : "";

  return `Projected XP: ~${est} (x${multNice}${bonusNice})`;
}

function isStreakAchieved(meta: any | null | undefined): boolean {
  if (!meta) return false;
  const streak = typeof meta.streak === "number" ? meta.streak : 0;
  return streak >= 1;
}

function attachMicroToLastUserTurn(prev: SparTurn[], micro: any): SparTurn[] {
  if (!Array.isArray(prev) || prev.length === 0) return prev;

  // Find the last rep turn (role === "user") and attach micro
  for (let i = prev.length - 1; i >= 0; i--) {
    if (prev[i]?.role === "user") {
      const next = [...prev];
      next[i] = { ...next[i], micro };
      return next;
    }
  }

  return prev;
}

export default function SparringSessionPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params?.id as string;

  // If this session was launched from /assignments, we carry the assignment context
  // so the backend can auto-complete it when the sparring round is scored.
  const assignmentId = useMemo(() => {
    const v = searchParams?.get("assignmentId") || searchParams?.get("assignment");
    if (!v) return null;
    const t = String(v).trim();
    return t.length > 0 ? t : null;
  }, [searchParams]);
  const launchedFromAssignments = Boolean(assignmentId);
  const [assignmentAutoCompleted, setAssignmentAutoCompleted] = useState(false);

  const [session, setSession] = useState<SparringSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [turns, setTurns] = useState<SparTurn[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [personaStats, setPersonaStats] = useState<PersonaStats | null>(null);
  const [personaStatsError, setPersonaStatsError] = useState<string | null>(null);

  const [whispererHits, setWhispererHits] = useState<WhispererHit[]>([]);
  const [whispersByTurnId, setWhispersByTurnId] = useState<Record<string, WhisperItem[]>>({});
  const [whispererLoading, setWhispererLoading] = useState(false);
  const [whispererError, setWhispererError] = useState<string | null>(null);
  const whisperTimerRef = useRef<number | null>(null);
  const lastWhisperedBuyerTurnIdRef = useRef<string | null>(null);
  const lastWhisperedBuyerTextRef = useRef<string | null>(null);
  const microScoreTimerRef = useRef<number | null>(null);
  const [streakFlash, setStreakFlash] = useState<"up" | "break" | null>(null);
  const prevStreakRef = useRef<number | null>(null);
  const emotionalSeries = useMemo(
    () => buildEmotionalSeries(session?.meta || null),
    [session]
  );

  async function runMicroScore() {
    if (!id) return;

    try {
      const r = await proxyFetch(`/api/proxy/v1/sparring/sessions/${encodeURIComponent(id)}/micro-score`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      const data: any = await r.json().catch(() => null);

      if (!r.ok || !data || data.ok === false) {
        // Non-fatal: don't break the sparring flow if micro-score fails
        const msg = data?.error || `${r.status} ${r.statusText}`;
        console.warn("[sparring] micro-score failed", msg);
        return;
      }

      if (data.micro) {
        setTurns((prev) => attachMicroToLastUserTurn(prev, data.micro));
      }
    } catch (e: any) {
      console.warn("[sparring] micro-score error", e?.message || e);
    }
  }
  async function updateWhispererPreview(latestTurns: SparTurn[]) {
    if (!session) return;

    try {
      setWhispererLoading(true);
      setWhispererError(null);

      if (!Array.isArray(latestTurns) || latestTurns.length === 0) {
        setWhispererLoading(false);
        return;
      }

      const last = latestTurns[latestTurns.length - 1];

      // Only whisper after a meaningful buyer message
      if (!last || last.role !== "assistant" || !String(last.text || "").trim()) {
        setWhispererLoading(false);
        return;
      }

      if (!isMeaningfulBuyerTurn(last.text)) {
        setWhispererLoading(false);
        return;
      }

      // Deduplicate (same buyer turn or same buyer text)
      const lastBuyerId = last.id;
      const lastBuyerText = normaliseText(last.text);

      if (lastWhisperedBuyerTurnIdRef.current === lastBuyerId) {
        setWhispererLoading(false);
        return;
      }

      if (lastWhisperedBuyerTextRef.current === lastBuyerText) {
        setWhispererLoading(false);
        return;
      }

      // If we already have whispers stored for this buyer turn, don't refetch
      if (Array.isArray((whispersByTurnId as any)[lastBuyerId]) && (whispersByTurnId as any)[lastBuyerId].length > 0) {
        setWhispererLoading(false);
        return;
      }

      const buyerTurnId = lastBuyerId;

      const transcript = latestTurns.map((t) => ({
        role: t.role === "user" ? "rep" : "buyer",
        text: t.text,
      }));

      const r = await proxyFetch("/v1/whisperer/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transcript,
          personaId: session.persona_id || null,
        }),
      });

      const data: any = await r.json().catch(() => null);

      if (!r.ok || !data || data.ok === false) {
        const msg = data?.error || `${r.status} ${r.statusText}`;
        throw new Error(msg);
      }

      const list: any[] = Array.isArray(data.suggestions) ? data.suggestions : [];

      const raw = list
        .filter((s) => typeof s === "string" && s.trim().length > 0)
        .slice(0, 3);

      const suggestions: WhisperItem[] = raw.map((text: string) => ({
        text,
        tag: inferWhisperTag(text),
      }));

      setWhispererHits(
        suggestions.map((item) => ({
          type: "whisper",
          suggestion: item,
          text: "",
          t: null,
        }))
      );

      // ✅ Attach to this specific buyer message
      setWhispersByTurnId((prev) => ({
        ...prev,
        [buyerTurnId]: suggestions,
      }));

      lastWhisperedBuyerTurnIdRef.current = buyerTurnId;
      lastWhisperedBuyerTextRef.current = lastBuyerText;
    } catch (e: any) {
      console.error("[whisperer] preview failed", e);
      setWhispererError(e?.message || "Whisperer preview failed");
      // keep last good suggestions instead of wiping the UI
    } finally {
      setWhispererLoading(false);
    }
  }

  const toast = useToast();

  const [scoringBusy, setScoringBusy] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerFinished, setTimerFinished] = useState(false);

  const mode = useMemo(() => {
    if (!session) return null;
    const metaMode = session.meta?.mode || (session.meta as any)?.gameMode;
    if (typeof metaMode === "string" && metaMode.length > 0) return metaMode;
    return null;
  }, [session]);

  const targetSeconds = useMemo(() => {
    if (!mode) return null;
    const m = String(mode).toLowerCase();

    if (m === "close_in_2_min" || m === "close_in_2m") {
      return 120;
    }

    if (m === "time_trial") {
      return 180;
    }

    return null;
  }, [mode]);


  useEffect(() => {
    if (!id) return;

    let alive = true;
    setLoading(true);
    setError(null);
    setTurns([]); // Reset turns when navigating to a new session
    // Reset per-session UI state so Restart/Replay creates a clean run
    setWhispererHits([]);
    setWhispersByTurnId({});
    setWhispererError(null);
    setWhispererLoading(false);
    lastWhisperedBuyerTurnIdRef.current = null;
    lastWhisperedBuyerTextRef.current = null;

    fetchJsonWithRetry(`/api/proxy/v1/sparring/sessions/${id}`)
      .then((res: any) => {
        if (!alive) return;

        if (!res) {
          setError("No response from server.");
          return;
        }

        if (res.ok === false) {
          setError(res.error || "Failed to load sparring session.");
          return;
        }

        if (!res.session) {
          setError("Sparring session not found.");
          return;
        }

        setSession(res.session as SparringSession);

        // IMPORTANT: don't wipe local turns if the session payload doesn't include them.
        // Turns should be driven by the POST /turns response (and/or a dedicated turns loader).
        if (Array.isArray(res.turns)) {
          setTurns(res.turns as SparTurn[]);
        }
      })
      .catch((err: any) => {
        console.error("Error loading sparring session:", err);
        if (!alive) return;
        setError(
          err?.message || "Something went wrong loading this sparring session."
        );
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    setElapsedSeconds(0);
    setTimerFinished(false);
  }, [session?.id, mode]);

  // Load global win-rate for this persona
  useEffect(() => {
    if (!session?.persona_id) return;

    let alive = true;
    setPersonaStatsError(null);

    (async () => {
      try {
        const res = await fetchJsonWithRetry(
          `/api/proxy/v1/sparring/leaderboard/persona/${encodeURIComponent(
            session.persona_id as string
          )}`
        );

        if (!alive) return;

        if (!res || res.ok === false) {
          if (res?.error === "not_found") {
            setPersonaStats(null);
            return;
          }
          throw new Error(res?.error || "Failed to load persona stats.");
        }

        const wins = Number(res.wins ?? 0);
        const losses = Number(res.losses ?? 0);
        const total = Number(res.total ?? wins + losses);
        const winRate =
          typeof res.winRate === "number"
            ? res.winRate
            : total > 0
              ? (wins / total) * 100
              : null;

        setPersonaStats({
          wins,
          losses,
          total,
          winRate,
        });
      } catch (e: any) {
        if (!alive) return;

        // If the leaderboard endpoint returns 404 / "Not found", it just means
        // we have no stats yet for this persona. That should not surface as an error.
        const status = (e as any)?.status;
        const msg = (e as any)?.message;
        if (status === 404 || msg === "Not found") {
          setPersonaStats(null);
          setPersonaStatsError(null);
          return;
        }

        console.error("Failed to load persona stats", e);
        setPersonaStatsError(e?.message || "Failed to load persona stats.");
      }
    })();

    return () => {
      alive = false;
    };
  }, [session?.persona_id]);


  useEffect(() => {
    if (!targetSeconds || targetSeconds <= 0) return;

    let cancelled = false;
    const start = Date.now();

    const tick = () => {
      if (cancelled) return;
      const delta = Math.floor((Date.now() - start) / 1000);
      setElapsedSeconds(delta);

      if (delta >= targetSeconds) {
        setTimerFinished(true);
        return;
      }

      window.setTimeout(tick, 1000);
    };

    const timerId = window.setTimeout(tick, 1000);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [targetSeconds, session?.id]);
  const handleScoreClick = async () => {
    if (!session || !session.id) return;

    try {
      setScoringBusy(true);
      setScoreError(null);

      // Use plain fetch here to avoid any legacy "expected JSON array"
      // assumptions inside fetchJsonWithRetry. This endpoint returns
      // an object: { ok, session, total, xp_awarded, flags, summary }.
      const res = await proxyFetch("/v1/sparring/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          ...(assignmentId ? { assignmentId } : {}),
        }),
      });

      if (!res.ok) {
        let message = `${res.status} ${res.statusText}`;
        try {
          const body = await res.json();
          if (body?.error) {
            message = body.error;
          }
        } catch {
          // ignore JSON parse failures, keep default message
        }
        throw new Error(message);
      }

      const data: any = await res.json();

      if (!data || data.ok === false) {
        throw new Error(data?.error || "Failed to score this round.");
      }

      const updated = data.session ?? null;
      if (updated) {
        setSession(updated);
      }

      // If this sparring was launched from an Assignment, the API may auto-complete it.
      if (assignmentId) {
        const completed =
          Boolean((data as any).assignment_completed) ||
          Boolean((data as any).assignmentCompleted) ||
          ((data as any).assignment && (data as any).assignment.status === "completed") ||
          ((data as any).assignment && (data as any).assignment.completed_at);

        if (completed) {
          setAssignmentAutoCompleted(true);
          toast("Completed ✓ (auto-marked from sparring)");
        }
      }

      const numericTotal: number | null =
        typeof data.total === "number"
          ? Math.round(data.total)
          : typeof updated?.total_score === "number"
            ? Math.round(updated.total_score)
            : typeof updated?.meta?.total === "number"
              ? Math.round(updated.meta.total)
              : null;

      const difficulty =
        updated?.difficulty ??
        session.difficulty ??
        updated?.meta?.difficulty ??
        session.meta?.difficulty ??
        "normal";

      const difficultyNice = formatDifficultyLabel(difficulty);
      const difficultyPrefix = difficultyNice
        ? `${difficultyNice} round`
        : "Round";

      if (numericTotal != null) {
        if (numericTotal >= 80) {
          triggerConfetti();
          toast(`🔥 ${numericTotal}/100 — ${difficultyPrefix} smashed.`);
        } else if (numericTotal >= 60) {
          toast(
            `${numericTotal}/100 — solid ${difficultyPrefix}. Tighten a few parts and run it again.`,
          );
        } else {
          toast(
            `${numericTotal}/100 — ${difficultyPrefix} needs work. Review the breakdown and replay this drill.`,
          );
        }
      } else {
        toast(`${difficultyPrefix} scored.`);
      }
    } catch (e: any) {
      console.error("[sparring] score click failed", e);
      setScoreError(e?.message || "Failed to score this round.");
      toast("Failed to score this round.");
    } finally {
      setScoringBusy(false);
    }
  };

  // Micro-score: if we loaded an existing session with turns, score the latest rep turn once (non-blocking)
  useEffect(() => {
    if (!session) return;
    if (!Array.isArray(turns) || turns.length === 0) return;

    // if the latest rep (user) turn already has micro, don't run
    const lastRep = [...turns].reverse().find((t) => t?.role === "user");
    if (!lastRep) return;
    if (lastRep.micro) return;

    // debounce to avoid firing during initial hydration / rapid state changes
    if (microScoreTimerRef.current) {
      window.clearTimeout(microScoreTimerRef.current);
    }

    microScoreTimerRef.current = window.setTimeout(() => {
      void runMicroScore();
    }, 400);

    return () => {
      if (microScoreTimerRef.current) {
        window.clearTimeout(microScoreTimerRef.current);
        microScoreTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, turns.length]);

  // Scroll chat to bottom whenever turns change
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns.length]);

  // Whisperer: run on page load when turns exist, and whenever a buyer message arrives.
  // Debounced to avoid spam/flicker.
  useEffect(() => {
    if (!session) return;
    if (!Array.isArray(turns) || turns.length === 0) return;

    const last = turns[turns.length - 1];
    // Only trigger after buyer speaks (assistant)
    if (!last || last.role !== "assistant") return;

    // Only trigger on meaningful buyer turns
    if (!isMeaningfulBuyerTurn(last.text)) return;

    // If we already have whispers for this turn, don't refetch
    if (Array.isArray(whispersByTurnId[last.id]) && whispersByTurnId[last.id].length > 0) {
      return;
    }

    if (whisperTimerRef.current) {
      window.clearTimeout(whisperTimerRef.current);
    }

    // Slightly longer debounce to prevent flicker on rapid turn updates
    whisperTimerRef.current = window.setTimeout(() => {
      void updateWhispererPreview(turns);
    }, 500);

    return () => {
      if (whisperTimerRef.current) {
        window.clearTimeout(whisperTimerRef.current);
        whisperTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, turns.length]);

  async function onSend() {
    if (!input.trim() || !id) return;

    if (isScored) {
      toast("This round is already scored — hit Replay to run it again.");
      return;
    }

    if (ended) {
      toast("Session ended — buyer hung up. Hit Replay to run this drill again.");
      return;
    }

    try {
      setSending(true);
      setChatError(null);

      const res = await fetchJsonWithRetry(
        `/api/proxy/v1/sparring/sessions/${encodeURIComponent(id)}/turns`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: input.trim() }),
        }
      );

      if (!res || res.ok === false) {
        throw new Error(res?.error || "Failed to send turn.");
      }

      if (Array.isArray(res.turns)) {
        // Append new turns
        const appended = res.turns as SparTurn[];

        setTurns((prev) => {
          const latest = [...prev, ...appended];
          return latest;
        });

        // If the buyer replied (assistant turn exists), run micro-score
        const buyerReplied = appended.some((t) => t && (t as any).role === "assistant");
        if (buyerReplied) {
          // fire-and-forget (non-blocking)
          void runMicroScore();
        }
      }

      setInput("");
    } catch (e: any) {
      setChatError(e?.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  }

  async function onReplaySession() {
    if (!session) return;

    try {
      // Create a BRAND NEW session (never reuse the existing one)
      const body: any = {
        personaId: session.persona_id || "price_sensitive",
        difficulty: session.difficulty || session.meta?.difficulty || "normal",
      };

      // Preserve mode if the current session is a timed mode
      const mode = session.meta?.mode || (session.meta as any)?.gameMode;
      if (typeof mode === "string" && mode.trim().length > 0) {
        body.mode = mode;
      }

      const res = await fetchJsonWithRetry("/api/proxy/v1/sparring/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res || res.ok === false || !res.session?.id) {
        throw new Error(res?.error || "Failed to start new sparring session.");
      }

      // Navigate to the new sparring session (old session remains saved)
      router.push(`/sparring/${encodeURIComponent(res.session.id)}`);
    } catch (e: any) {
      console.error("Replay session failed", e);
      setError(e?.message || "Failed to restart this drill.");
    }
  }

  const totalScore = useMemo(() => {
    if (!session) return null;
    if (typeof session.total === "number") return session.total;
    if (typeof session.total_score === "number") return session.total_score;
    if (typeof session.meta?.total === "number") return session.meta.total;
    if (typeof session.meta?.breakdown?.close === "number") {
      // fallback: maybe only close score available
      return session.meta.breakdown.close;
    }
    return null;
  }, [session]);

  const outcome = useMemo<SparringOutcome | null>(() => {
    return deriveOutcomeFromScore(totalScore as number | null);
  }, [totalScore]);

  const breakdown: ScoreBreakdown = useMemo(() => {
    return (session?.meta?.breakdown ?? {}) as ScoreBreakdown;
  }, [session]);

  const voice: VoiceBreakdown = useMemo(() => {
    return (session?.meta?.voice ?? {}) as VoiceBreakdown;
  }, [session]);

  const transcript: TranscriptTurn[] = useMemo(() => {
    if (!session?.meta?.transcript) return [];
    if (!Array.isArray(session.meta.transcript)) return [];
    return session.meta.transcript as TranscriptTurn[];
  }, [session]);

  const durationSeconds = useMemo(() => {
    if (!session || typeof session.duration_ms !== "number") return null;
    return Math.round(session.duration_ms / 1000);
  }, [session]);

  const turnsCount = useMemo(() => {
    if (!session) return null;
    if (typeof session.turns === "number") return session.turns;
    if (transcript.length > 0) return transcript.length;
    return null;
  }, [session, transcript]);

  const modeLabel = useMemo(() => formatModeLabel(mode), [mode]);
  const objectiveLabel = useMemo(() => modeObjectiveLabel(mode), [mode]);

  const remainingSeconds = useMemo(() => {
    if (!targetSeconds) return null;
    const left = targetSeconds - elapsedSeconds;
    return left > 0 ? left : 0;
  }, [targetSeconds, elapsedSeconds]);

  const timerProgress = useMemo(() => {
    if (!targetSeconds || targetSeconds <= 0) return null;
    const pct = (elapsedSeconds / targetSeconds) * 100;
    const clamped = Math.max(0, Math.min(100, pct));
    return clamped;
  }, [targetSeconds, elapsedSeconds]);

  // Has this round already been scored?
  const isScored = useMemo(() => {
    if (!session) return false;
    if (typeof session.total === "number") return true;
    if (typeof session.total_score === "number") return true;
    if (typeof session.meta?.total === "number") return true;
    return false;
  }, [session]);

  useEffect(() => {
    const s = session?.meta;
    if (!s) return;

    const streakNow = typeof s.streak === "number" ? s.streak : 0;
    const prev = prevStreakRef.current;

    if (prev == null) {
      prevStreakRef.current = streakNow;
      return;
    }

    if (streakNow > prev) {
      setStreakFlash("up");
      window.setTimeout(() => setStreakFlash(null), 900);
    } else if (streakNow === 0 && prev > 0) {
      setStreakFlash("break");
      window.setTimeout(() => setStreakFlash(null), 900);
    }

    prevStreakRef.current = streakNow;
  }, [session?.meta?.streak]);
  const ended = isSessionEnded(session);
  const composerDisabled = ended || isScored || sending;

  // Memo: find the latest rep (user) turn that has micro scoring
  const lastRepMicroTurnId = useMemo(() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      const t = turns[i];
      if (t?.role === "user" && t?.micro && typeof t.micro.turn_score === "number") {
        return t.id;
      }
    }
    return null;
  }, [turns]);

  // When the timer hits 0, auto-score the round (once)
  useEffect(() => {
    if (!timerFinished) return;
    if (!mode) return;

    const label = formatModeLabel(mode) || "Round";

    toast(
      `⏱ ${label} timer finished — scoring your round now.`,
    );

    if (!session || !session.id) return;
    if (isScored) return;
    if (scoringBusy) return;

    void (async () => {
      try {
        await handleScoreClick();
      } catch {
        // handleScoreClick already toasts on error
      }
    })();
  }, [timerFinished, mode, toast, session, isScored, scoringBusy]);

  const title = "Sparring session";

  const endReasonRaw: string | null =
    (session?.meta && typeof (session.meta as any).end_reason === "string"
      ? (session.meta as any).end_reason
      : null) || null;
  const endReasonLabel = formatEndReasonLabel(endReasonRaw);

  return (
    <div className="px-4 py-6 w-full max-w-7xl mx-auto">
      {/* Top header + back buttons */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <button
            type="button"
            onClick={() => router.back()}
            className="text-xs text-neutral-400 hover:text-neutral-200 mb-1"
          >
            ← Back
          </button>
          <h1 className="text-xl font-medium text-neutral-50">{title}</h1>
        </div>

        {launchedFromAssignments ? (
          <Link
            href="/assignments"
            className="text-xs rounded border border-emerald-500/60 bg-emerald-500/10 px-3 py-1.5 text-emerald-200 hover:bg-emerald-500/15"
          >
            Back to Assignments
          </Link>
        ) : (
          <Link
            href="/call-library"
            className="text-xs rounded border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-900"
          >
            Back to Call Library
          </Link>
        )}
      </div>

      {loading && (
        <p className="mt-4 text-sm text-neutral-400">
          Loading sparring session…
        </p>
      )}

      {!loading && error && (
        <div className="mt-4">
          <ErrorBox message={error} />
        </div>
      )}

      {!loading && !error && session && (
        <div className="space-y-6 mt-4">
          {/* Top summary card */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-100">
                    Sparring session
                  </span>
                </div>
                <div className="text-xs text-neutral-500">
                  {new Date(session.created_at).toLocaleString()}
                </div>
                {session.rep_id && (
                  <div className="text-xs text-neutral-500 mt-1">
                    Rep ID:{" "}
                    <span className="font-mono text-[11px] text-neutral-400">
                      {session.rep_id}
                    </span>
                  </div>
                )}

                {/* Opponent persona + professional profile */}
                <div className="mt-2 flex flex-col gap-1 text-[11px] text-neutral-300">
                  <div className="flex flex-wrap items-center gap-2">
                    {session.persona_id && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 uppercase tracking-[0.12em] text-[10px]">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        {String(session.persona_id).replace(/_/g, " ")}
                      </span>
                    )}

                    {session.difficulty && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-[10px] uppercase tracking-[0.12em]">
                        Difficulty: {String(session.difficulty)}
                      </span>
                    )}
                  </div>

                  {ended && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
                      <span className={endReasonBadgeClasses(endReasonRaw)}>
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                        {endReasonLabel || "Buyer hung up"}
                      </span>
                    </div>
                  )}

                  {(modeLabel || objectiveLabel || remainingSeconds !== null) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-neutral-300">
                      {modeLabel && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 uppercase tracking-[0.14em]">
                          <span className="h-1 w-1 rounded-full bg-amber-400" />
                          Mode: {modeLabel}
                        </span>
                      )}

                      {objectiveLabel && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5">
                          🎯 {objectiveLabel}
                        </span>
                      )}

                      {remainingSeconds !== null && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5">
                          ⏱ {formatDuration(remainingSeconds)} left
                        </span>
                      )}
                    </div>
                  )}

                  {session.meta?.opponent_profile && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                      {session.meta.opponent_profile.jobTitle && (
                        <span>{session.meta.opponent_profile.jobTitle}</span>
                      )}
                      {session.meta.opponent_profile.industry && (
                        <span className="opacity-60">
                          • {session.meta.opponent_profile.industry}
                        </span>
                      )}
                      {session.meta.opponent_profile.companySize && (
                        <span className="opacity-60">
                          • {session.meta.opponent_profile.companySize}
                        </span>
                      )}
                    </div>
                  )}

                  {personaStats && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                      <span>
                        Global win rate:{" "}
                        {personaStats.winRate != null
                          ? `${Math.round(personaStats.winRate)}%`
                          : "—"}
                      </span>
                      <span className="opacity-60">
                        • {personaStats.wins} wins / {personaStats.total} attempts
                      </span>
                    </div>
                  )}

                  {personaStatsError && (
                    <div className="mt-1 text-[10px] text-red-400">
                      {personaStatsError}
                    </div>
                  )}
                </div>
              </div>

              {/* Right-hand summary: score, outcome, XP, timer, actions */}
              {launchedFromAssignments && assignmentAutoCompleted && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
                  ✅ Assignment completed via sparring.
                  <Link href="/assignments" className="ml-2 underline text-emerald-100 hover:text-emerald-50">
                    View assignments
                  </Link>
                </div>
              )}
              <div className="flex flex-col items-end gap-2 text-xs">
                {/* Score + outcome + XP */}
                <div className="flex items-center gap-2">
                  {totalScore !== null && (
                    <span
                      className={`rounded-full border px-3 py-1 ${scoreBadgeColour(
                        totalScore
                      )}`}
                    >
                      Score {formatScore(totalScore)}
                    </span>
                  )}

                  {outcome && (
                    <span
                      className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${outcome === "win"
                        ? "border-emerald-500 text-emerald-300"
                        : outcome === "loss"
                          ? "border-red-500 text-red-300"
                          : "border-amber-500 text-amber-300"
                        }`}
                    >
                      {outcome === "win"
                        ? "Win"
                        : outcome === "loss"
                          ? "Loss"
                          : "Neutral"}
                    </span>
                  )}

                  {typeof session.xp_awarded === "number" && (
                    <span
                      className={
                        "rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-neutral-100" +
                        (streakFlash === "up" ? " animate-pulse" : "")
                      }
                      title="XP for this run (final after scoring)"
                    >
                      XP {session.xp_awarded}
                    </span>
                  )}

                  {projectedXpLabel(session) && (
                    <span className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-[10px] text-neutral-300">
                      {projectedXpLabel(session)}
                    </span>
                  )}

                  {streakFlash === "up" && (
                    <span className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold text-emerald-300">
                      🔥 Streak +1
                    </span>
                  )}

                  {streakFlash === "break" && (
                    <span className="rounded-full border border-amber-500/60 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold text-amber-300">
                      Streak broken
                    </span>
                  )}
                </div>

                {/* Duration + Turns */}
                <div className="flex items-center gap-3 text-[11px] text-neutral-400">
                {getLastNRepMicroScores(turns, 5).length > 0 && (
                  <div className="mt-1 w-full">
                    <div className="flex items-center justify-end gap-2 text-[10px] text-neutral-400">
                      <span className="opacity-70">Micro trend</span>
                      {(() => {
                        const scores = getLastNRepMicroScores(turns, 5);
                        const t = microTrendLabel(scores);
                        return <span className={microPillClasses(t.dir)}>{t.label}</span>;
                      })()}
                    </div>

                    <div className="mt-1 flex items-end justify-end gap-[3px]">
                      {getLastNRepMicroScores(turns, 5).map((v, idx) => {
                        const h = Math.max(6, Math.min(18, Math.round(v / 6)));
                        return (
                          <div
                            key={`microbar-${idx}`}
                            className="w-2 rounded-sm bg-neutral-700/80"
                            style={{ height: `${h}px` }}
                            title={`Micro ${v}/100`}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
                  {durationSeconds !== null && (
                    <span>{formatDuration(durationSeconds)}</span>
                  )}
                  {turnsCount !== null && <span>{turnsCount} turns</span>}
                </div>

                {/* Timer bar (if mode uses a timer) */}
                {targetSeconds && timerProgress !== null && (
                  <div className="mt-1 flex flex-col items-end gap-1 text-[10px] text-neutral-400 w-full">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1">
                        {timerFinished ? "⏱ Time's up" : "⏱"}
                        <span>
                          {timerFinished
                            ? `${formatDuration(targetSeconds)} round`
                            : remainingSeconds !== null
                              ? `${formatDuration(remainingSeconds)} left`
                              : "Timer"}
                        </span>
                      </span>
                      <span className="text-[10px] text-neutral-500">
                        {elapsedSeconds}s elapsed
                      </span>
                    </div>
                    <div className="h-1.5 w-40 overflow-hidden rounded-full bg-neutral-900">
                      <div
                        className={`h-1.5 rounded-full ${timerFinished ? "bg-red-500" : "bg-emerald-500"
                          } transition-[width] duration-300 ease-out`}
                        style={{ width: `${timerProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Scoring actions */}
                {scoreError && (
                  <div className="mt-1 text-[10px] text-red-400 max-w-xs text-right">
                    {scoreError}
                  </div>
                )}
                <div className="mt-1 flex flex-col items-end gap-1">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleScoreClick}
                      disabled={scoringBusy || isScored}
                      className={
                        "inline-flex items-center gap-1 rounded-full border border-emerald-500 bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-black disabled:opacity-60" +
                        (timerFinished && !isScored ? " animate-pulse" : "")
                      }
                    >
                      {isScored
                        ? "Round scored"
                        : scoringBusy
                          ? "Scoring…"
                          : "End round & score me"}
                    </button>
                    <button
                      type="button"
                      onClick={onReplaySession}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-500/70 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20"
                    >
                      <span>Restart drill (new session)</span>
                      <span aria-hidden="true">↻</span>
                    </button>
                  </div>

                  {timerFinished && !isScored && (
                    <p className="text-[10px] text-neutral-400">
                      Timer finished — hit{" "}
                      <span className="font-semibold">End round &amp; score me</span> to see
                      your result.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
          {emotionalSeries && emotionalSeries.length > 0 && (
            <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3">
              <div className="flex items-center justify-between text-xs text-neutral-400 mb-1">
                <span>Buyer emotion over this session</span>
                {typeof session.meta?.emotional_state === "number" && (
                  <span>
                    Final:{" "}
                    <span className="font-medium text-neutral-100">
                      {session.meta.emotional_state > 0
                        ? "Warmer"
                        : session.meta.emotional_state < 0
                          ? "Colder"
                          : "Neutral"}
                    </span>
                  </span>
                )}
              </div>
              <div className="h-8 flex items-end gap-[2px] rounded-md bg-neutral-900 px-1 py-1">
                {emotionalSeries.map((value, idx) => {
                  const magnitude = Math.min(
                    32,
                    Math.max(6, Math.abs(value))
                  );
                  const positive = value >= 0;
                  return (
                    <div
                      key={idx}
                      className={
                        "flex-1 rounded-sm transition-all " +
                        (positive
                          ? "bg-emerald-500/70"
                          : "bg-rose-500/70")
                      }
                      style={{ height: `${magnitude}px` }}
                    />
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-neutral-500">
                <span>Colder</span>
                <span>Warmer</span>
              </div>
            </div>
          )}

          {/* Session summary */}
          {(session.summary || (session.flags && session.flags.length > 0)) && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-4">
              <h2 className="text-sm font-medium text-neutral-100 mb-2">
                Session summary
              </h2>
              {session.summary && (
                <p className="text-xs text-neutral-300 leading-relaxed">
                  {session.summary}
                </p>
              )}
              {session.flags && session.flags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {session.flags.map((flag) => (
                    <span
                      key={flag}
                      className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300"
                    >
                      {flag.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Live sparring conversation */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-sm font-medium text-neutral-100">
                  Live sparring conversation
                </h2>
                {ended && (
                  <p className="text-[10px] text-neutral-400">
                    Session ended — buyer hung up. Restart drill (new session) to start a fresh round.
                  </p>
                )}
              </div>
              <span className="text-[11px] rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                {modeLabel ? `${modeLabel} mode` : "Practice mode"}
              </span>
            </div>

            {chatError && (
              <div className="mb-2">
                <ErrorBox message={chatError} />
              </div>
            )}

            <div
              ref={scrollRef}
              className={
                (turns.length >= 2
                  ? "h-[70vh] max-h-[720px]"
                  : "h-[42vh] max-h-[420px]") +
                " overflow-auto space-y-3 pr-1 mb-3 border border-neutral-900 rounded-md bg-neutral-950/60 px-3 py-2 transition-[height,max-height] duration-300"
              }
            >
              {turns.length === 0 ? (
                <p className="text-xs text-neutral-500">
                  No turns yet. Start by sending your first line to the buyer.
                </p>
              ) : (
                turns.map((t) => (
                  <div
                    key={t.id}
                    id={`turn-${t.id}`}
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${t.role === "user"
                      ? "ml-auto bg-emerald-600/20 border border-emerald-500/40"
                      : "mr-auto bg-neutral-900 border border-neutral-700"
                      }`}
                  >
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-neutral-400">
                      {t.role === "user" ? "You" : "Buyer"}
                    </div>
                    <div className="text-neutral-100 whitespace-pre-wrap">
                      {t.text}
                    </div>
                    {t.role === "assistant" &&
                      Array.isArray(whispersByTurnId[t.id]) &&
                      whispersByTurnId[t.id].length > 0 && (
                        <div className="mt-2 space-y-1">
                          {whispersByTurnId[t.id].slice(0, 2).map((w, idx) => (
                            <div
                              key={`${t.id}-whisper-${idx}`}
                              className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200"
                            >
                              <div className="mb-1 flex items-center gap-2">
                                <span className={tagBadgeClasses(w.tag)}>{w.tag}</span>
                                <span className="opacity-80">🧠</span>
                                <span className="text-neutral-200">Coaching</span>
                              </div>
                              <div className="text-emerald-100">{w.text}</div>

                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const line = buildSuggestedRepLine(t.text, w);
                                    setInput(line);
                                    window.setTimeout(() => inputRef.current?.focus(), 0);
                                  }}
                                  className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-200 hover:bg-emerald-500/20"
                                >
                                  Insert suggested line
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    const line = buildSuggestedRepLine(t.text, w);
                                    setInput(line.length > 110 ? line.slice(0, 110).trim() + "…" : line);
                                    window.setTimeout(() => inputRef.current?.focus(), 0);
                                  }}
                                  className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-1 text-[10px] font-medium text-neutral-200 hover:bg-neutral-800"
                                >
                                  Insert shorter
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    {t.role === "user" && t.micro && (
                      <div className="mt-2 rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-[10px] text-neutral-300">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-neutral-100">
                            Micro {formatScore((t.micro as any).turn_score)}/100
                          </span>
                          {(t.micro as any).micro_breakdown && (
                            <span className="text-neutral-400">
                              O:{formatScore((t.micro as any).micro_breakdown?.opener)} D:{formatScore((t.micro as any).micro_breakdown?.discovery)} P:{formatScore((t.micro as any).micro_breakdown?.pitch)} Ob:{formatScore((t.micro as any).micro_breakdown?.objections)} C:{formatScore((t.micro as any).micro_breakdown?.close)}
                            </span>
                          )}
                          {(() => {
                            const prev = prevRepMicroScore(turns, t.id);
                            const cur = typeof t.micro?.turn_score === "number" ? t.micro.turn_score : null;
                            if (prev == null || cur == null) return null;
                            const d = Math.round(cur - prev);
                            const dir = d > 0 ? "up" : d < 0 ? "down" : "flat";
                            const label = d > 0 ? `↑ +${d}` : d < 0 ? `↓ ${d}` : "→ 0";
                            return (
                              <span className={microPillClasses(dir)} title="Delta vs previous rep turn">
                                {label}
                              </span>
                            );
                          })()}
                        </div>
                        {(t.micro as any).coach_note && (
                          <div className="mt-1 text-neutral-400">
                            {(t.micro as any).coach_note}
                          </div>
                        )}
                        {/* --- Streak / XP meta (only show on latest rep micro turn) --- */}
                        {session?.meta && lastRepMicroTurnId === t.id && (
                          <div className="mt-2 flex flex-wrap gap-2 text-[9px] text-neutral-300">
                            <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5">
                              Streak <b>{session.meta.streak ?? 0}</b>
                            </span>
                            <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5">
                              Best <b>{session.meta.best_streak ?? 0}</b>
                            </span>
                            <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5">
                              x<b>
                                {typeof session.meta.xp_multiplier === "number"
                                  ? session.meta.xp_multiplier.toFixed(1)
                                  : "1.0"}
                              </b>
                            </span>
                            {session.meta.comeback_pending && (
                              <span className="rounded-full border border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-amber-300">
                                Comeback armed
                              </span>
                            )}
                            {(session.meta.xp_bonus_pending ?? 0) > 0 && (
                              <span className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                                +{session.meta.xp_bonus_pending} XP queued
                              </span>
                            )}
                          </div>
                        )}
                        {session?.meta && lastRepMicroTurnId === t.id && (
                          () => {
                            const threshold = typeof session.meta.streak_threshold === "number" ? session.meta.streak_threshold : 75;
                            const raw = typeof (session.meta as any).last_turn_score_raw === "number" ? (session.meta as any).last_turn_score_raw : null;
                            const last = typeof session.meta.last_turn_score === "number" ? session.meta.last_turn_score : null;
                            const lastUsed = last ?? raw;
                            if (lastUsed == null) return null;

                            if (lastUsed < threshold) {
                              return (
                                <div className="mt-2 text-[10px] text-neutral-400">
                                  Streak needs <span className="font-semibold">{threshold}+</span>. Last turn was <span className="font-semibold">{Math.round(lastUsed)}</span>. Try a clearer next-step close.
                                </div>
                              );
                            }
                            return null;
                          }
                        )()}
                      </div>
                    )}
                    <div className="mt-1 text-[10px] text-neutral-500">
                      {new Date(t.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onSend();
                    }
                  }}
                  placeholder={
                    ended
                      ? "Session ended — score this run or replay to start again."
                      : isScored
                        ? "Round is scored — hit Replay to run it again."
                        : "Type your next line to the buyer…"
                  }
                  disabled={composerDisabled}
                  className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs outline-none focus:border-emerald-500 disabled:opacity-40"
                />
                <button
                  type="button"
                  onClick={onSend}
                  disabled={composerDisabled || !input.trim()}
                  className="rounded-md border border-emerald-500 bg-emerald-600 px-3 py-2 text-xs font-medium text-black disabled:opacity-40"
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>

              {isScored && (
                <p className="text-[10px] text-neutral-400">
                  This round has been scored. Use{" "}
                  <span className="font-semibold">Restart drill (new session)</span> to start a fresh round.
                </p>
              )}

              {ended && !isScored && (
                <p className="text-[10px] text-neutral-400">
                  Buyer hung up on this round. Use{" "}
                  <span className="font-semibold">Restart drill (new session)</span> to start a new attempt.
                </p>
              )}

              <div
                className={
                  "mt-2 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-[11px] text-neutral-200 min-h-[92px] transition-opacity duration-300 " +
                  (whispererLoading ? "opacity-90" : "opacity-100")
                }
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium text-neutral-100">
                    Whisperer suggestions
                  </span>
                  {whispererLoading && (
                    <span className="text-[10px] text-neutral-400">
                      Analysing…
                    </span>
                  )}
                </div>

                {whispererError && (
                  <div className="mb-1 text-[10px] text-red-400">
                    {whispererError}
                  </div>
                )}

                <div className="transition-all duration-300 ease-out">
                  {!whispererLoading && !whispererError && whispererHits.length === 0 && (
                    <p className="text-[10px] text-neutral-500">
                      Coaching appears inline under the latest buyer message.
                    </p>
                  )}

                  {whispererHits.length > 0 && (
                    <ul className="space-y-1 animate-[fadeIn_200ms_ease-out]">
                      {whispererHits.slice(0, 3).map((hit, idx) => (
                        <li key={`${hit.type}-${idx}`} className="text-[10px] text-neutral-200">
                          <span className="mr-1 opacity-70">•</span>
                          {hit.suggestion.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Score breakdown */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-4">
            <h2 className="text-sm font-medium text-neutral-100 mb-3">
              Score breakdown
            </h2>

            {totalScore !== null && (
              <div className="mb-3 flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs">
                <div className="flex flex-col">
                  <span className="text-neutral-300">Round score</span>
                  {session?.summary && (
                    <span className="text-[11px] text-neutral-400">
                      {session.summary}
                    </span>
                  )}
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${scoreBadgeColour(
                    totalScore
                  )}`}
                >
                  {formatScore(totalScore)}/100
                </span>
              </div>
            )}

            {Object.keys(breakdown).length === 0 && (
              <p className="text-xs text-neutral-500">
                No detailed scoring breakdown stored for this session yet. As we
                upgrade the scoring engine, you&apos;ll see opener, discovery,
                pitch, objection handling, and close scores here.
              </p>
            )}

            {Object.keys(breakdown).length > 0 && (
              <div className="space-y-2">
                {(
                  [
                    ["opener", "Opener"],
                    ["discovery", "Discovery"],
                    ["pitch", "Pitch"],
                    ["objections", "Objections"],
                    ["close", "Close"],
                  ] as [keyof ScoreBreakdown, string][]
                ).map(([key, label]) => {
                  const value = breakdown[key];
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <div className="w-28 text-[11px] text-neutral-400">
                        {label}
                      </div>
                      <div className="flex-1 h-1.5 rounded-full bg-neutral-900 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full bg-neutral-200 ${scoreBarWidth(
                            value
                          )}`}
                        />
                      </div>
                      <div className="w-10 text-right text-[11px] text-neutral-300">
                        {formatScore(value)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Voice / tone block */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-4">
            <h2 className="text-sm font-medium text-neutral-100 mb-3">
              Voice &amp; delivery
            </h2>

            {Object.keys(voice).length === 0 && (
              <p className="text-xs text-neutral-500">
                No voice profile stored for this session yet. Once the Voice
                Personality Score™ module is live, you&apos;ll see tone,
                clarity, control, and filler-word scores here.
              </p>
            )}

            {Object.keys(voice).length > 0 && (
              <div className="grid grid-cols-2 gap-3 text-xs">
                {(
                  [
                    ["tone", "Tone"],
                    ["clarity", "Clarity"],
                    ["control", "Control"],
                    ["filler", "Filler words"],
                  ] as [keyof VoiceBreakdown, string][]
                ).map(([key, label]) => {
                  const value = voice[key];
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2"
                    >
                      <span className="text-neutral-300">{label}</span>
                      <span className="font-mono text-[11px] text-neutral-100">
                        {formatScore(value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Transcript / timeline */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-4">
            <h2 className="text-sm font-medium text-neutral-100 mb-3">
              Conversation timeline
            </h2>

            {/* Whisper markers */}
            {Object.keys(whispersByTurnId).length > 0 && (
              <div className="mb-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                <div className="mb-1 text-[11px] font-medium text-emerald-300">
                  Whisper markers
                </div>
                <div className="space-y-1">
                  {Object.entries(whispersByTurnId).map(([turnId, suggestions]) =>
                    suggestions.slice(0, 2).map((w, idx) => (
                      <button
                        type="button"
                        key={`${turnId}-marker-${idx}`}
                        onClick={() => {
                          const el = document.getElementById(`turn-${turnId}`);
                          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                        className="w-full text-left rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 hover:bg-neutral-900"
                      >
                        <div className="flex items-center gap-2">
                          <span className={tagBadgeClasses(w.tag)}>{w.tag}</span>
                          <span className="opacity-80">🧠</span>
                          <span className="text-[10px] text-neutral-200">{w.text}</span>
                        </div>
                        <div className="mt-0.5 text-[9px] text-neutral-500">Jump to buyer turn</div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {transcript.length === 0 && (
              <p className="text-xs text-neutral-500">
                No transcript stored for this sparring session yet. When we plug
                in the full sparring engine, this will show a turn-by-turn
                timeline with rep vs buyer messages and coaching highlights.
              </p>
            )}

            {transcript.length > 0 && (
              <div className="space-y-3 max-h-[70vh] overflow-auto pr-1">
                {transcript.map((turn, idx) => {
                  const role =
                    turn.role?.toLowerCase() === "rep"
                      ? "Rep"
                      : turn.role?.toLowerCase() === "buyer"
                        ? "Buyer"
                        : turn.role || "Turn";

                  return (
                    <div
                      key={`${idx}-${turn.ts ?? ""}`}
                      className="flex gap-3 text-xs"
                    >
                      <div className="pt-1">
                        <span className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300">
                          {role}
                        </span>
                      </div>
                      <div className="flex-1">
                        {turn.label && (
                          <div className="text-[10px] text-neutral-500 mb-0.5">
                            {turn.label}
                          </div>
                        )}
                        <div className="text-neutral-200 whitespace-pre-wrap">
                          {turn.text}
                        </div>
                        {typeof turn.ts === "number" && (
                          <div className="text-[10px] text-neutral-500 mt-0.5">
                            {turn.ts.toFixed(1)}s
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    <style jsx global>{`
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(2px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `}</style>
    </div>
  );
}