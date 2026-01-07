"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { listAdminReps, patchAdminRepTier, AdminRepRow, getAdminConfig } from "@/lib/api";

const ROLE_OPTIONS = [
  { value: "SalesRep", label: "Sales Rep" },
  { value: "TeamLead", label: "Team Leader" },
  { value: "Manager", label: "Manager" },
  { value: "Owner", label: "Owner" },
] as const;

export default function AdminRepsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reps, setReps] = useState<AdminRepRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // quick guard: if this fails, user isn't manager
        await getAdminConfig();

        const res = await listAdminReps();
        if (!alive) return;

        setReps(res.reps || []);
        setForbidden(false);
      } catch (e: any) {
        if (!alive) return;

        const msg = String(e?.message || "");
        if (msg.includes("forbidden_not_manager") || msg.includes("missing_x_user_id")) {
          router.replace("/");
          return;
        } else {
          setError(msg || "failed_to_load_reps");
        }
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => reps, [reps]);

  async function onChangeTier(repId: string, nextTier: "SalesRep" | "TeamLead" | "Manager" | "Owner") {
    setSavingId(repId);
    setSavedMsg(null);
    setError(null);

    // optimistic update
    const prev = reps;
    setReps((cur) => cur.map((r) => (r.id === repId ? { ...r, tier: nextTier } : r)));

    try {
      await patchAdminRepTier(repId, nextTier);
      setSavedMsg("Saved ✅");
      setTimeout(() => setSavedMsg(null), 1500);
    } catch (e: any) {
      // revert
      setReps(prev);
      setError(String(e?.message || "save_failed"));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="p-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold">Admin • Reps</h1>
          <p className="text-sm text-white/60">
            Manage roles for your team. Keep it tight.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/settings" className="text-sm underline text-neutral-300 hover:text-white">
            Admin Settings
          </Link>
          <Link href="/crm/overview" className="text-sm underline text-neutral-300 hover:text-white">
            Back to dashboard
          </Link>
        </div>
      </div>

      {loading && (
        <div className="text-sm text-white/60">Loading…</div>
      )}

      {!loading && forbidden && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <div className="font-medium">Forbidden</div>
          <div className="text-sm text-white/70 mt-1">
            You don’t have manager access.
          </div>
        </div>
      )}

      {!loading && !forbidden && error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <div className="font-medium">Error</div>
          <div className="text-sm text-white/70 mt-1">{error}</div>
        </div>
      )}

      {!loading && !forbidden && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
            <div className="text-sm text-white/70">{rows.length} reps</div>
            {savedMsg && <div className="text-sm text-emerald-300">{savedMsg}</div>}
          </div>

          <div className="divide-y divide-neutral-800">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-neutral-50 truncate">
                    {r.name || "Unnamed rep"}
                  </div>
                  <div className="text-xs text-neutral-500 truncate">{r.id}</div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-xs text-neutral-400">
                    XP: {typeof r.xp === "number" ? r.xp : 0}
                  </div>

                  <select
                    className="rounded-md bg-neutral-950 border border-neutral-700 px-2 py-1 text-sm"
                    value={(r.tier as any) || "SalesRep"}
                    disabled={savingId === r.id}
                    onChange={(e) => onChangeTier(r.id, e.target.value as any)}
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  {savingId === r.id && (
                    <div className="text-xs text-white/60">Saving…</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}