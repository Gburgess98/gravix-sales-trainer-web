'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

type Props = { src: string };

function fmt(t: number) {
  if (!isFinite(t) || t < 0) return '0:00';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AudioPlayer({ src }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.paused ? el.play() : el.pause();
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => setCurrent(el.currentTime);
    const onLoaded = () => setDuration(el.duration || 0);
    const onEnded = () => setIsPlaying(false);

    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onLoaded);
    el.addEventListener('ended', onEnded);

    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onLoaded);
      el.removeEventListener('ended', onEnded);
    };
  }, []);

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = audioRef.current;
    if (!el) return;
    const next = Number(e.target.value);
    el.currentTime = next;
    setCurrent(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      if (e.code === 'ArrowLeft' && audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5);
      if (e.code === 'ArrowRight' && audioRef.current) audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 5);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, duration]);

  return (
    <div className="w-full max-w-3xl p-4 rounded-2xl shadow bg-white dark:bg-neutral-900">
      <audio ref={audioRef} src={src} preload="auto" />
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="px-4 py-2 rounded-2xl bg-black text-white dark:bg-white dark:text-black"
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <div className="text-sm tabular-nums w-16 text-right">{fmt(current)}</div>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step="0.1"
          value={current}
          onChange={onSeek}
          className="flex-1 accent-black"
        />
        <div className="text-sm tabular-nums w-16">{fmt(duration)}</div>
      </div>
    </div>
  );
}
