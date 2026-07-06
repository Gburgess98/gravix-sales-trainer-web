"use client";

import { useEffect, useMemo, useState } from "react";
import RunHistoryTable from "@/components/RunHistoryTable";

// DAY 57
// Read-only auto-assign surfaces are now live (latest run + run history).
// Execute / preview controls stay disabled until the remaining write flow is finished.
const AUTO_ASSIGN_READ_UI_ENABLED = true;
const AUTO_ASSIGN_WRITE_UI_ENABLED = false;

// ------------------------------
// API helpers (status-aware)
// ------------------------------

type ApiErrorKind = "auth" | "permission" | "validation" | "server" | "network" | "unknown";

type ApiErr = {
  ok: false;
  status: number;
  kind: ApiErrorKind;
  title: string;
  hint: string;
  error: string;
};

type ApiOk<T> = { ok: true; status: number; data: T };

type ApiResult<T> = ApiOk<T> | ApiErr;

function classifyApiError(status: number): { kind: ApiErrorKind; title: string; hint: string } {
  if (status === 401) return { kind: "auth", title: "Auth required", hint: "Missing/expired auth or headers. Refresh and try again." };
  if (status === 403) return { kind: "permission", title: "Permission blocked", hint: "You don’t have access to this org/rep scope." };
  if (status === 422) return { kind: "validation", title: "Invalid request", hint: "The request body was rejected. Check mode/caps." };
  if (status >= 500) return { kind: "server", title: "Server error", hint: "API failed. Check server logs and retry." };
  return { kind: "unknown", title: "Request failed", hint: "Unexpected failure. Check logs." };
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function apiGet<T = any>(path: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, { method: "GET" });
    const data = (await safeJson(res)) as any;

    if (!res.ok) {
      const cls = classifyApiError(res.status);
      const apiMsg = data?.error ? String(data.error) : null;
      return { ok: false, status: res.status, kind: cls.kind, title: cls.title, hint: cls.hint, error: apiMsg || `HTTP ${res.status}` };
    }

    return { ok: true, status: res.status, data: data as T };
  } catch (e: any) {
    return {
      ok: false,
      status: 0,
      kind: "network",
      title: "Network error",
      hint: "Couldn’t reach the API. Check proxy/API is running.",
      error: String(e?.message ?? "network_error"),
    };
  }
}

async function apiPost<T = any>(path: string, body: any): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });

    const data = (await safeJson(res)) as any;

    if (!res.ok) {
      const cls = classifyApiError(res.status);
      const apiMsg = data?.error ? String(data.error) : null;
      return { ok: false, status: res.status, kind: cls.kind, title: cls.title, hint: cls.hint, error: apiMsg || `HTTP ${res.status}` };
    }

    return { ok: true, status: res.status, data: data as T };
  } catch (e: any) {
    return {
      ok: false,
      status: 0,
      kind: "network",
      title: "Network error",
      hint: "Couldn’t reach the API. Check proxy/API is running.",
      error: String(e?.message ?? "network_error"),
    };
  }
}

type OverviewRow = {
  rep_id: string;
  rep_name: string;
  counts: { open: number; overdue: number; completed_today: number };
  meta?: any;
};

type LastRun = {
  run_id: string;
  mode: string;
  source?: "cron" | "manual";
  started_at?: string;
  finished_at?: string;
  executed_from_preview_run_id?: string | null;
  executed_by_user_id?: string | null;
  executed_at?: string | null;
  totals?: {
    reps_considered?: number;
    contacts_considered?: number;
    actions_created?: number;
    skipped_dedupe?: number;
    errors?: number;
  };
};

type TeamSettings = {
  org_id: string;
  streak_threshold: number;
  xp_multiplier: number;
  comeback_bonus: number;
  xp_cap_daily: number;
  voice_score_threshold: number;
  weak_close_threshold: number;
  filler_density_threshold: number;
  coaching_trigger_thresholds?: {
    voice_score_lt?: number;
    weak_close?: boolean;
    inactive_days_gt?: number;
    [k: string]: any;
  };
  updated_at?: string | null;
  updated_by?: string | null;
};

type TeamSettingsResp = {
  ok: boolean;
  exists?: boolean;
  settings?: TeamSettings;
  error?: string;
};

type BatchAssignResp = {
  ok: boolean;
  matched_count?: number;
  assigned_count?: number;
  failed_count?: number;
  assigned?: Array<{ user_id: string; id: string | null; table: string }>;
  failed?: Array<{ user_id: string; error: string }>;
  error?: string;
};

const SLACK_ALERT_ACTIONS_CREATED_THRESHOLD = 25;

const RUN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidRunId(id: any) {
  const s = String(id ?? "").trim();
  return RUN_ID_RE.test(s);
}

function shouldSlackAlert(totals?: LastRun["totals"]) {
  const errors = Number(totals?.errors ?? 0);
  const created = Number(totals?.actions_created ?? 0);
  return errors > 0 || created >= SLACK_ALERT_ACTIONS_CREATED_THRESHOLD;
}

