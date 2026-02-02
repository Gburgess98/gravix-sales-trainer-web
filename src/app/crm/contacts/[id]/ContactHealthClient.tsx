"use client";

import { useCallback, useEffect, useState } from "react";

type Health = {
  contact_id: string;
  status: "hot" | "warm" | "cold";
  score: number;
  reasons: string[];
  next_action?: string | null;
  signals?: Record<string, any>;
};

export default function ContactHealthClient({ contactId }: { contactId: string }) {
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/proxy/v1/crm/contacts/${contactId}/health`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json?.ok) {
        setHealth(null);
        setError(json?.error ?? "failed_to_load");
        return;
      }

      setHealth(json.health ?? null);
    } catch (e: any) {
      setHealth(null);
      setError(e?.message ?? "failed_to_load");
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    load();
  }, [load]);

  const badge = (status?: string) => {
    const s = (status ?? "cold").toLowerCase();
    const base =
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide";
    if (s === "hot") return `${base} border-emerald-500/30 bg-emerald-500/10 text-emerald-200`;
    if (s === "warm") return `${base} border-amber-500/30 bg-amber-500/10 text-amber-200`;
    return `${base} border-slate-500/30 bg-slate-500/10 text-slate-200`;
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Contact Health</div>
          <div className="text-xs text-white/50">Auto-scored from notes, assignments, calls.</div>
        </div>

        <button
          onClick={load}
          className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/80 hover:bg-white/[0.06]"
        >
          Refresh
        </button>
      </div>

      <div className="mt-3">
        {loading ? (
          <div className="text-sm text-white/60">Loading…</div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
            Health failed to load — {error}
          </div>
        ) : !health ? (
          <div className="text-sm text-white/60">No health data.</div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className={badge(health.status)}>{health.status.toUpperCase()}</span>
              <span className="text-sm text-white/80">
                Score: <span className="font-semibold">{health.score}</span>
              </span>
            </div>

            {health.reasons?.length ? (
              <div className="text-xs text-white/70">
                <div className="mb-1 text-white/50">Reasons</div>
                <ul className="list-disc space-y-1 pl-5">
                  {health.reasons.slice(0, 5).map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {health.next_action ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-white/80">
                <div className="mb-1 text-white/50">Next action</div>
                {health.next_action}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}