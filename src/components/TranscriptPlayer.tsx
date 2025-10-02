// src/components/TranscriptPlayer.tsx
"use client";

import { useEffect, useState } from "react";

type Props = { callId: string; className?: string };

export default function TranscriptPlayer({ callId, className = "" }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const ctrl = new AbortController();
    let alive = true;

    async function run() {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(`/api/proxy/v1/calls/${callId}/audio-url`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        const j: { ok?: boolean; url?: string; error?: string } = await r.json().catch(() => ({}));
        if (!alive) return;
        if (j.ok && j.url) setSrc(j.url);
        else setErr(j.error || "No audio URL available");
      } catch (e: unknown) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : "Failed to load audio");
      } finally {
        if (alive) setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [callId]);

  if (loading) return <div className="text-sm text-neutral-500">Loading audio…</div>;
  if (err) return <div className="text-sm text-red-600">Audio error: {err}</div>;
  if (!src) return <div className="text-sm text-neutral-500">No audio found.</div>;

  return (
    <div className={className}>
      <audio className="w-full" controls src={src} />
    </div>
  );
}