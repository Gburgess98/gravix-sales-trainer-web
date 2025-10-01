"use client";
import { useState } from "react";
import { setScore } from "@/lib/api";

export default function ScoreBox({ callId, initialScore }: { callId: string; initialScore?: number }) {
  const [score, set] = useState<number>(initialScore ?? 80);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    try {
      setSaving(true);
      setMsg(null);
      await setScore(callId, score);
      setMsg("Saved ✓");
    } catch (e: any) {
      setMsg(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Score</h2>
        {msg && <div className="text-sm opacity-70">{msg}</div>}
      </div>
      <div className="flex items-center gap-3">
        <input
          type="number"
          min={0}
          max={100}
          value={score}
          onChange={e => set(Number(e.target.value))}
          className="border rounded px-2 py-1 text-sm w-20 bg-transparent"
        />
        <button onClick={save} disabled={saving} className="border rounded px-3 py-1 text-sm">
          {saving ? "Saving…" : "Save Score"}
        </button>
      </div>
    </div>
  );
}