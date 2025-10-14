// src/app/admin/score/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

// ---------- Types ----------
type ApiResp = { ok: boolean; callId?: string; jobId?: string; result?: any; error?: string };

// rows returned by /v1/admin/scores
type ScoreRow = {
  id: string;              // score row id (if your API returns it)
  call_id: string;
  user_id?: string | null;
  overall?: number | null; // aka score or score_overall
  ai_model?: string | null;
  rubric_version?: string | null;
  created_at: string;
};

export default function AdminScoresAndForcePage() {
  const [tab, setTab] = useState<"scores" | "force">("scores");

  // ---- Force-score form state (kept from your original page) ----
  const [callId, setCallId] = useState("");
  const [loadingForce, setLoadingForce] = useState(false);
  const [resp, setResp] = useState<ApiResp | null>(null);
  const [errForce, setErrForce] = useState<string | null>(null);

  const isUuid = (s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

  async function forceScore(e: React.FormEvent) {
    e.preventDefault();
    setResp(null);
    setErrForce(null);
    if (!isUuid(callId)) {
      setErrForce("Please enter a valid UUID.");
      return;
    }
    try {
      setLoadingForce(true);
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
      setErrForce(e?.message || "Failed to trigger scoring");
    } finally {
      setLoadingForce(false);
    }
  }

  // ---- Scores table state ----
  const [items, setItems] = useState<ScoreRow[]>([]);
  const [loadingScores, setLoadingScores] = useState(false);
  const [errScores, setErrScores] = useState<string | null>(null);

  const modelOpts = useMemo(
    () => Array.from(new Set(items.map(r => r.ai_model).filter(Boolean))) as string[],
    [items]
  );
  const rubricOpts = useMemo(
    () => Array.from(new Set(items.map(r => r.rubric_version).filter(Boolean))) as string[],
    [items]
  );

  const [model, setModel] = useState<string>("");
  const [rubric, setRubric] = useState<string>("");
  const [limit, setLimit] = useState<number>(50);

  const hasFilters = useMemo(() => Boolean(model || rubric), [model, rubric]);

  async function loadScores() {
    try {
      setLoadingScores(true);
      setErrScores(null);
      const qs = new URLSearchParams();
      qs.set("limit", String(limit));
      if (model) qs.set("model", model);
      if (rubric) qs.set("rubric", rubric);
      const r = await fetch(`/api/proxy/v1/admin/scores?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      const rows: ScoreRow[] = (j.items || []).map((x: any) => ({
        id: x.id ?? `${x.call_id}-${x.created_at}`,
        call_id: x.call_id,
        user_id: x.user_id ?? null,
        overall: typeof x.overall === "number" ? x.overall : x.score ?? null,
        ai_model: x.ai_model ?? x.model ?? null,
        rubric_version: x.rubric_version ?? null,
        created_at: x.created_at,
      }));
      setItems(rows);
    } catch (e: any) {
      setErrScores(e?.message || "Failed to load scores");
      setItems([]);
    } finally {
      setLoadingScores(false);
    }
  }

  useEffect(() => {
    if (tab === "scores") loadScores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header + tabs */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Admin · Scores</h1>
        <Link className="underline text-sm ml-auto" href="/recent-calls">Recent calls</Link>
      </div>

      <div className="flex gap-2 border-b border-white/10">
        <button
          onClick={() => setTab("scores")}
          className={`px-3 py-2 text-sm ${tab === "scores" ? "border-b-2 border-white" : "opacity-70"}`}
        >Scores</button>
        <button
          onClick={() => setTab("force")}
          className={`px-3 py-2 text-sm ${tab === "force" ? "border-b-2 border-white" : "opacity-70"}`}
        >Force Score</button>
      </div>

      {tab === "scores" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col">
              <label className="text-xs opacity-70">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-56 rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none"
              >
                <option value="">All</option>
                {modelOpts.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs opacity-70">Rubric version</label>
              <select
                value={rubric}
                onChange={(e) => setRubric(e.target.value)}
                className="w-40 rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none"
              >
                <option value="">All</option>
                {rubricOpts.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs opacity-70">Limit</label>
              <input
                type="number"
                min={1}
                max={200}
                value={limit}
                onChange={(e) => setLimit(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                className="w-28 rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none"
              />
            </div>
            <button onClick={loadScores} className="rounded-xl px-4 py-2 border">Apply</button>
            {hasFilters && (
              <button
                onClick={() => { setModel(""); setRubric(""); setLimit(50); loadScores(); }}
                className="text-sm underline opacity-80"
              >Clear</button>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr>
                  <th className="text-left p-3">When</th>
                  <th className="text-left p-3">Call</th>
                  <th className="text-left p-3">Score</th>
                  <th className="text-left p-3">Model</th>
                  <th className="text-left p-3">Rubric</th>
                  <th className="text-left p-3">Open</th>
                </tr>
              </thead>
              <tbody>
                {loadingScores && (
                  <tr><td colSpan={6} className="p-4 opacity-70">Loading…</td></tr>
                )}
                {errScores && !loadingScores && (
                  <tr><td colSpan={6} className="p-4 text-red-400">{errScores}</td></tr>
                )}
                {!loadingScores && !errScores && items.length === 0 && (
                  <tr><td colSpan={6} className="p-4 opacity-70">No scores yet.</td></tr>
                )}
                {items.map((r) => (
                  <tr key={r.id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="p-3 opacity-80">{new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Europe/London" })}</td>
                    <td className="p-3 font-mono text-xs break-all">{r.call_id}</td>
                    <td className="p-3">{typeof r.overall === "number" ? Math.round(r.overall) : "—"}</td>
                    <td className="p-3">{r.ai_model || "—"}</td>
                    <td className="p-3">{r.rubric_version || "—"}</td>
                    <td className="p-3">
                      <Link href={`/calls/${r.call_id}`} className="underline">Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "force" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">Force Score a Call</h2>
            <div className="text-xs opacity-70">Paste a Call ID (UUID) to trigger scoring now.</div>
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
                disabled={!callId || loadingForce}
                className="rounded-xl px-4 py-2 bg-white text-black disabled:opacity-50"
              >
                {loadingForce ? "Scoring…" : "Score now"}
              </button>
              <button type="button" onClick={() => setCallId("")} className="text-sm opacity-70 underline">Clear</button>
            </div>
          </form>

          {errForce && <div className="text-sm text-red-400">{errForce}</div>}

          {resp?.ok && (
            <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-green-200 text-sm space-y-2">
              <div>✅ Scoring complete.</div>
              {resp.callId && (
                <Link href={`/calls/${resp.callId}?panel=crm`} className="inline-block mt-1 underline">
                  Open call (CRM panel)
                </Link>
              )}
              <div className="text-xs opacity-70">Tip: check Slack for the summary.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}