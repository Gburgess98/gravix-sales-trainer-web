"use client";

// NOTE: admin_config is a platform-wide singleton on the API (one row, not per organisation), so the streak / points /
// threshold controls change values for every company. The UI says so (badge + confirmation); see docs/glass-system/SETTINGS_HUB.md.
// Settings hub (administration). Manager/admin only: the admin segment's RoleGate renders nothing until the API confirms the role and
// sends everyone else to /assignments. Every editable control here writes through an EXISTING endpoint:
//   PATCH /v1/admin/org-settings   call_visibility
//   PATCH /v1/admin/config         streak_threshold, xp_multiplier, comeback_bonus, low/critical_score_threshold
// Section components only present data; this page owns the drafts so switching sections never loses an edit.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getAdminConfig, patchAdminConfig, proxyGet, proxyPatch, AdminConfig } from "@/lib/api";
import { PageHead, PageShell } from "@/components/ds";
import { SettingsShell, useUnsavedGuard } from "@/components/settings/settings-shell";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import {
  AiSection,
  CallsPrivacySection,
  CoachingScoringSection,
  GamificationSection,
  GeneralSection,
  PeopleSection,
  SystemSection,
  type Notice,
} from "@/components/settings/sections";
import {
  VISIBILITY_OPTIONS,
  gamificationDirty,
  parseSection,
  thresholdsDirty,
  thresholdsFromConfig,
  toGamificationForm,
  validateGamification,
  validateThresholds,
  visibilityLabel,
  type CallVisibility,
  type GamificationForm,
  type SectionId,
  type ThresholdForm,
} from "@/lib/settings-model";

type OrgSettingsResp = {
  ok?: boolean;
  settings?: { call_visibility?: string | null } | null;
};

function normaliseVisibility(v: unknown): CallVisibility | null {
  return v === "everyone" || v === "managers" || v === "disabled" ? v : null;
}

type Confirm = null | "visibility" | "gamification" | "thresholds";
const EMPTY_THRESHOLDS: ThresholdForm = { low_score_threshold: "", critical_score_threshold: "" };

