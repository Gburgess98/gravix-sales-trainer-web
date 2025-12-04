'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { getSparringSessionsByRep, type SparringSessionRow } from "@/lib/api";

export default function RepSparringListPage() {
  const params = useParams<{ id: string }>();
  const repId = params.id;
  const qp = useSearchParams();
  const limit = Number(qp.get("limit") || 20);
  const [items, setItems] = useState<SparringSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true); setErr(null);
        const rows = await getSparringSessionsByRep(repId, limit);
        if (mounted) setItems(rows);
      } catch (e: any) {
        if (mounted) setErr(e?.message || "Failed to load sessions");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [repId, limit]);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-white">Sparring Sessions</h1>
        <Link href={`/reps/${repId}`} className="text-sm underline text-white/70">← Back to rep</Link>
      </div>

      {loading && <div className="text-white/70">Loading…</div>}
      {err && <div className="text-amber-300">{err}</div>}
      {!loading && !err && items.length === 0 && (
        <div className="text-white/60">No sessions yet.</div>
      )}

      <ul className="space-y-2">
        {items.map((s) => {
          const persona = s.persona_id || "unknown";
          const scoreVal = typeof s.total_score === "number" ? Math.round(Number(s.total_score)) : null;
          const scoreText = scoreVal != null ? String(scoreVal) : "—";
          return (
            <li key={s.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm text-white/90 capitalize" title={`Persona difficulty: ${persona}`}>
                  Persona: <span className="font-medium">{persona.replace(/_/g, " ")}</span>
                  {typeof s.xp_awarded === "number" && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-emerald-600/15 text-emerald-300 text-xs px-2 py-0.5">
                      +{s.xp_awarded} XP
                    </span>
                  )}
                </div>
                <div className="text-xs text-white/50">{new Date(s.created_at).toLocaleString()}</div>
              </div>
              <div className="text-sm px-2 py-1 rounded-lg border"
                   style={{
                     borderColor: scoreVal == null ? 'rgba(255,255,255,0.15)' : scoreVal >= 80 ? 'rgba(34,197,94,0.4)' : scoreVal >= 60 ? 'rgba(245,158,11,0.4)' : 'rgba(239,68,68,0.4)',
                     backgroundColor: scoreVal == null ? 'rgba(255,255,255,0.05)' : scoreVal >= 80 ? 'rgba(34,197,94,0.10)' : scoreVal >= 60 ? 'rgba(245,158,11,0.10)' : 'rgba(239,68,68,0.10)',
                     color: scoreVal == null ? 'rgba(255,255,255,0.7)' : scoreVal >= 80 ? 'rgb(134 239 172)' : scoreVal >= 60 ? 'rgb(252 211 77)' : 'rgb(252 165 165)'}}
              >
                {scoreText}
              </div>
              <Link href={`/sparring?repId=${repId}&sessionId=${s.id}`} className="text-sm text-white/70 hover:underline">Open</Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}