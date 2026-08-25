"use client";

import { useEffect, useMemo, useState } from "react";
import { useCallback } from "react";
import {
  getAdminConfig,
  patchAdminConfig,
  proxyFetch,
  proxyGet,
  proxyPatch,
  AdminConfig,
} from "@/lib/api";

type OrgSettingsResp = {
  ok?: boolean;
  settings?: { call_visibility?: string | null } | null;
};

// Day 293 correction — canonical manager tiers, matching the API's
// `requireManager` MANAGER_TIERS set exactly. Capability is decided by the
// server-resolved `reps.tier` from the authenticated identity endpoint, never
// by whether an unrelated config query happens to succeed.
const MANAGER_TIERS = new Set(["Manager", "Owner", "PartnerAdmin", "SuperAdmin"]);

type CallVisibility = "everyone" | "managers" | "disabled";

function normaliseVisibility(v: unknown): CallVisibility | null {
  return v === "everyone" || v === "managers" || v === "disabled" ? v : null;
}

type FormState = {
  streak_threshold: string;
  xp_multiplier: string;
  comeback_bonus: string;
};

export default function AdminSettingsPage() {
  // `loading` now tracks CAPABILITY resolution (the authenticated identity read),
  // decoupled from the streak/XP config load which has its own section state.
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Day 293 correction — the streak/XP admin-config load is a separate, section
  // scoped concern. Its failure surfaces a friendly section error but must never
  // affect manager capability or policy authority.
  const [configLoading, setConfigLoading] = useState(false);
  const [configErr, setConfigErr] = useState<string | null>(null);

  const [raw, setRaw] = useState<AdminConfig | null>(null);
  const [form, setForm] = useState<FormState>({
    streak_threshold: "3",
    xp_multiplier: "1",
    comeback_bonus: "0",
  });

  // Day 292 — company-call visibility is server-owned; we only ever reflect a
  // value the API has confirmed. "unknown" means we have not positively read it
  // (never optimistically assume "everyone").
  const [visibility, setVisibility] = useState<CallVisibility | "unknown">("unknown");
  const [visLoading, setVisLoading] = useState(true);
  const [visSaving, setVisSaving] = useState(false);
  const [visErr, setVisErr] = useState<string | null>(null);

  // Day 293 correction — manager capability is resolved from the AUTHENTICATED,
  // server-resolved identity endpoint `/v1/reps/me` (its `reps.tier`), matched
  // against the canonical MANAGER_TIERS. It is NOT inferred from whether the
  // unrelated manager-only admin-config query succeeds (that coupling mistook a
  // config-data failure for an authorization failure and locked real managers out
  // of the policy control). No localStorage, no client-supplied role/org.
  //   true  → tier is a manager tier
  //   false → identity resolved to a non-manager tier (rep) → clean read-only
  //   null  → identity not positively resolved → fail-closed read-only
  const [isManager, setIsManager] = useState<boolean | null>(null);

  const dirty = useMemo(() => {
    if (!raw) return false;
    return (
      Number(form.streak_threshold) !== Number(raw.streak_threshold) ||
      Number(form.xp_multiplier) !== Number(raw.xp_multiplier) ||
      Number(form.comeback_bonus) !== Number(raw.comeback_bonus)
    );
  }, [form, raw]);

  // Resolve manager capability from the authenticated identity (server-resolved
  // reps.tier). This is independent of the streak/XP config load below, so a
  // config-data failure can never misclassify a real manager.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await proxyFetch("/v1/reps/me", { cache: "no-store" });
        const d = await r.json().catch(() => ({} as any));
        const tier = d?.rep?.tier ?? d?.tier ?? null;
        if (!alive) return;
        if (r.ok && d?.ok && typeof tier === "string") {
          setIsManager(MANAGER_TIERS.has(tier));
        } else {
          // Identity not positively resolved → fail-closed to read-only.
          setIsManager(null);
        }
      } catch {
        if (alive) setIsManager(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Load streak/XP config ONLY after manager capability is positive. A failure
  // here is a friendly section error — it does not touch capability or policy
  // authority.
  useEffect(() => {
    if (isManager !== true) return;
    let alive = true;
    (async () => {
      try {
        setConfigLoading(true);
        setConfigErr(null);
        const cfg = await getAdminConfig();
        if (!alive) return;
        setRaw(cfg);
        setForm({
          streak_threshold: String(cfg.streak_threshold),
          xp_multiplier: String(cfg.xp_multiplier),
          comeback_bonus: String(cfg.comeback_bonus),
        });
      } catch {
        // Never surface the raw provider/error string; keep policy authority.
        if (alive) setConfigErr("Couldn’t load scoring settings. Please try again.");
      } finally {
        if (alive) setConfigLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isManager]);

  // Day 292 — read org settings through the canonical authenticated proxy helper
  // (Supabase identity injected by proxyFetch); no raw /api/proxy fetch, no legacy
  // localStorage x-user-id header. The org is resolved server-side, never from the
  // client. On any failure we keep "unknown" rather than lying with "everyone".
  const loadVisibility = useCallback(async () => {
    setVisErr(null);
    setVisLoading(true);
    try {
      const d = await proxyGet<OrgSettingsResp>("/v1/admin/org-settings");
      const v = normaliseVisibility(d?.settings?.call_visibility);
      // Absent row is a genuine "everyone" default from the API; an unparseable
      // value stays "unknown".
      setVisibility(v ?? (d?.settings?.call_visibility == null ? "everyone" : "unknown"));
    } catch (e: any) {
      setVisibility("unknown");
      setVisErr("Couldn’t load company-call visibility.");
    } finally {
      setVisLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVisibility();
  }, [loadVisibility]);

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
      // Day 293 — never surface the raw provider/authorization error.
      setErr("Couldn’t save settings — please try again.");
    } finally {
      setSaving(false);
    }
  }

  // Day 292 — write through the canonical authenticated proxy helper. PATCH stays
  // manager-only at the API. We do NOT optimistically flip the UI: the selection
  // only moves after a validated success, echoing the server-confirmed value. On
  // denial / 5xx / transport failure we keep the previous value, surface a clean
  // error, and reload the truth. A saving guard prevents rapid duplicate writes,
  // and we never send a client org/company override.
  const updateVisibility = useCallback(
    async (val: CallVisibility) => {
      if (visSaving) return;
      if (val === visibility) return;
      setVisErr(null);
      setVisSaving(true);
      const prev = visibility;
      try {
        const d = await proxyPatch<OrgSettingsResp>("/v1/admin/org-settings", {
          call_visibility: val,
        });
        const saved = normaliseVisibility(d?.settings?.call_visibility);
        setVisibility(saved ?? val);
      } catch (e: any) {
        setVisibility(prev);
        setVisErr("Couldn’t update visibility — your change was not saved.");
        void loadVisibility();
      } finally {
        setVisSaving(false);
      }
    },
    [visibility, visSaving, loadVisibility]
  );

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
            ) : isManager === true ? (
              // Manager — confirmed writes (Day 292 contract): no optimistic
              // selection, duplicate writes disabled, server-echoed success.
              <>
                <div className="flex items-center gap-2">
                  {(["everyone", "managers", "disabled"] as CallVisibility[]).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      disabled={visSaving}
                      onClick={() => updateVisibility(opt)}
                      className={`px-3 py-1 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                        visibility === opt
                          ? "bg-black text-white"
                          : "bg-gray-200"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                  {visSaving && (
                    <span className="text-xs text-muted-foreground">Saving…</span>
                  )}
                </div>
                {visibility === "unknown" && !visErr && (
                  <p className="text-xs text-muted-foreground">
                    Current visibility couldn’t be confirmed.
                  </p>
                )}
                {visErr && (
                  <p className="text-xs text-red-600">{visErr}</p>
                )}
              </>
            ) : (
              // Day 293 — rep / unknown: explicit READ-ONLY surface. Show the
              // server-confirmed current value with neutral manager-only copy and
              // no enabled mutation path. Reading stays allowed (rep-readable GET);
              // only writing is manager-only.
              <div className="space-y-1">
                <div className="text-sm">
                  Current setting:{" "}
                  <span className="font-medium">
                    {visibility === "unknown" ? "—" : visibility}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Only a manager can change company call visibility.
                </p>
                {visibility === "unknown" && !visErr && (
                  <p className="text-xs text-muted-foreground">
                    Current visibility couldn’t be confirmed.
                  </p>
                )}
                {visErr && <p className="text-xs text-red-600">{visErr}</p>}
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

          {isManager === true ? (
            configLoading ? (
              <div className="rounded border p-4 text-sm">Loading scoring settings…</div>
            ) : configErr ? (
              // Config-data failure is section-scoped: friendly copy, and the
              // policy control above keeps its authority.
              <div className="rounded border border-red-500/30 bg-red-500/10 p-4 text-sm space-y-1">
                <p>{configErr}</p>
                <p className="text-xs text-muted-foreground">
                  Company call visibility above is unaffected.
                </p>
              </div>
            ) : (
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
            )
          ) : (
            <div className="rounded border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm">
              Streak, XP and comeback settings are managed by your manager. You have
              read-only access to Admin Settings.
            </div>
          )}

          {isManager === true && (
            <div className="text-xs text-muted-foreground">
              Tip: set multiplier to <span className="font-mono">1</span> to instantly disable boosts without redeploying.
            </div>
          )}
        </div>
      )}
    </div>
  );
}