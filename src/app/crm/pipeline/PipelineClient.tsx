"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PipelineOpportunity = {
  id: string;
  name: string | null;
  stage: string | null;
  value?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
  account_id?: string | null;
  contact_id?: string | null;
};

type PipelineResp = {
  ok: boolean;
  stages?: string[];
  by_stage?: Record<string, PipelineOpportunity[]>;
  opportunities?: PipelineOpportunity[];
  error?: string;
};

function normaliseStage(s: string | null | undefined) {
  const v = String(s ?? "").trim();
  return v || "Uncategorised";
}

function fmtMoney(n: unknown) {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return null;
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(num);
  } catch {
    return `£${Math.round(num)}`;
  }
}

export default function CrmPipelinePage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [stages, setStages] = useState<string[]>([]);
  const [byStage, setByStage] = useState<Record<string, PipelineOpportunity[]>>({});

  const refreshingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;

    setErr(null);
    setLoading(true);

    try {
      const r = await fetch(`/api/proxy/v1/crm/opportunities/pipeline`, {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
      });

      const json = (await r.json()) as PipelineResp;

      if (!r.ok || !json?.ok) {
        setErr(json?.error || `pipeline_fetch_failed (${r.status})`);
        setStages([]);
        setByStage({});
        return;
      }

      const nextStages = (json.stages ?? []).map((s) => normaliseStage(s));
      const nextByStage: Record<string, PipelineOpportunity[]> = {};

      // Prefer by_stage if returned
      if (json.by_stage && typeof json.by_stage === "object") {
        for (const [k, v] of Object.entries(json.by_stage)) {
          nextByStage[normaliseStage(k)] = (v ?? []).map((o) => ({
            ...o,
            stage: normaliseStage((o as any)?.stage ?? k),
          }));
        }
      } else if (Array.isArray(json.opportunities)) {
        for (const o of json.opportunities) {
          const s = normaliseStage(o.stage);
          nextByStage[s] = nextByStage[s] ?? [];
          nextByStage[s].push({ ...o, stage: s });
        }
      }

      // Ensure every stage has an array
      for (const s of nextStages) nextByStage[s] = nextByStage[s] ?? [];

      // Also ensure any “extra” stages from data exist in list (so cards never vanish)
      const dataStages = Object.keys(nextByStage);
      const mergedStages = Array.from(new Set([...nextStages, ...dataStages]));

      setStages(mergedStages);
      setByStage(nextByStage);
    } catch (e: any) {
      setErr(e?.message ?? "pipeline_fetch_failed");
      setStages([]);
      setByStage({});
    } finally {
      setLoading(false);
      refreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // --- Drag & Drop (simple HTML5) ---
  const onDragStart = useCallback((ev: React.DragEvent, oppId: string, fromStage: string) => {
    ev.dataTransfer.setData("text/plain", JSON.stringify({ oppId, fromStage }));
    ev.dataTransfer.effectAllowed = "move";
  }, []);

  const moveOptimistic = useCallback((oppId: string, fromStage: string, toStage: string) => {
    setByStage((prev) => {
      const next: Record<string, PipelineOpportunity[]> = { ...prev };
      const from = [...(next[fromStage] ?? [])];
      const to = [...(next[toStage] ?? [])];

      const idx = from.findIndex((x) => String(x.id) === String(oppId));
      if (idx === -1) return prev;

      const [item] = from.splice(idx, 1);
      to.unshift({ ...item, stage: toStage });

      next[fromStage] = from;
      next[toStage] = to;
      return next;
    });
  }, []);

  const patchStage = useCallback(async (oppId: string, toStage: string) => {
    const r = await fetch(`/api/proxy/v1/crm/opportunities/${encodeURIComponent(oppId)}/stage`, {
      method: "PATCH",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ stage: toStage }),
    });

    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) throw new Error(j?.error || `stage_patch_failed (${r.status})`);
  }, []);

  const onDropColumn = useCallback(
    async (ev: React.DragEvent, toStage: string) => {
      ev.preventDefault();
      ev.stopPropagation();

      let payload: any = null;
      try {
        payload = JSON.parse(ev.dataTransfer.getData("text/plain") || "{}");
      } catch {
        payload = null;
      }

      const oppId = String(payload?.oppId ?? "").trim();
      const fromStage = normaliseStage(payload?.fromStage);

      if (!oppId || !fromStage) return;
      if (fromStage === toStage) return;

      // optimistic
      moveOptimistic(oppId, fromStage, toStage);

      // persist
      try {
        await patchStage(oppId, toStage);
      } catch (e) {
        // revert by re-fetching (simplest + safest)
        await refresh();
      }
    },
    [moveOptimistic, patchStage, refresh]
  );

  const totalsByStage = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of stages) {
      const arr = byStage[s] ?? [];
      out[s] = arr.reduce((sum, o) => {
        const v = (o as any)?.value;
        const n = typeof v === "number" ? v : Number(v);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0);
    }
    return out;
  }, [byStage, stages]);

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pipeline</h1>
          <p className="text-sm text-gray-500">Drag deals between stages. Changes save automatically.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            disabled={loading}
            type="button"
          >
            Refresh
          </button>
        </div>
      </div>

      {err ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6 text-sm text-gray-500">Loading pipeline…</div>
      ) : (
        <div className="mt-6 grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(stages.length, 1)}, minmax(260px, 1fr))` }}>
          {stages.map((stage) => {
            const items = byStage[stage] ?? [];
            const total = totalsByStage[stage] ?? 0;
            const totalFmt = total ? fmtMoney(total) : null;

            return (
              <div
                key={stage}
                className="rounded-lg border bg-white"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => onDropColumn(e, stage)}
              >
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <div className="flex flex-col">
                    <div className="text-sm font-medium">{stage}</div>
                    <div className="text-xs text-gray-500">
                      {items.length} {items.length === 1 ? "deal" : "deals"}
                      {totalFmt ? <span className="ml-2">• {totalFmt}</span> : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 p-3">
                  {items.length === 0 ? (
                    <div className="rounded-md border border-dashed p-3 text-xs text-gray-400">
                      Drop here
                    </div>
                  ) : null}

                  {items.map((o) => {
                    const name = String(o.name ?? "Untitled deal");
                    const valFmt = fmtMoney((o as any)?.value);

                    return (
                      <div
                        key={o.id}
                        className="cursor-move rounded-md border p-3 hover:bg-gray-50"
                        draggable
                        onDragStart={(e) => onDragStart(e, String(o.id), stage)}
                        title="Drag to move stage"
                      >
                        <div className="text-sm font-medium">{name}</div>
                        <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                          <span className="truncate">{String(o.id).slice(0, 8)}…</span>
                          {valFmt ? <span className="ml-2">{valFmt}</span> : <span className="ml-2 text-gray-300">£—</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}