function AdminSettings() {
  const section: SectionId = parseSection(useSearchParams()?.get("section"));

  // ── Company call visibility ──────────────────────────────────────────────
  // Day 292 — company-call visibility is server-owned; we only ever reflect a value the API has confirmed.
  // "unknown" means we have not positively read it (never optimistically assume "everyone").
  const [visibility, setVisibility] = useState<CallVisibility | "unknown">("unknown");
  const [visLoading, setVisLoading] = useState(true);
  const [visSaving, setVisSaving] = useState(false);
  const [visErr, setVisErr] = useState<string | null>(null);
  const [visDraft, setVisDraft] = useState<CallVisibility | null>(null);
  const [visNotice, setVisNotice] = useState<Notice>(null);

  // ── Scoring + gamification config (one row, two forms) ───────────────────
  const [raw, setRaw] = useState<AdminConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configErr, setConfigErr] = useState<string | null>(null);
  const [gForm, setGForm] = useState<GamificationForm>({ streak_threshold: "", xp_multiplier: "", comeback_bonus: "" });
  const [gAttempted, setGAttempted] = useState(false);
  const [gSaving, setGSaving] = useState(false);
  const [gNotice, setGNotice] = useState<Notice>(null);
  const [tForm, setTForm] = useState<ThresholdForm>(EMPTY_THRESHOLDS);
  const [tSaved, setTSaved] = useState<ThresholdForm | null>(null);
  const [tAttempted, setTAttempted] = useState(false);
  const [tSaving, setTSaving] = useState(false);
  const [tNotice, setTNotice] = useState<Notice>(null);

  const [confirm, setConfirm] = useState<Confirm>(null);

  const gSaved = useMemo(() => (raw ? toGamificationForm(raw) : null), [raw]);

  const applyConfig = useCallback((cfg: AdminConfig) => {
    setRaw(cfg);
    setGForm(toGamificationForm(cfg));
    const t = thresholdsFromConfig(cfg as unknown as Record<string, unknown>);
    setTSaved(t);
    setTForm(t ?? EMPTY_THRESHOLDS);
  }, []);

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigErr(null);
    try {
      applyConfig(await getAdminConfig());
    } catch {
      // Never surface the raw provider/error string.
      setConfigErr("Couldn’t load these settings.");
    } finally {
      setConfigLoading(false);
    }
  }, [applyConfig]);

  // Day 292 — read org settings through the canonical authenticated proxy helper (Supabase identity injected by
  // proxyFetch); the org is resolved server-side, never from the client. On any failure we keep "unknown" rather
  // than lying with "everyone".
  const loadVisibility = useCallback(async () => {
    setVisErr(null);
    setVisLoading(true);
    try {
      const d = await proxyGet<OrgSettingsResp>("/v1/admin/org-settings");
      const v = normaliseVisibility(d?.settings?.call_visibility);
      // Absent row is a genuine "everyone" default from the API; an unparseable value stays "unknown".
      setVisibility(v ?? (d?.settings?.call_visibility == null ? "everyone" : "unknown"));
    } catch {
      setVisibility("unknown");
      setVisErr("Couldn’t load call visibility.");
    } finally {
      setVisLoading(false);
    }
  }, []);

  useEffect(() => { void loadVisibility(); void loadConfig(); }, [loadVisibility, loadConfig]);

  // Day 292 — write through the canonical authenticated proxy helper. PATCH stays manager-only at the API. We do NOT
  // optimistically flip the UI: the selection only moves after a validated success, echoing the server-confirmed
  // value. On denial / 5xx / transport failure we keep the previous value, surface a clean error, and reload the
  // truth. A saving guard prevents rapid duplicate writes, and we never send a client org/company override.
  const updateVisibility = useCallback(
    async (val: CallVisibility): Promise<boolean> => {
      if (visSaving) return false;
      if (val === visibility) return true;
      setVisErr(null);
      setVisSaving(true);
      const prev = visibility;
      try {
        const d = await proxyPatch<OrgSettingsResp>("/v1/admin/org-settings", {
          call_visibility: val,
        });
        const saved = normaliseVisibility(d?.settings?.call_visibility);
        setVisibility(saved ?? val);
        return true;
      } catch {
        setVisibility(prev);
        setVisErr("Couldn’t update visibility — your change was not saved.");
        void loadVisibility();
        return false;
      } finally {
        setVisSaving(false);
      }
    },
    [visibility, visSaving, loadVisibility]
  );

  // ── Dirty state ──────────────────────────────────────────────────────────
  const visDirty = visDraft !== null && visDraft !== visibility;
  const gDirty = gamificationDirty(gForm, gSaved);
  const tDirty = thresholdsDirty(tForm, tSaved);
  const dirtyBySection: Partial<Record<SectionId, boolean>> = { privacy: visDirty, gamification: gDirty, coaching: tDirty };
  const { dialog: leaveDialog } = useUnsavedGuard(visDirty || gDirty || tDirty);

  // ── Save flows: validate → confirm → write ───────────────────────────────
  const gValidation = validateGamification(gForm);
  const tValidation = validateThresholds(tForm);

  async function confirmed() {
    const which = confirm;
    if (which === "visibility" && visDraft) {
      setVisNotice(null);
      const ok = await updateVisibility(visDraft);
      setConfirm(null);
      if (ok) { setVisDraft(null); setVisNotice({ type: "success", text: "Call visibility saved. It applies to everyone now." }); }
      else setVisNotice({ type: "error", text: "Couldn’t save call visibility. Your change was not applied." });
    }
    if (which === "gamification" && gValidation.values) {
      setGNotice(null);
      setGSaving(true);
      try {
        applyConfigKeepThresholds(await patchAdminConfig(gValidation.values));
        setGAttempted(false);
        setGNotice({ type: "success", text: "Settings saved. They apply platform-wide now." });
      } catch {
        setGNotice({ type: "error", text: "Couldn’t save these settings. Your changes were not applied." });
      } finally {
        setGSaving(false);
        setConfirm(null);
      }
    }
    if (which === "thresholds" && tValidation.values) {
      setTNotice(null);
      setTSaving(true);
      try {
        const d = await proxyPatch<{ config?: AdminConfig }>("/v1/admin/config", tValidation.values);
        if (d?.config) applyConfig(d.config);
        else await loadConfig();
        setTAttempted(false);
        setTNotice({ type: "success", text: "Thresholds saved. They apply platform-wide to new scoring now." });
      } catch {
        setTNotice({ type: "error", text: "Couldn’t save thresholds. Your changes were not applied." });
      } finally {
        setTSaving(false);
        setConfirm(null);
      }
    }
  }

  // After a gamification save keep any unsaved threshold draft; only the saved baseline moves.
  function applyConfigKeepThresholds(cfg: AdminConfig) {
    setRaw(cfg);
    setGForm(toGamificationForm(cfg));
    setTSaved(thresholdsFromConfig(cfg as unknown as Record<string, unknown>) ?? tSaved);
  }

  function requestSaveGamification() {
    setGAttempted(true);
    setGNotice(null);
    if (gValidation.ok) setConfirm("gamification");
  }
  function requestSaveThresholds() {
    setTAttempted(true);
    setTNotice(null);
    if (tValidation.ok) setConfirm("thresholds");
  }

  const change = (label: string, from: string, to: string) => (from === to ? null : <li key={label}>{label}: <span className="text-[var(--ds-text)]">{from} → {to}</span></li>);

  return (
    <PageShell>
      <PageHead title="Settings" subtitle="Administration for your workspace." />
      <SettingsShell active={section} dirty={dirtyBySection}>
        {section === "general" && <GeneralSection />}
        {section === "people" && <PeopleSection />}
        {section === "ai" && <AiSection />}
        {section === "privacy" && (
          <CallsPrivacySection
            saved={visibility}
            draft={visDraft}
            onDraft={(v) => { setVisNotice(null); setVisDraft(v === visibility ? null : v); }}
            onDiscard={() => { setVisDraft(null); setVisNotice(null); }}
            onSave={() => { setVisNotice(null); if (visDirty) setConfirm("visibility"); }}
            loading={visLoading}
            saving={visSaving}
            error={visErr}
            onRetry={() => void loadVisibility()}
            notice={visNotice}
          />
        )}
        {section === "coaching" && (
          <CoachingScoringSection
            loading={configLoading}
            error={configErr}
            onRetry={() => void loadConfig()}
            available={tSaved !== null}
            form={tForm}
            errors={tAttempted ? tValidation.errors : {}}
            dirty={tDirty}
            saving={tSaving}
            onChange={(f) => { setTNotice(null); setTForm(f); }}
            onDiscard={() => { setTForm(tSaved ?? EMPTY_THRESHOLDS); setTAttempted(false); setTNotice(null); }}
            onSave={requestSaveThresholds}
            notice={tNotice}
          />
        )}
        {section === "gamification" && (
          <GamificationSection
            loading={configLoading}
            error={configErr}
            onRetry={() => void loadConfig()}
            form={gForm}
            errors={gAttempted ? gValidation.errors : {}}
            dirty={gDirty}
            saving={gSaving}
            updatedAt={raw?.updated_at ?? null}
            onChange={(f) => { setGNotice(null); setGForm(f); }}
            onDiscard={() => { if (gSaved) setGForm(gSaved); setGAttempted(false); setGNotice(null); }}
            onSave={requestSaveGamification}
            notice={gNotice}
          />
        )}
        {section === "system" && <SystemSection />}
      </SettingsShell>

      <ConfirmDialog
        open={confirm === "visibility"}
        title="Change company call visibility?"
        confirmLabel="Change visibility"
        busy={visSaving}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void confirmed()}
      >
        <p>Company calls will be set to <strong className="text-[var(--ds-text)]">{visDraft ? visibilityLabel(visDraft) : ""}</strong>. {VISIBILITY_OPTIONS.find((o) => o.value === visDraft)?.description}</p>
        <p>This applies to your whole organisation immediately.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === "gamification"}
        title="Apply these streak and points settings?"
        confirmLabel="Apply settings"
        busy={gSaving}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void confirmed()}
      >
        {gSaved && (
          <ul className="space-y-1">
            {change("Streak threshold", gSaved.streak_threshold, String(gValidation.values?.streak_threshold ?? ""))}
            {change("Points multiplier", gSaved.xp_multiplier, String(gValidation.values?.xp_multiplier ?? ""))}
            {change("Comeback bonus", gSaved.comeback_bonus, String(gValidation.values?.comeback_bonus ?? ""))}
          </ul>
        )}
        <p><strong className="text-amber-200">Platform-wide:</strong> these values are shared by every company on this platform, not only yours, and apply immediately.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === "thresholds"}
        title="Change the review thresholds?"
        confirmLabel="Change thresholds"
        busy={tSaving}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void confirmed()}
      >
        {tSaved && (
          <ul className="space-y-1">
            {change("Low score", tSaved.low_score_threshold, String(tValidation.values?.low_score_threshold ?? ""))}
            {change("Critical score", tSaved.critical_score_threshold, String(tValidation.values?.critical_score_threshold ?? ""))}
          </ul>
        )}
        <p><strong className="text-amber-200">Platform-wide:</strong> this changes which new calls are flagged for coaching for every company on this platform, not only yours.</p>
      </ConfirmDialog>

      {leaveDialog}
    </PageShell>
  );
}

export default function AdminSettingsPage() {
  return (
    // Access is guarded by src/app/admin/layout.tsx (RoleGate, manager level).
    <Suspense fallback={null}>
      <AdminSettings />
    </Suspense>
  );
}
