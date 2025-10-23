"use client";

import { useState } from "react";

type Health = { ok?: boolean; service?: string; uptime_s?: number; ts?: string };

export default function HealthPage() {
  const [result, setResult] = useState<string>("");

  async function ping() {
    setResult("Pinging…");
    try {
      // Add a cache-buster to ensure we don't see stale responses and disable cache
      const r = await fetch(`/api/proxy/v1/health?t=${Date.now()}` , { cache: "no-store" });
      const text = await r.text();
      let body: Health | null = null;
      try { body = JSON.parse(text); } catch {}

      if (!r.ok) {
        setResult(`HTTP ${r.status} • ${text.slice(0, 200)}`);
        return;
      }

      if (body && typeof body === "object") {
        const ok = String(body.ok ?? false);
        const svc = body.service ?? "(n/a)";
        const up = body.uptime_s ?? "(n/a)";
        const stamp = body.ts ?? "(n/a)";
        setResult(`ok=${ok} • service=${svc} • uptime=${up}s • ts=${stamp}`);
      } else {
        // If the body wasn't JSON, show the raw text so we can diagnose quickly
        setResult(`Unexpected response: ${text.slice(0, 200)}`);
      }
    } catch (e: any) {
      setResult(`Network error: ${e?.message || e}`);
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-xl font-semibold mb-4">Web Health</h1>
      <p className="text-sm opacity-80 mb-4">Pings the API via the web proxy.</p>
      <button onClick={ping} className="px-3 py-1.5 rounded border">Ping API</button>
      {result && (
        <div className="mt-4 rounded-xl border p-3 text-sm whitespace-pre-wrap">
          API status: {result}
        </div>
      )}
    </div>
  );
}