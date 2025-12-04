"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchJsonWithRetry } from "@/lib/fetchJsonwithretry";
import ErrorBox from "@/components/ErrorBox";

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
};

type SparringMeta = {
  total?: number;
  breakdown?: ScoreBreakdown;
  voice?: VoiceBreakdown;
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

export default function SparringSessionPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [session, setSession] = useState<SparringSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [turns, setTurns] = useState<SparTurn[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [personaStats, setPersonaStats] = useState<PersonaStats | null>(null);
  const [personaStatsError, setPersonaStatsError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    let alive = true;
    setLoading(true);
    setError(null);

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
        if (Array.isArray(res.turns)) {
          setTurns(res.turns as SparTurn[]);
        } else {
          setTurns([]);
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
        console.error("Failed to load persona stats", e);
        setPersonaStatsError(e?.message || "Failed to load persona stats.");
      }
    })();

    return () => {
      alive = false;
    };
  }, [session?.persona_id]);

  // Scroll chat to bottom whenever turns change
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns.length]);

  async function onSend() {
    if (!input.trim() || !id) return;
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
        setTurns((prev) => [...prev, ...(res.turns as SparTurn[])]);
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
      const body: any = {
        personaId: session.persona_id || "price_sensitive",
        difficulty: "normal",
      };

      const res = await fetchJsonWithRetry(
        "/api/proxy/v1/sparring/sessions",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!res || res.ok === false || !res.session?.id) {
        throw new Error(res?.error || "Failed to start new sparring session.");
      }

      // Navigate to the new sparring session
      router.push(`/sparring/${encodeURIComponent(res.session.id)}`);
    } catch (e: any) {
      console.error("Replay session failed", e);
      setError(e?.message || "Failed to replay this drill.");
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

  const title = "Sparring session";

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto">
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

        <Link
          href="/call-library"
          className="text-xs rounded border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-900"
        >
          Back to Call Library
        </Link>
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

                  {session.meta?.opponent_profile && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                      {session.meta.opponent_profile.jobTitle && (
                        <span>{session.meta.opponent_profile.jobTitle}</span>
                      )}

                      {personaStats && (
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
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
                        <div className="text-[10px] text-red-400">
                          {personaStatsError}
                        </div>
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
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 text-xs">
                {/* Score + XP */}
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

                  {typeof session.xp_awarded === "number" && (
                    <span className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-neutral-100">
                      XP {session.xp_awarded}
                    </span>
                  )}
                </div>

                {/* Duration + Turns */}
                <div className="flex items-center gap-3 text-[11px] text-neutral-400">
                  {durationSeconds !== null && (
                    <span>{formatDuration(durationSeconds)}</span>
                  )}
                  {turnsCount !== null && <span>{turnsCount} turns</span>}
                </div>

                {/* REPLAY BUTTON */}
                <button
                  type="button"
                  onClick={onReplaySession}
                  className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-500/70 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20"
                >
                  <span>Replay this drill</span>
                  <span aria-hidden="true">↻</span>
                </button>
              </div>
            </div>
          </div>

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
              <h2 className="text-sm font-medium text-neutral-100">
                Live sparring conversation
              </h2>
              <span className="text-[11px] rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                Practice mode
              </span>
            </div>

            {chatError && (
              <div className="mb-2">
                <ErrorBox message={chatError} />
              </div>
            )}

            <div
              ref={scrollRef}
              className="max-h-[320px] overflow-auto space-y-3 pr-1 mb-3 border border-neutral-900 rounded-md bg-neutral-950/60 px-3 py-2"
            >
              {turns.length === 0 ? (
                <p className="text-xs text-neutral-500">
                  No turns yet. Start by sending your first line to the buyer.
                </p>
              ) : (
                turns.map((t) => (
                  <div
                    key={t.id}
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
                    <div className="mt-1 text-[10px] text-neutral-500">
                      {new Date(t.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSend();
                  }
                }}
                placeholder="Type your next line to the buyer…"
                className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={onSend}
                disabled={sending || !input.trim()}
                className="rounded-md border border-emerald-500 bg-emerald-600 px-3 py-2 text-xs font-medium text-black disabled:opacity-40"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>

          {/* Score breakdown */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-4">
            <h2 className="text-sm font-medium text-neutral-100 mb-3">
              Score breakdown
            </h2>

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

            {transcript.length === 0 && (
              <p className="text-xs text-neutral-500">
                No transcript stored for this sparring session yet. When we plug
                in the full sparring engine, this will show a turn-by-turn
                timeline with rep vs buyer messages and coaching highlights.
              </p>
            )}

            {transcript.length > 0 && (
              <div className="space-y-3 max-h-[480px] overflow-auto pr-1">
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
    </div>
  );
}