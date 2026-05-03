"use client";

import { useEffect, useMemo, useState } from "react";
import { useCallback } from "react";
import { getAdminConfig, patchAdminConfig, AdminConfig } from "@/lib/api";

type FormState = {
  streak_threshold: string;
  xp_multiplier: string;
  comeback_bonus: string;
};

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [raw, setRaw] = useState<AdminConfig | null>(null);
  const [form, setForm] = useState<FormState>({
    streak_threshold: "3",
    xp_multiplier: "1",
    comeback_bonus: "0",
  });

  const [visibility, setVisibility] = useState<"everyone" | "managers" | "disabled">("everyone");
  const [visLoading, setVisLoading] = useState(true);

  const forbidden =
    (err || "").includes("forbidden_not_manager") ||
    (err || "").includes("missing_x_user_id");

  const dirty = useMemo(() => {
    if (!raw) return false;
    return (
      Number(form.streak_threshold) !== Number(raw.streak_threshold) ||
      Number(form.xp_multiplier) !== Number(raw.xp_multiplier) ||
      Number(form.comeback_bonus) !== Number(raw.comeback_bonus)
    );
  }, [form, raw]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const cfg = await getAdminConfig();
        setRaw(cfg);
        setForm({
          streak_threshold: String(cfg.streak_threshold),
          xp_multiplier: String(cfg.xp_multiplier),
          comeback_bonus: String(cfg.comeback_bonus),
        });
      } catch (e: any) {
        setErr(e?.message || "Failed to load admin config");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setVisLoading(true);
        const res = await fetch("/api/proxy/v1/admin/org-settings", {
          headers: { "x-user-id": localStorage.getItem("uid") || "" },
        });
        const d = await res.json();
        if (d?.settings?.call_visibility) {
          setVisibility(d.settings.call_visibility);
        }
      } catch (e) {
        console.warn("failed to load org settings", e);
      } finally {
        setVisLoading(false);
      }
    })();
  }, []);

  async function onSave() {
    if (!raw) return;
    setOkMsg(null);
    setErr(null);

    // Basic client validation (server also validates)
    const streak = Number(form.streak_threshold);
    const mult = Number(form.xp_multiplier);
    const comeback = Number(form.comeback_bonus);

    if (!Number.isInteger(streak) || streak < 1 || streak > 30) {
      setErr("streak_threshold must be an integer 1–30");
      return;
    }
    if (!Number.isFinite(mult) || mult < 0.1 || mult > 10) {
      setErr("xp_multiplier must be a number 0.1–10");
      return;
    }
    if (!Number.isInteger(comeback) || comeback < 0 || comeback > 5000) {
      setErr("comeback_bonus must be an integer 0–5000");
      return;
    }

    try {
      setSaving(true);
      const updated = await patchAdminConfig({
        streak_threshold: streak,
        xp_multiplier: mult,
        comeback_bonus: comeback,
      });
      setRaw(updated);
      setForm({
        streak_threshold: String(updated.streak_threshold),
        xp_multiplier: String(updated.xp_multiplier),
        comeback_bonus: String(updated.comeback_bonus),
      });
      setOkMsg("Saved ✅ (live immediately)");
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const updateVisibility = useCallback(async (val: typeof visibility) => {
    setVisibility(val);
    try {
      await fetch("/api/proxy/v1/admin/org-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": localStorage.getItem("uid") || "",
        },
        body: JSON.stringify({ call_visibility: val }),
      });
    } catch (e) {
      console.warn("failed to update visibility", e);
    }
  }, []);

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Admin Settings</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Configure streak threshold, XP multiplier, and comeback bonus (applies immediately).
      </p>

      {loading ? (
        <div className="mt-6 text-sm">Loading…</div>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="rounded border p-4 space-y-3">
            <div>
              <h2 className="text-sm font-semibold">Company Call Visibility</h2>
              <p className="text-xs text-muted-foreground">
                Control who can access company-wide calls.
              </p>
            </div>

            {visLoading ? (
              <div className="text-sm">Loading visibility…</div>
            ) : (
              <div className="flex gap-2">
                {["everyone", "managers", "disabled"].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => updateVisibility(opt as any)}
                    className={`px-3 py-1 rounded text-sm ${
                      visibility === opt
                        ? "bg-black text-white"
                        : "bg-gray-200"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
          {err && (
            <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm">
              {err}
            </div>
          )}
          {okMsg && (
            <div className="rounded border border-green-500/30 bg-green-500/10 p-3 text-sm">
              {okMsg}
            </div>
          )}

          {!forbidden ? (
            <div className="rounded border p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium">Streak threshold</label>
                <input
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  value={form.streak_threshold}
                  onChange={(e) => setForm((s) => ({ ...s, streak_threshold: e.target.value }))}
                  inputMode="numeric"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  When the rep hits this streak, multipliers start stepping up.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium">XP multiplier</label>
                <input
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  value={form.xp_multiplier}
                  onChange={(e) => setForm((s) => ({ ...s, xp_multiplier: e.target.value }))}
                  inputMode="decimal"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Global multiplier applied to XP (sparring + call scoring).
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium">Comeback bonus</label>
                <input
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  value={form.comeback_bonus}
                  onChange={(e) => setForm((s) => ({ ...s, comeback_bonus: e.target.value }))}
                  inputMode="numeric"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Bonus XP awarded when they “come back” after a streak break.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  className="rounded bg-black text-white px-4 py-2 text-sm disabled:opacity-50"
                  onClick={onSave}
                  disabled={!dirty || saving}
                >
                  {saving ? "Saving…" : "Save settings"}
                </button>

                {raw?.updated_at && (
                  <span className="text-xs text-muted-foreground">
                    Last updated: {new Date(raw.updated_at).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm">
              You don’t have access to Admin Settings. Ask your manager to upgrade your role.
            </div>
          )}

          {!forbidden && (
            <div className="text-xs text-muted-foreground">
              Tip: set multiplier to <span className="font-mono">1</span> to instantly disable boosts without redeploying.
            </div>
          )}
        </div>
      )}
    </div>
  );
}