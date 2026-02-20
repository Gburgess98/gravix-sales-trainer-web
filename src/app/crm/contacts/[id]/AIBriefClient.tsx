"use client";

import { useEffect, useState } from "react";

function errText(e: unknown): string {
  if (!e) return "";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

type Brief = {
  summary?: string;
  who?: string[];
  pain_points?: string[];
  objections?: string[];
  best_angle?: string[];
  next_steps?: string[];
  tone?: string;
  updated_at?: string;
};

function Section({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="text-xs font-semibold tracking-wide text-neutral-400">{title}</div>
      <ul className="mt-2 space-y-2 text-sm text-neutral-200">
        {items.map((x, i) => (
          <li key={i} className="leading-relaxed">
            • {x}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AIBriefClient({ contactId }: { contactId: string }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/proxy/v1/crm/contacts/${encodeURIComponent(contactId)}/ai-brief`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setBrief(json.brief || null);
    } catch (e: any) {
      setErr(e?.message || "Failed to load AI brief");
      setBrief(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-neutral-100">AI Guidance</div>
          <div className="mt-1 text-xs text-neutral-400">
            A quick sales brief based on known CRM data + notes + call history.
          </div>
        </div>

        <button
          type="button"
          onClick={load}
          className="inline-flex h-8 items-center rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-900 active:scale-[0.98]"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="mt-4 animate-pulse space-y-3">
          <div className="h-3 w-48 rounded bg-neutral-800" />
          <div className="h-3 w-full rounded bg-neutral-900" />
          <div className="h-3 w-5/6 rounded bg-neutral-900" />
          <div className="h-3 w-2/3 rounded bg-neutral-900" />
        </div>
      ) : err ? (
        <div className="mt-4 rounded-xl border border-red-900/40 bg-red-950/40 p-4 text-sm text-red-200">
          <div className="font-semibold">AI brief failed to load</div>
          <div className="mt-1 text-xs text-red-200/80">{errText(err)}</div>
          <div className="mt-3 text-xs text-neutral-300">
            Tip: this is non-blocking — the CRM still works even if the AI layer is down.
          </div>
        </div>
      ) : !brief || (!brief.summary && !brief.who?.length && !brief.next_steps?.length) ? (
        <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-sm font-semibold text-neutral-200">No brief yet</div>
          <div className="mt-1 text-xs text-neutral-400">
            Add a few rep notes or link a call — then refresh to generate meaningful guidance.
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {brief.summary ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-xs font-semibold tracking-wide text-neutral-400">SUMMARY</div>
              <div className="mt-2 text-sm leading-relaxed text-neutral-200">{brief.summary}</div>
              {brief.tone ? <div className="mt-3 text-xs text-neutral-400">Tone: {brief.tone}</div> : null}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Section title="WHO THEY ARE" items={brief.who} />
            <Section title="PAIN POINTS" items={brief.pain_points} />
            <Section title="LIKELY OBJECTIONS" items={brief.objections} />
            <Section title="BEST ANGLE" items={brief.best_angle} />
          </div>

          <Section title="NEXT STEPS" items={brief.next_steps} />
        </div>
      )}
    </div>
  );
}