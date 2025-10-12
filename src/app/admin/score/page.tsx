// src/app/admin/score/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";

type ApiResp = { ok: boolean; callId?: string; jobId?: string; result?: any; error?: string };

export default function AdminForceScorePage() {
  const [callId, setCallId] = useState("");
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<ApiResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const isUuid = (s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

  async function forceScore(e: React.FormEvent) {
    e.preventDefault();
    setResp(null);
    setErr(null);
    if (!isUuid(callId)) {
      setErr("Please enter a valid UUID.");
      return;
    }
    try {
      setLoading(true);
      const r = await fetch(`/api/proxy/v1/admin/force-score/${encodeURIComponent(callId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const j: ApiResp = await r.json();
      if (!r.ok || !j.ok) {
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      setResp(j);
    } catch (e: any) {
      setErr(e?.message || "Failed to trigger scoring");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Force Score a Call</h1>
        <Link className="underline text-sm ml-auto" href="/recent-calls">Recent calls</Link>
      </div>

      <form onSubmit={forceScore} className="space-y-3">
        <input
          value={callId}
          onChange={(e) => setCallId(e.target.value.trim())}
          placeholder="Paste Call ID (uuid)"
          className="w-full rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-3 outline-none"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!callId || loading}
            className="rounded-xl px-4 py-2 bg-white text-black disabled:opacity-50"
          >
            {loading ? "Scoring…" : "Score now"}
          </button>
          <button
            type="button"
            onClick={() => setCallId("")}
            className="text-sm opacity-70 underline"
          >
            Clear
          </button>
        </div>
      </form>

      {err && <div className="text-sm text-red-400">{err}</div>}

      {resp?.ok && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-green-200 text-sm space-y-2">
          <div>✅ Scoring complete.</div>
          {resp.callId && (
            <Link
              href={`/calls/${resp.callId}?panel=crm`}
              className="inline-block mt-1 underline"
            >
              Open call (CRM panel)
            </Link>
          )}
          <div className="text-xs opacity-70">Tip: check Slack for the summary.</div>
        </div>
      )}
    </div>
  );
}