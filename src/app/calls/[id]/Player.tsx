"use client";

import { useEffect, useState } from "react";

// Web -> API base (local default; on Vercel set NEXT_PUBLIC_API_BASE to your tunnel)
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

export default function AudioPlayer({ callId, userId }: { callId: string; userId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadUrl() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`${API_BASE}/v1/calls/${callId}/audio-url`, {
        headers: { "x-user-id": userId },
        cache: "no-store",
      });
      const j = await res.json();
      if (!j.ok) {
        setErr(j.error || "Failed to sign URL");
        setUrl(null);
        return;
      }
      setUrl(j.url);
    } catch (e: any) {
      setErr(e?.message || "Failed to load");
      setUrl(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, userId]);

  return (
    <div className="rounded-2xl border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Audio</h2>
        <button onClick={loadUrl} className="text-sm underline disabled:opacity-50" disabled={loading}>
          {loading ? "Refreshing…" : "Refresh URL"}
        </button>
      </div>

      {err && <div className="text-red-500 text-sm">{err}</div>}

      {url ? (
        <audio controls src={url} className="w-full">
          Your browser does not support the audio element.
        </audio>
      ) : (
        <div className="text-sm text-gray-400">No URL yet.</div>
      )}
    </div>
  );
}