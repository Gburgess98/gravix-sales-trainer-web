"use client";

import { useEffect, useMemo, useState } from "react";

type HealthStatus = "hot" | "warm" | "cold";

type ContactHealth = {
  contact_id: string;
  status: HealthStatus;
  score: number;
  reasons: string[];
  next_action: string | null;
  signals: {
    last_contacted_at: string | null;
    last_contacted_days: number | null;
    overdue_assignments: number;
    critical_notes: number;
    important_notes: number;
    last_call_score: number | null;
  };
};

function statusStyles(status: HealthStatus) {
  // Tailwind-only, “premium” feel: subtle borders + soft background.
  if (status === "hot") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (status === "warm") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-slate-200 bg-slate-50 text-slate-900";
}

function statusLabel(status: HealthStatus) {
  if (status === "hot") return "Hot";
  if (status === "warm") return "Warm";
  return "Cold";
}

export default function ContactHealthClient({ contactId }: { contactId: string }) {
  const [health, setHealth] = useState<ContactHealth | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSignals, setShowSignals] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/proxy/v1/crm/contacts/${encodeURIComponent(contactId)}/health`, {
          method: "GET",
          headers: { "content-type": "application/json" },
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP_${res.status}`);
        if (!cancelled) setHealth(json.health as ContactHealth);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "failed_to_load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  const pill = useMemo(() => {
    if (!health) return null;
    const cls = statusStyles(health.status);
    return (
      <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${cls}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
        {statusLabel(health.status)}
        <span className="opacity-60">·</span>
        <span>{health.score}/100</span>
      </span>
    );
  }, [health]);

  if (loading && !health) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-3 w-72 animate-pulse rounded bg-slate-100" />
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
        <div className="text-sm font-semibold">Health unavailable</div>
        <div className="mt-1 text-xs opacity-80">{err}</div>
      </div>
    );
  }

  if (!health) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {pill}
          <div className="text-sm font-semibold text-slate-900">Contact Health</div>
        </div>

        <button
          type="button"
          onClick={() => setShowSignals((v) => !v)}
          className="text-xs font-medium text-slate-700 hover:text-slate-900"
        >
          {showSignals ? "Hide details" : "Show details"}
        </button>
      </div>

      <div className="mt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why</div>
        <ul className="mt-2 space-y-1 text-sm text-slate-800">
          {(health.reasons || []).slice(0, 4).map((r, idx) => (
            <li key={`${r}-${idx}`} className="flex items-start gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
              <span>{r}</span>
            </li>
          ))}
        </ul>

        {health.next_action ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next action</div>
            <div className="mt-1 text-sm text-slate-900">{health.next_action}</div>
          </div>
        ) : null}

        {showSignals ? (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-2">
              <div className="opacity-70">Overdue</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{health.signals.overdue_assignments}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-2">
              <div className="opacity-70">Critical notes</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{health.signals.critical_notes}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-2">
              <div className="opacity-70">Important notes</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{health.signals.important_notes}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-2">
              <div className="opacity-70">Last call score</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {health.signals.last_call_score == null ? "—" : health.signals.last_call_score}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-2">
              <div className="opacity-70">Last contacted</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {health.signals.last_contacted_days == null ? "Never" : `${health.signals.last_contacted_days}d`}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}