"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Search, Volume2 } from "lucide-react";

/**
 * Gravix Transcript Timeline Sync – Step 4
 * -------------------------------------------------
 * Features
 * - Render transcript turns with speaker labels
 * - Highlight current line as audio plays (time-based)
 * - Click any line to jump the audio to that timestamp
 * - Auto-scroll active line into view
 * - Keyboard: Space (play/pause), J (prev line), K (next line)
 * - Lightweight search filter + speaker filter
 * - Works with App Router (Next.js 14+) – drop into src/app/*
 * - Tailwind styling; uses lucide-react icons
 *
 * Expected transcript shape (seconds):
 *   { id: string, start: number, end: number, speaker?: string, text: string }
 *
 * Example page: default export renders a ready-to-run demo with mocked data.
 */

// ---------- Types ----------
export type Turn = {
  id: string;
  start: number; // seconds
  end: number;   // seconds
  speaker?: string;
  text: string;
};

// ---------- Utilities ----------
const formatTime = (s: number) => {
  const sign = s < 0 ? "-" : "";
  s = Math.max(0, Math.floor(Math.abs(s)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (
    sign +
    (h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}` : `${m}:${sec.toString().padStart(2, "0")}`)
  );
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

// ---------- Core Component ----------
function TranscriptPlayer({
  audioSrc,
  transcript,
  title = "Call Review",
}: {
  audioSrc: string;
  transcript: Turn[];
  title?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [q, setQ] = useState("");
  const [speakerFilter, setSpeakerFilter] = useState<string | "all">("all");
  const [volume, setVolume] = useState(1);

  // Build speaker list for filter
  const speakers = useMemo(() => {
    const s = new Set<string>();
    transcript.forEach(t => t.speaker && s.add(t.speaker));
    return Array.from(s);
  }, [transcript]);

  // Filtered transcript
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return transcript.filter(t => {
      const matchesQ = !ql || t.text.toLowerCase().includes(ql);
      const matchesSpeaker = speakerFilter === "all" || (t.speaker ?? "") === speakerFilter;
      return matchesQ && matchesSpeaker;
    });
  }, [transcript, q, speakerFilter]);

  // Find active index by time (binary search for perf on long lists)
  const activeIndex = useMemo(() => {
    const time = currentTime;
    let lo = 0, hi = filtered.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const turn = filtered[mid];
      if (time >= turn.start && time < turn.end) {
        ans = mid; break;
      } else if (time < turn.start) {
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return ans;
  }, [currentTime, filtered]);

  // Auto-scroll active line into view
  useEffect(() => {
    if (!activeLineRef.current) return;
    const el = activeLineRef.current;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex, q, speakerFilter]);

  // Wire audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onLoaded = () => setDuration(audio.duration || 0);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("loadedmetadata", onLoaded);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("loadedmetadata", onLoaded);
    };
  }, []);

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === "INPUT") return; // ignore typing in inputs
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key.toLowerCase() === "j") {
        // prev turn
        if (activeIndex > 0) seekTo(filtered[activeIndex - 1].start);
      } else if (e.key.toLowerCase() === "k") {
        // next turn
        if (activeIndex >= 0 && activeIndex < filtered.length - 1) seekTo(filtered[activeIndex + 1].start);
      } else if (e.key === "ArrowLeft") {
        seekTo(currentTime - 5);
      } else if (e.key === "ArrowRight") {
        seekTo(currentTime + 5);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, filtered, currentTime]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play(); else audio.pause();
  };

  const seekTo = (t: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = clamp(t, 0, duration || 0);
    setCurrentTime(audio.currentTime);
  };

  const onLineClick = (t: Turn) => seekTo(t.start);

  const onVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  };

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-100">
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">{title}</h1>
        </header>

        {/* Player Card */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-1">
            <div className="rounded-2xl bg-neutral-900/70 border border-neutral-800 p-4 shadow">
              <audio ref={audioRef} src={audioSrc} preload="metadata" />

              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlay}
                  className="p-3 rounded-xl border border-neutral-700 hover:bg-neutral-800 transition shadow"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                </button>

                <button onClick={() => seekTo(currentTime - 10)} className="p-2 rounded-lg hover:bg-neutral-800" aria-label="Back 10s">
                  <SkipBack size={18} />
                </button>
                <button onClick={() => seekTo(currentTime + 10)} className="p-2 rounded-lg hover:bg-neutral-800" aria-label="Forward 10s">
                  <SkipForward size={18} />
                </button>
              </div>

              <div className="mt-4">
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.01}
                  value={currentTime}
                  onChange={(e) => seekTo(Number(e.target.value))}
                  className="w-full accent-white"
                />
                <div className="flex justify-between text-xs text-neutral-400 mt-1">
                  <span>{formatTime(currentTime)}</span>
                  <span>{duration ? formatTime(duration) : "0:00"}</span>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 text-sm">
                <Volume2 size={16} />
                <input type="range" min={0} max={1} step={0.01} value={volume} onChange={onVolume} className="w-full accent-white" />
              </div>

              <div className="mt-6 grid grid-cols-3 gap-2 text-sm">
                <div className="col-span-2 flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-800 bg-neutral-900/50">
                  <Search size={16} />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search transcript…"
                    className="bg-transparent outline-none w-full"
                  />
                </div>
                <select
                  value={speakerFilter}
                  onChange={(e) => setSpeakerFilter(e.target.value as any)}
                  className="px-3 py-2 rounded-xl border border-neutral-800 bg-neutral-900/50"
                >
                  <option value="all">All speakers</option>
                  {speakers.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="mt-4 text-xs text-neutral-400">
                <p>Shortcuts: <kbd className="px-1 py-0.5 rounded bg-neutral-800 border border-neutral-700">Space</kbd> play/pause, <kbd className="px-1 py-0.5 rounded bg-neutral-800 border border-neutral-700">J</kbd> prev, <kbd className="px-1 py-0.5 rounded bg-neutral-800 border border-neutral-700">K</kbd> next, ←/→ ±5s</p>
              </div>
            </div>
          </div>

          {/* Transcript Pane */}
          <div className="md:col-span-2">
            <div
              ref={containerRef}
              className="h-[70vh] md:h-[72vh] overflow-auto rounded-2xl border border-neutral-800 bg-neutral-900/40 p-2 md:p-3"
            >
              {filtered.map((t, i) => {
                const active = i === activeIndex;
                return (
                  <div
                    key={t.id}
                    ref={active ? activeLineRef : null}
                    onClick={() => onLineClick(t)}
                    className={[
                      "cursor-pointer rounded-xl px-3 py-2 mb-2 transition border",
                      active
                        ? "bg-white text-neutral-900 border-white"
                        : "hover:bg-neutral-800/70 border-transparent",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2 text-xs md:text-[13px]">
                      <span className={active ? "font-semibold" : "text-neutral-400"}>
                        {t.speaker ?? "Speaker"}
                      </span>
                      <span className="text-neutral-400">•</span>
                      <span className="tabular-nums text-neutral-400">{formatTime(t.start)}</span>
                    </div>
                    <div className="mt-0.5 leading-relaxed md:text-[15px]">
                      {t.text}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="text-center py-12 text-neutral-400">No lines match your filter.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Demo Page (replace with your [id]/page.tsx) ----------
// In real app, fetch audio URL from Supabase and transcript JSON from backend.
const DEMO_AUDIO =
  "https://cdn.pixabay.com/download/audio/2022/03/15/audio_9e27a5b3a2.mp3?filename=sample-voice-call-110124.mp3"; // placeholder public sample

const DEMO_TRANSCRIPT: Turn[] = [
  { id: "t0", start: 0.0, end: 3.6, speaker: "Rep", text: "Hi, this is Alex from Gravix—did I catch you at a bad time?" },
  { id: "t1", start: 3.6, end: 7.8, speaker: "Buyer", text: "Uh, I have a minute. What's this about?" },
  { id: "t2", start: 7.8, end: 14.2, speaker: "Rep", text: "We help teams review sales calls in minutes. Can I ask how you're coaching calls today?" },
  { id: "t3", start: 14.2, end: 19.9, speaker: "Buyer", text: "Mostly randomly—we spot check a few each week." },
  { id: "t4", start: 19.9, end: 27.0, speaker: "Rep", text: "Got it. If we showed patterns by objection and sent notes to Slack, would that help?" },
  { id: "t5", start: 27.0, end: 33.5, speaker: "Buyer", text: "Maybe. Pricing is usually the blocker for us." },
  { id: "t6", start: 33.5, end: 40.0, speaker: "Rep", text: "That's common. Quick question—how many calls a week per rep?" },
  { id: "t7", start: 40.0, end: 47.2, speaker: "Buyer", text: "Around forty. We're a small team." },
  { id: "t8", start: 47.2, end: 55.0, speaker: "Rep", text: "Cool. I can show you a 3-min review that flags weak closes. Want me to send a sample?" },
  { id: "t9", start: 55.0, end: 63.0, speaker: "Buyer", text: "Sure—email works." },
];

export default function Page() {
  return (
    <TranscriptPlayer
      audioSrc={DEMO_AUDIO}
      transcript={DEMO_TRANSCRIPT}
      title="Transcript Timeline – Demo"
    />
  );
}
