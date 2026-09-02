"use client";

import { useEffect, useMemo, useState } from "react";
import { getAdminConfig, patchAdminConfig, type AdminConfig } from "@/lib/Admin/adminConfig";

export default function AdminSettingsPage() {
  const [cfg, setCfg] = useState<AdminConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [streakThreshold, setStreakThreshold] = useState<number>(3);
  const [xpMultiplier, setXpMultiplier] = useState<number>(1.0);
  const [comebackBonus, setComebackBonus] = useState<number>(50);

  const dirty = useMemo(() => {
    if (!cfg) return false;
    return (
      streakThreshold !== cfg.streak_threshold ||
      xpMultiplier !== Number(cfg.xp_multiplier) ||
      comebackBonus !== cfg.comeback_bonus
    );
  }, [cfg, streakThreshold, xpMultiplier, comebackBonus]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const c = await getAdminConfig();
        setCfg(c);
        setStreakThreshold(c.streak_threshold);
        setXpMultiplier(Number(c.xp_multiplier));
        setComebackBonus(c.comeback_bonus);
        setErr(null);
      } catch (e: any) {
        setErr(e.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onSave() {
    if (!cfg) return;
    setSaving(true);
    setOkMsg(null);
    setErr(null);
    try {
      const updated = await patchAdminConfig({
        streak_threshold: streakThreshold,
        xp_multiplier: xpMultiplier,
        comeback_bonus: comebackBonus,
      });
      setCfg(updated);
      setOkMsg("Saved.");
    } catch (e: any) {
      setErr(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Admin Settings</h1>
        <p className="text-sm opacity-70 mt-1">
          Tune gamification without shipping code. These settings affect scoring and XP.
        </p>
      </div>

      {loading && <div className="text-sm opacity-70">Loading…</div>}
      {err && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
          {err}
        </div>
      )}
      {okMsg && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
          {okMsg}
        </div>
      )}

      {!loading && cfg && (
        <div className="space-y-4 rounded-2xl border p-5">
          <SettingRow
            label="Streak threshold"
            help="How many consecutive wins before streak bonus logic can apply."
          >
            <input
              type="number"
              min={1}
              max={30}
              value={streakThreshold}
              onChange={(e) => setStreakThreshold(parseInt(e.target.value || "0", 10))}
              className="w-40 rounded-lg border bg-transparent px-3 py-2"
            />
          </SettingRow>

          <SettingRow
            label="XP multiplier"
            help="Multiplies XP awarded from scoring (not the raw call score)."
          >
            <input
              type="number"
              step="0.1"
              min={0.1}
              max={10}
              value={xpMultiplier}
              onChange={(e) => setXpMultiplier(parseFloat(e.target.value || "0"))}
              className="w-40 rounded-lg border bg-transparent px-3 py-2"
            />
          </SettingRow>

          <SettingRow
            label="Comeback bonus"
            help="Bonus XP when a rep bounces back after a dip (hooked in /score)."
          >
            <input
              type="number"
              min={0}
              max={5000}
              value={comebackBonus}
              onChange={(e) => setComebackBonus(parseInt(e.target.value || "0", 10))}
              className="w-40 rounded-lg border bg-transparent px-3 py-2"
            />
          </SettingRow>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={onSave}
              disabled={!dirty || saving}
              className="rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>

            <div className="text-xs opacity-60">
              Last updated: {new Date(cfg.updated_at).toLocaleString("en-GB")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingRow({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-sm opacity-70">{help}</div>
      </div>
      <div className="pt-1">{children}</div>
    </div>
  );
}