function buildSlackPreview(run: LastRun) {
  const t = run.totals ?? {};
  const icon = Number(t.errors ?? 0) > 0 ? "⚠️" : "👀";
  const title = `${icon} CRM auto-assign run ${(run.mode || "").toUpperCase()} — ${run.run_id}`;
  const lines = [
    title,
    `reps_considered: ${Number(t.reps_considered ?? 0)}`,
    `contacts_considered: ${Number(t.contacts_considered ?? 0)}`,
    `actions_created: ${Number(t.actions_created ?? 0)}`,
    `skipped_dedupe: ${Number(t.skipped_dedupe ?? 0)}`,
    `errors: ${Number(t.errors ?? 0)}`,
  ];
  return lines.join("\n");
}

export default function ManagerClient({ initial }: { initial: any }) {
  const [rows, setRows] = useState<OverviewRow[]>(initial?.items ?? []);
  const [mode] = useState<string>(initial?.mode ?? "unknown");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [apiError, setApiError] = useState<ApiErr | null>(null);
  const [confirmExecute, setConfirmExecute] = useState(false);
  const [confirmExecutePreviewId, setConfirmExecutePreviewId] = useState<string | null>(null);
  const [contactsPerRep, setContactsPerRep] = useState<number>(5);
  const [maxTotalContacts, setMaxTotalContacts] = useState<number>(8);
  const [preview, setPreview] = useState<any | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [settings, setSettings] = useState<TeamSettings | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMsg, setBatchMsg] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<BatchAssignResp | null>(null);
  const [batchDrillId, setBatchDrillId] = useState("closing_drill");
  const [batchMode, setBatchMode] = useState<"low_voice" | "weak_close" | "inactive">("low_voice");

  // Derived preview helpers
  const previewRunId = useMemo(() => {
    const id = String((preview as any)?.run_id ?? "").trim();
    if (!id.length) return null;
    return isValidRunId(id) ? id : null;
  }, [preview]);

  const previewTotals = useMemo(() => {
    const t = (preview as any)?.totals ?? {};
    return {
      reps: Number(t.reps_considered ?? 0),
      contacts: Number(t.contacts_considered ?? 0),
      wouldCreate: Number(t.actions_created ?? 0),
      skipped: Number(t.skipped_dedupe ?? 0),
      errors: Number(t.errors ?? 0),
    };
  }, [preview]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!AUTO_ASSIGN_READ_UI_ENABLED) return;
      const r = await apiGet<any>("/api/proxy/v1/crm/manager/auto-assign/runs/latest");
      if (cancelled) return;

      if (!r.ok) {
        // Latest run is optional. If server can't return it (e.g. invalid_run_id), don't block the page UI.
        if (r.status === 400 && String(r.error ?? "") === "invalid_run_id") {
          return;
        }
        setApiError(r);
        return;
      }

      const item = (r.data as any)?.item;
      if (isValidRunId(item?.run_id)) {
        setLastRun({
          run_id: String(item.run_id),
          mode: String(item.mode ?? ""),
          source: (item.source === "cron" ? "cron" : "manual") as any,
          started_at: item.started_at ?? undefined,
          finished_at: item.finished_at ?? undefined,
          executed_from_preview_run_id: item.executed_from_preview_run_id ?? null,
          executed_by_user_id: item.executed_by_user_id ?? null,
          executed_at: item.executed_at ?? null,
          totals: item.totals ?? undefined,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setSettingsBusy(true);
      setSettingsMsg(null);

      const r = await apiGet<TeamSettingsResp>("/api/proxy/v1/crm/manager/settings");
      if (cancelled) return;

      if (!r.ok) {
        setApiError(r);
        setSettingsBusy(false);
        return;
      }

      const j = r.data as TeamSettingsResp;
      if (!j?.ok || !j?.settings) {
        setSettingsMsg(String(j?.error ?? "Failed to load manager settings"));
        setSettingsBusy(false);
        return;
      }

      setSettings(j.settings);
      setSettingsBusy(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => {
    let open = 0, overdue = 0, done = 0;
    for (const r of rows) {
      open += Number(r?.counts?.open ?? 0);
      overdue += Number(r?.counts?.overdue ?? 0);
      done += Number(r?.counts?.completed_today ?? 0);
    }
    return { open, overdue, done };
  }, [rows]);

  async function refresh() {
    const r = await apiGet<any>("/api/proxy/v1/crm/manager/overview");
    if (!r.ok) {
      setApiError(r);
      throw new Error(r.error);
    }
    const j = r.data as any;
    if (!j?.ok) {
      setApiError({ ok: false, status: r.status, kind: "unknown", title: "Request failed", hint: "Unexpected response shape.", error: String(j?.error ?? "Failed to refresh") });
      throw new Error(j?.error ?? "Failed to refresh");
    }
    setRows(j.items ?? []);
  }

  async function runNow(dryRun = false) {
    setBusy(true);
    setMsg(null);
    setApiError(null);
    try {
      const rr = await apiPost<any>("/api/proxy/v1/crm/manager/auto-assign/run", {
        mode: dryRun ? "dry_run" : "execute",
        limit_reps: 10,
        contacts_per_rep: Math.max(1, Number(contactsPerRep) || 1),
        max_total_contacts: Math.max(1, Number(maxTotalContacts) || 1),
      });

      if (!rr.ok) {
        setApiError(rr);
        throw new Error(rr.error);
      }

      const j = rr.data as any;
      if (!j?.ok) {
        const msg = String(j?.error ?? "Runner failed");
        setApiError({ ok: false, status: rr.status, kind: "unknown", title: "Request failed", hint: "Unexpected response shape.", error: msg });
        throw new Error(msg);
      }

      // runner returns stats; show something readable
      const run_id = String(j?.run_id ?? "").trim();
      const created = Number(j?.totals?.actions_created ?? 0);
      const skipped = Number(j?.totals?.skipped_dedupe ?? 0);
      const contacts = Number(j?.totals?.contacts_considered ?? 0);
      const reps = Number(j?.totals?.reps_considered ?? 0);
      const errors = Number(j?.totals?.errors ?? 0);

      setLastRun({
        run_id: run_id || "(missing)",
        mode: String(j?.mode ?? (dryRun ? "dry_run" : "execute")),
        source: "manual",
        started_at: j?.started_at,
        finished_at: j?.finished_at,
        executed_from_preview_run_id: null,
        executed_by_user_id: null,
        executed_at: null,
        totals: {
          reps_considered: reps,
          contacts_considered: contacts,
          actions_created: created,
          skipped_dedupe: skipped,
          errors,
        },
      });

      const base = `${dryRun ? "Dry run" : "Run"} OK (reps: ${reps}, contacts: ${contacts}, created: ${created}, skipped: ${skipped}${errors ? `, errors: ${errors}` : ""})`;
      setMsg(run_id ? `${base} — run_id: ${run_id}` : base);

      await refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Runner error");
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    setPreviewBusy(true);
    setApiError(null);
    setPreview(null);

    try {
      const rr = await apiPost<any>("/api/proxy/v1/crm/manager/auto-assign/preview", {
        limit_reps: 10,
        contacts_per_rep: Math.max(1, Number(contactsPerRep) || 1),
        max_total_contacts: Math.max(1, Number(maxTotalContacts) || 1),
      });

      if (!rr.ok) {
        setApiError(rr);
        throw new Error(rr.error);
      }

      const j = rr.data as any;
      if (!j?.ok) {
        const msg = String(j?.error ?? "Preview failed");
        setApiError({ ok: false, status: rr.status, kind: "unknown", title: "Preview failed", hint: "Unexpected response shape.", error: msg });
        throw new Error(msg);
      }

      setPreview(j);
      // If a new preview exists, clear any previous execute-from-preview confirmation state.
      setConfirmExecutePreviewId(null);
    } catch (e: any) {
      // handled above
    } finally {
      setPreviewBusy(false);
    }
  }

  async function executeFromPreview(previewRunId: string) {
    if (!isValidRunId(previewRunId)) {
      setApiError({
        ok: false,
        status: 422,
        kind: "validation",
        title: "Invalid preview run id",
        hint: "Refusing to execute because preview_run_id is not a valid UUID.",
        error: "invalid_preview_run_id",
      });
      setMsg("Invalid preview_run_id — refused to execute.");
      return;
    }
    setBusy(true);
    setMsg(null);
    setApiError(null);

    try {
      const rr = await apiPost<any>("/api/proxy/v1/crm/manager/auto-assign/execute-from-preview", {
        preview_run_id: previewRunId,
      });

      if (!rr.ok) {
        setApiError(rr);
        throw new Error(rr.error);
      }

      const j = rr.data as any;
      if (!j?.ok) {
        const msg = String(j?.error ?? "Execute-from-preview failed");
        setApiError({
          ok: false,
          status: rr.status,
          kind: "unknown",
          title: "Execute failed",
          hint: "The server rejected the preview execution.",
          error: msg,
        });
        throw new Error(msg);
      }

      const run_id = String(j?.run_id ?? "").trim();
      const created = Number(j?.totals?.actions_created ?? 0);
      const skipped = Number(j?.totals?.skipped_dedupe ?? 0);
      const contacts = Number(j?.totals?.contacts_considered ?? 0);
      const reps = Number(j?.totals?.reps_considered ?? 0);
      const errors = Number(j?.totals?.errors ?? 0);

      setLastRun({
        run_id: run_id || "(missing)",
        mode: "execute",
        source: "manual",
        started_at: j?.started_at,
        finished_at: j?.finished_at,
        executed_from_preview_run_id: previewRunId,
        executed_by_user_id: null,
        executed_at: new Date().toISOString(),
        totals: {
          reps_considered: reps,
          contacts_considered: contacts,
          actions_created: created,
          skipped_dedupe: skipped,
          errors,
        },
      });

      const base = `Executed preview OK (reps: ${reps}, contacts: ${contacts}, created: ${created}, skipped: ${skipped}${errors ? `, errors: ${errors}` : ""})`;
      setMsg(run_id ? `${base} — run_id: ${run_id}` : base);

      // Clear preview panel after successful execute
      setPreview(null);

      await refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Execute error");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    if (!settings) return;

    setSettingsBusy(true);
    setSettingsMsg(null);
    setApiError(null);

    try {
      const rr = await apiPost<TeamSettingsResp>("/api/proxy/v1/crm/manager/settings", {
        streak_threshold: Number(settings.streak_threshold ?? 3),
        xp_multiplier: Number(settings.xp_multiplier ?? 1),
        comeback_bonus: Number(settings.comeback_bonus ?? 0),
        xp_cap_daily: Number(settings.xp_cap_daily ?? 500),
        voice_score_threshold: Number(settings.voice_score_threshold ?? 60),
        weak_close_threshold: Number(settings.weak_close_threshold ?? 60),
        filler_density_threshold: Number(settings.filler_density_threshold ?? 0.08),
        coaching_trigger_thresholds: {
          ...(settings.coaching_trigger_thresholds ?? {}),
          voice_score_lt: Number(
            settings.coaching_trigger_thresholds?.voice_score_lt ??
            settings.voice_score_threshold ??
            60
          ),
          weak_close: Boolean(settings.coaching_trigger_thresholds?.weak_close ?? true),
          inactive_days_gt: Number(settings.coaching_trigger_thresholds?.inactive_days_gt ?? 3),
        },
      });

      if (!rr.ok) {
        setApiError(rr);
        throw new Error(rr.error);
      }

      const j = rr.data as TeamSettingsResp;
      if (!j?.ok || !j?.settings) {
        throw new Error(String(j?.error ?? "Failed to save manager settings"));
      }

      setSettings(j.settings);
      setSettingsMsg("Manager settings saved.");
    } catch (e: any) {
      setSettingsMsg(String(e?.message ?? "Failed to save manager settings"));
    } finally {
      setSettingsBusy(false);
    }
  }

  async function runBatchAssign() {
    setBatchBusy(true);
    setBatchMsg(null);
    setBatchResult(null);
    setApiError(null);

    try {
      const criteria =
        batchMode === "low_voice"
          ? { voice_score_lt: Number(settings?.voice_score_threshold ?? 60) }
          : batchMode === "weak_close"
            ? { weak_close: true }
            : { inactive_days_gt: Number(settings?.coaching_trigger_thresholds?.inactive_days_gt ?? 3) };

      const rr = await apiPost<BatchAssignResp>("/api/proxy/v1/crm/assignments/manager/batch-assign", {
        drill_id: batchDrillId,
        title:
          batchMode === "low_voice"
            ? "Low Voice Score Drill"
            : batchMode === "weak_close"
              ? "Weak Close Drill"
              : "Inactive Rep Comeback Drill",
        criteria,
      });

      if (!rr.ok) {
        setApiError(rr);
        throw new Error(rr.error);
      }

      const j = rr.data as BatchAssignResp;
      if (!j?.ok) {
        throw new Error(String(j?.error ?? "Batch assignment failed"));
      }

      setBatchResult(j);
      setBatchMsg(
        `Batch assignment complete — matched ${Number(j.matched_count ?? 0)}, assigned ${Number(
          j.assigned_count ?? 0
        )}, failed ${Number(j.failed_count ?? 0)}.`
      );
    } catch (e: any) {
      setBatchMsg(String(e?.message ?? "Batch assignment failed"));
    } finally {
      setBatchBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-neutral-100">Manager settings</h2>
              <p className="mt-1 text-xs text-neutral-500">
                Configure XP, streaks and coaching thresholds for this org.
              </p>
            </div>
            <button
              type="button"
              onClick={saveSettings}
              disabled={settingsBusy || !settings}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {settingsBusy ? "Saving..." : "Save settings"}
            </button>
          </div>

          {!settings ? (
            <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 text-sm text-neutral-400">
              {settingsBusy ? "Loading manager settings..." : "No settings loaded."}
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-neutral-400">
                <span className="mb-1 block">Streak threshold</span>
                <input
                  type="number"
                  value={settings.streak_threshold}
                  onChange={(e) => setSettings((s) => (s ? { ...s, streak_threshold: Number(e.target.value || 0) } : s))}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none"
                />
              </label>

              <label className="block text-xs text-neutral-400">
                <span className="mb-1 block">XP multiplier</span>
                <input
                  type="number"
                  step="0.01"
                  value={settings.xp_multiplier}
                  onChange={(e) => setSettings((s) => (s ? { ...s, xp_multiplier: Number(e.target.value || 0) } : s))}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none"
                />
              </label>

              <label className="block text-xs text-neutral-400">
                <span className="mb-1 block">Comeback bonus</span>
                <input
                  type="number"
                  value={settings.comeback_bonus}
                  onChange={(e) => setSettings((s) => (s ? { ...s, comeback_bonus: Number(e.target.value || 0) } : s))}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none"
                />
              </label>

              <label className="block text-xs text-neutral-400">
                <span className="mb-1 block">Daily XP cap</span>
                <input
                  type="number"
                  value={settings.xp_cap_daily}
                  onChange={(e) => setSettings((s) => (s ? { ...s, xp_cap_daily: Number(e.target.value || 0) } : s))}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none"
                />
              </label>

              <label className="block text-xs text-neutral-400">
                <span className="mb-1 block">Voice score threshold</span>
                <input
                  type="number"
                  value={settings.voice_score_threshold}
                  onChange={(e) =>
                    setSettings((s) =>
                      s
                        ? {
                          ...s,
                          voice_score_threshold: Number(e.target.value || 0),
                          coaching_trigger_thresholds: {
                            ...(s.coaching_trigger_thresholds ?? {}),
                            voice_score_lt: Number(e.target.value || 0),
                          },
                        }
                        : s
                    )
                  }
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none"
                />
              </label>

              <label className="block text-xs text-neutral-400">
                <span className="mb-1 block">Weak close threshold</span>
                <input
                  type="number"
                  value={settings.weak_close_threshold}
                  onChange={(e) => setSettings((s) => (s ? { ...s, weak_close_threshold: Number(e.target.value || 0) } : s))}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none"
                />
              </label>

              <label className="block text-xs text-neutral-400">
                <span className="mb-1 block">Filler density threshold</span>
                <input
                  type="number"
                  step="0.01"
                  value={settings.filler_density_threshold}
                  onChange={(e) => setSettings((s) => (s ? { ...s, filler_density_threshold: Number(e.target.value || 0) } : s))}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none"
                />
              </label>

              <label className="block text-xs text-neutral-400">
                <span className="mb-1 block">Inactive days trigger</span>
                <input
                  type="number"
                  value={Number(settings.coaching_trigger_thresholds?.inactive_days_gt ?? 3)}
                  onChange={(e) =>
                    setSettings((s) =>
                      s
                        ? {
                          ...s,
                          coaching_trigger_thresholds: {
                            ...(s.coaching_trigger_thresholds ?? {}),
                            inactive_days_gt: Number(e.target.value || 0),
                          },
                        }
                        : s
                    )
                  }
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none"
                />
              </label>
            </div>
          )}

          {settingsMsg ? (
            <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-xs text-neutral-300">
              {settingsMsg}
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-neutral-100">Batch assign drills</h2>
              <p className="mt-1 text-xs text-neutral-500">
                Create manager coaching tasks in bulk from live performance signals.
              </p>
            </div>
            <button
              type="button"
              onClick={runBatchAssign}
              disabled={batchBusy}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {batchBusy ? "Assigning..." : "Run batch assign"}
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <label className="block text-xs text-neutral-400">
              <span className="mb-1 block">Drill id</span>
              <input
                type="text"
                value={batchDrillId}
                onChange={(e) => setBatchDrillId(e.target.value)}
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none"
              />
            </label>

            <label className="block text-xs text-neutral-400">
              <span className="mb-1 block">Target group</span>
              <select
                value={batchMode}
                onChange={(e) => setBatchMode(e.target.value as "low_voice" | "weak_close" | "inactive")}
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none"
              >
                <option value="low_voice">Low voice score reps</option>
                <option value="weak_close">Weak close reps</option>
                <option value="inactive">Inactive reps</option>
              </select>
            </label>

            <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 text-xs text-neutral-400">
              {batchMode === "low_voice" ? (
                <>
                  This will assign <span className="text-neutral-200">{batchDrillId || "closing_drill"}</span> to reps with voice score below <span className="text-neutral-200">{Number(settings?.voice_score_threshold ?? 60)}</span>.
                </>
              ) : batchMode === "weak_close" ? (
                <>
                  This will assign <span className="text-neutral-200">{batchDrillId || "closing_drill"}</span> to reps flagged with weak close.
                </>
              ) : (
                <>
                  This will assign <span className="text-neutral-200">{batchDrillId || "comeback_drill"}</span> to reps inactive for more than <span className="text-neutral-200">{Number(settings?.coaching_trigger_thresholds?.inactive_days_gt ?? 3)}</span> days.
                </>
              )}
            </div>
          </div>

          {batchMsg ? (
            <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-xs text-neutral-300">
              {batchMsg}
            </div>
          ) : null}

          {batchResult?.ok ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
                <div className="text-[11px] text-neutral-500">Matched</div>
                <div className="mt-1 text-lg font-semibold text-neutral-100">{Number(batchResult.matched_count ?? 0)}</div>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
                <div className="text-[11px] text-neutral-500">Assigned</div>
                <div className="mt-1 text-lg font-semibold text-neutral-100">{Number(batchResult.assigned_count ?? 0)}</div>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
                <div className="text-[11px] text-neutral-500">Failed</div>
                <div className="mt-1 text-lg font-semibold text-neutral-100">{Number(batchResult.failed_count ?? 0)}</div>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {apiError && (
        <div className="mb-3 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-neutral-100 font-semibold">
                {apiError.title}
                {apiError.status > 0 ? (
                  <span className="ml-2 text-neutral-400 font-normal">({apiError.status})</span>
                ) : null}
              </div>
              <div className="text-neutral-300 text-sm mt-1">{apiError.hint}</div>
              <div className="text-neutral-400 text-xs mt-2 font-mono break-all">{apiError.error}</div>
            </div>

            <button
              className="text-neutral-300 hover:text-white text-sm"
              onClick={() => setApiError(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {AUTO_ASSIGN_WRITE_UI_ENABLED ? (
        <div className="flex items-center gap-3">
          <button
            disabled={busy}
            onClick={() => {
              setMsg(null);
              setApiError(null);
              setConfirmExecute(true);
            }}
            className="px-3 py-2 rounded bg-white text-black text-sm font-medium disabled:opacity-60"
          >
            {busy ? "Running…" : "Run auto-assign now"}
          </button>

          <button
            disabled={busy}
            onClick={() => {
              setMsg(null);
              setApiError(null);
              runNow(true);
            }}
            className="px-3 py-2 rounded border border-neutral-700 text-sm disabled:opacity-60"
          >
            Dry run
          </button>

          <button
            disabled={busy || previewBusy}
            onClick={() => {
              setMsg(null);
              setApiError(null);
              setConfirmExecutePreviewId(null);
              runPreview();
            }}
            className="px-3 py-2 rounded border border-neutral-700 text-sm font-medium disabled:opacity-60"
          >
            {previewBusy ? "Previewing…" : "Preview"}
          </button>

          <div className="text-xs text-neutral-400 ml-auto">
            mode: <span className="text-neutral-200">{mode}</span>
          </div>
        </div>
      ) : null}

      {AUTO_ASSIGN_WRITE_UI_ENABLED ? (
        <>
          {confirmExecutePreviewId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="bg-neutral-950 border border-neutral-800 rounded p-4 w-full max-w-md space-y-3">
                <div className="text-neutral-200 font-medium">Confirm execute</div>

                <div className="text-sm text-neutral-400">
                  This will create CRM actions using the selected preview. This cannot be undone.
                </div>

                <div className="text-xs text-neutral-500">
                  preview_run_id: <span className="font-mono text-neutral-200">{confirmExecutePreviewId}</span>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setConfirmExecutePreviewId(null)}
                    className="px-3 py-2 rounded border border-neutral-700 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      const id = confirmExecutePreviewId;
                      setConfirmExecutePreviewId(null);
                      if (id) await executeFromPreview(id);
                    }}
                    className="px-3 py-2 rounded bg-white text-black text-sm font-medium"
                  >
                    Yes, execute preview
                  </button>
                </div>
              </div>
            </div>
          )}
          {confirmExecute && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="bg-neutral-950 border border-neutral-800 rounded p-4 w-full max-w-md space-y-3">
                <div className="text-neutral-200 font-medium">Confirm execute</div>

                <div className="text-sm text-neutral-400">
                  This will create CRM actions for reps. This cannot be undone.
                </div>

                <div className="text-xs text-neutral-500">
                  Caps: <span className="text-neutral-200">{contactsPerRep}</span> contacts/rep •{" "}
                  <span className="text-neutral-200">{maxTotalContacts}</span> max contacts total
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setConfirmExecute(false)}
                    className="px-3 py-2 rounded border border-neutral-700 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      setConfirmExecute(false);
                      await runNow(false);
                    }}
                    className="px-3 py-2 rounded bg-white text-black text-sm font-medium"
                  >
                    Yes, run auto-assign
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}

      {AUTO_ASSIGN_WRITE_UI_ENABLED ? (
        <div className="flex gap-3 text-sm">
          <div className="px-3 py-2 rounded border border-neutral-800">
            Open: <span className="font-semibold">{totals.open}</span>
          </div>
          <div className="px-3 py-2 rounded border border-neutral-800">
            Overdue: <span className="font-semibold">{totals.overdue}</span>
          </div>
          <div className="px-3 py-2 rounded border border-neutral-800">
            Done today: <span className="font-semibold">{totals.done}</span>
          </div>
        </div>
      ) : null}

      {AUTO_ASSIGN_WRITE_UI_ENABLED && msg ? (
        <div className="text-sm text-neutral-200 border border-neutral-800 rounded p-3">
          {msg}
        </div>
      ) : null}

      {AUTO_ASSIGN_WRITE_UI_ENABLED && preview ? (
        <div className="text-sm border border-neutral-800 rounded p-3 space-y-2">
          <div className="flex items-center gap-3">
            <div className="text-neutral-200 font-medium">Preview (dry run)</div>
            <span className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-200">no changes made</span>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <div className="px-2 py-1 rounded border border-neutral-800">
              reps: <span className="text-neutral-200">{previewTotals.reps}</span>
            </div>
            <div className="px-2 py-1 rounded border border-neutral-800">
              contacts: <span className="text-neutral-200">{previewTotals.contacts}</span>
            </div>
            <div className="px-2 py-1 rounded border border-neutral-800">
              would create: <span className="text-neutral-200">{previewTotals.wouldCreate}</span>
            </div>
            <div className="px-2 py-1 rounded border border-neutral-800">
              skipped: <span className="text-neutral-200">{previewTotals.skipped}</span>
            </div>
            <div className="px-2 py-1 rounded border border-neutral-800">
              errors: <span className="text-neutral-200">{previewTotals.errors}</span>
            </div>
          </div>

          <div className="text-xs text-neutral-500 space-y-1">
            <div>
              Preview run_id:{" "}
              <span className="font-mono text-neutral-200">
                {previewRunId ?? "(missing)"}
              </span>
            </div>
            {!previewRunId || !isValidRunId(previewRunId) ? (
              <div className="text-amber-200">
                Can’t execute: preview is missing a run_id. Check API logs/response.
              </div>
            ) : null}
            {previewTotals.errors > 0 ? (
              <div className="text-amber-200">
                Preview has {previewTotals.errors} error(s). Fix errors before executing.
              </div>
            ) : (
              <div>Review the preview. If this looks correct, you can execute using this preview.</div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              onClick={() => setPreview(null)}
              className="px-3 py-2 rounded border border-neutral-700 text-sm"
            >
              Dismiss
            </button>

            <button
              disabled={!previewRunId || previewTotals.errors > 0}
              onClick={() => {
                if (!previewRunId) {
                  setMsg("Preview is missing a valid run_id — cannot execute.");
                  return;
                }
                if (previewTotals.errors > 0) {
                  setApiError({
                    ok: false,
                    status: 422,
                    kind: "validation",
                    title: "Preview has errors",
                    hint: "Fix preview errors before executing.",
                    error: "preview_has_errors",
                  });
                  return;
                }
                setConfirmExecutePreviewId(previewRunId);
              }}
              className="px-3 py-2 rounded bg-white text-black text-sm font-medium disabled:opacity-60"
            >
              Execute this preview
            </button>

            <div className="ml-auto text-xs text-neutral-500 flex items-center gap-2">
              <span>caps:</span>
              <span className="text-neutral-200">{contactsPerRep}</span>
              <span>per rep</span>
              <span className="text-neutral-200">{maxTotalContacts}</span>
              <span>max total</span>
            </div>
          </div>
        </div>
      ) : null}
      {AUTO_ASSIGN_READ_UI_ENABLED && lastRun ? (
        <div className="text-sm border border-neutral-800 rounded p-3 space-y-2">
          <div className="flex items-center gap-3">
            <div className="text-neutral-200 font-medium">Latest run</div>

            {lastRun?.executed_from_preview_run_id && (
              <span
                className="text-xs px-2 py-0.5 rounded bg-emerald-900/20 text-emerald-200"
                title={`Executed from preview: ${String(lastRun.executed_from_preview_run_id)}`}
              >
                from preview
              </span>
            )}

            {lastRun?.source === "cron" && (
              <span className="text-xs px-2 py-0.5 rounded bg-blue-900/40 text-blue-200">cron</span>
            )}

            {lastRun?.executed_at && !lastRun?.executed_from_preview_run_id && (
              <span
                className="text-xs px-2 py-0.5 rounded border border-neutral-800 text-neutral-200"
                title={`Executed at: ${new Date(lastRun.executed_at).toLocaleString()}`}
              >
                executed
              </span>
            )}

            <div className="text-xs text-neutral-400 ml-auto">
              mode: <span className="text-neutral-200">{lastRun.mode}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-400">
            <div className="flex items-center gap-2">
              <span>contacts/rep</span>
              <input
                type="number"
                min={1}
                value={contactsPerRep}
                onChange={(e) => setContactsPerRep(Math.max(1, Number(e.target.value) || 1))}
                className="w-20 px-2 py-1 rounded bg-neutral-950 border border-neutral-800 text-neutral-200"
              />
            </div>

            <div className="flex items-center gap-2">
              <span>max contacts</span>
              <input
                type="number"
                min={1}
                value={maxTotalContacts}
                onChange={(e) => setMaxTotalContacts(Math.max(1, Number(e.target.value) || 1))}
                className="w-24 px-2 py-1 rounded bg-neutral-950 border border-neutral-800 text-neutral-200"
              />
            </div>

            <div className="text-neutral-500">These caps apply to dry-run + execute.</div>
          </div>

          <div className="text-xs text-neutral-400">
            run_id: <span className="font-mono text-neutral-200">{lastRun.run_id}</span>
          </div>

          {lastRun.executed_from_preview_run_id && (
            <div className="text-xs text-neutral-500">
              executed_from_preview_run_id:{" "}
              <span className="font-mono text-neutral-200">{lastRun.executed_from_preview_run_id}</span>
            </div>
          )}

          {lastRun.executed_at && (
            <div className="text-xs text-neutral-500">
              executed_at: <span className="text-neutral-200">{new Date(lastRun.executed_at).toLocaleString()}</span>
            </div>
          )}

          {shouldSlackAlert(lastRun.totals) ? (
            <div className="border border-amber-900/40 bg-amber-950/10 rounded p-2">
              <div className="flex items-center gap-2">
                <div className="text-amber-200 text-xs font-medium">Slack alert</div>
                <div className="text-xs text-amber-100/80">sent (based on thresholds)</div>
                <div className="ml-auto text-xs text-neutral-500">rule: errors &gt; 0 OR created ≥ {SLACK_ALERT_ACTIONS_CREATED_THRESHOLD}</div>
              </div>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-amber-100/90 font-mono break-words">
                {buildSlackPreview(lastRun)}
              </pre>
            </div>
          ) : (
            <div className="text-xs text-neutral-500">
              Slack alert: not sent (errors = 0 and created &lt; {SLACK_ALERT_ACTIONS_CREATED_THRESHOLD})
            </div>
          )}

          {lastRun?.source === "cron" && (
            <div className="text-xs text-neutral-500">
              Last run executed automatically by scheduler
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-xs">
            <div className="px-2 py-1 rounded border border-neutral-800">reps: <span className="text-neutral-200">{lastRun.totals?.reps_considered ?? 0}</span></div>
            <div className="px-2 py-1 rounded border border-neutral-800">contacts: <span className="text-neutral-200">{lastRun.totals?.contacts_considered ?? 0}</span></div>
            <div className="px-2 py-1 rounded border border-neutral-800">created: <span className="text-neutral-200">{lastRun.totals?.actions_created ?? 0}</span></div>
            <div className="px-2 py-1 rounded border border-neutral-800">skipped: <span className="text-neutral-200">{lastRun.totals?.skipped_dedupe ?? 0}</span></div>
            <div className="px-2 py-1 rounded border border-neutral-800">errors: <span className="text-neutral-200">{lastRun.totals?.errors ?? 0}</span></div>
          </div>

          {(lastRun.started_at || lastRun.finished_at) && (
            <div className="text-xs text-neutral-500">
              {lastRun.started_at ? `started: ${new Date(lastRun.started_at).toLocaleString()}` : ""}
              {lastRun.finished_at ? ` • finished: ${new Date(lastRun.finished_at).toLocaleString()}` : ""}
            </div>
          )}
        </div>
      ) : null}

      {AUTO_ASSIGN_READ_UI_ENABLED ? (
        <>
          {/* Run history */}
          <div className="border border-neutral-800 rounded p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-neutral-200 font-medium">Run history</div>
              <div className="text-xs text-neutral-500">Last 10 runs (cron + manual)</div>
            </div>
            <RunHistoryTable limit={10} />
          </div>
        </>
      ) : null}

      {!AUTO_ASSIGN_WRITE_UI_ENABLED ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-xl border border-dashed border-neutral-800 bg-neutral-950/60 p-4 opacity-80">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-neutral-200">Auto-Assign Runner</h3>
                <p className="mt-1 text-xs text-neutral-500">
                  Execute / preview controls are staged next. Read-only latest run and history are now live below.
                </p>
              </div>
              <span className="rounded-full border border-neutral-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                Write flow pending
              </span>
            </div>
            <div className="mt-4 space-y-2">
              <div className="rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-xs text-neutral-500">
                Execute run
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-xs text-neutral-500">
                Preview / execute-from-preview
              </div>
            </div>
          </section>
        </div>
      ) : null}

      <div className="text-neutral-200 font-medium pt-2">Rep overview</div>
      <div className="overflow-auto border border-neutral-800 rounded">
        <table className="min-w-[700px] w-full text-sm">
          <thead className="bg-neutral-900/40">
            <tr className="text-left">
              <th className="p-3">Rep</th>
              <th className="p-3">Open</th>
              <th className="p-3">Overdue</th>
              <th className="p-3">Completed Today</th>
              <th className="p-3">Rep ID</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rep_id} className="border-t border-neutral-800">
                <td className="p-3">{r.rep_name}</td>
                <td className="p-3">{r.counts.open}</td>
                <td className="p-3">{r.counts.overdue}</td>
                <td className="p-3">{r.counts.completed_today}</td>
                <td className="p-3 font-mono text-xs text-neutral-400">{r.rep_id}</td>
              </tr>
            ))}

            {!rows.length && (
              <tr>
                <td className="p-3 text-neutral-400" colSpan={5}>
                  No reps found (mode={mode})
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}