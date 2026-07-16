"use client";

// Intelligence Layer — Day 227: Scorecard Studio editor MVP.
//
// The first WRITE surface for Scorecard Studio: create a scorecard, edit a
// draft version's weights and criteria in detail, fork a locked version into
// a new draft, and activate a draft behind an explicit confirmation. This is
// the customisation moat — a company tells Gravix exactly what to mark calls
// against, within the fixed four-stage frame.
//
// Boundary rules (why this file exists at all):
// - ScorecardsTab.tsx is pinned read-only by the Day 225/226 validators (list
//   + detail GETs only), so every mutating control renders from here and every
//   mutating request lives in src/lib/scorecardStudioApi.ts;
// - fixed stages only — intro/discovery/objection/close from the shared
//   readiness helper. No custom stage editor in this MVP: criteria live
//   inside the four core sales stages;
// - active/superseded versions are immutable. Editing one means forking it
//   into a new draft; the editor only ever PUTs the draft version;
// - activation is never silent: a confirmation modal first, and if the API
//   answers 409 with conflicts, a SECOND explicit confirmation before
//   replace_conflicts is sent. It is never sent automatically;
// - archive only renders for never-active (status "draft") scorecards, so a
//   live scoring path can't be archived from this MVP. It marks, never
//   deletes;
// - no AI Builder, no Autofill, no templates — nothing without an API.

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { Button } from "@/components/ui/button";
import {
  SCORECARD_STAGES,
  type ScorecardStage,
  computeReadiness,
  previewConflicts,
} from "@/lib/scorecardReadiness";
import {
  CRITERION_EMPHASIS,
  MAX_CRITERIA_PER_STAGE,
  MAX_NAME_CHARS,
  MAX_TEXT_CHARS,
  SCORECARD_CALL_TYPES,
  type CriterionEmphasis,
  type EditableCriterion,
  type EditableVersionState,
  type ScorecardConflict,
  activateScorecard,
  archiveScorecard,
  blankCriterion,
  clampWeight,
  createScorecard,
  editableFromVersion,
  forkVersion,
  saveDraftVersion,
  updateScorecardMeta,
  weightTotal,
} from "@/lib/scorecardStudioApi";

/* ------------------------------- Types ------------------------------- */
// Structural mirrors of ScorecardsTab's own types — passed straight through.

type VersionSummary = {
  id: string;
  version: number;
  status: string;
  call_types: string[];
  origin: string;
  activated_at: string | null;
};

type VersionDetail = VersionSummary & {
  stage_weights?: { stage: string; weight: number; guidance: string | null }[];
  criteria?: {
    id: string;
    stage: string;
    label: string;
    description: string | null;
    scoring_guidance: string | null;
    good_example?: string | null;
    weak_example?: string | null;
    coaching_prompt?: string | null;
    pass_fail: boolean;
    critical: boolean;
    emphasis: string;
    sort_order?: number;
  }[];
  activation_note: string | null;
};

type CardLike = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  is_company_default: boolean;
  active_version: VersionSummary | null;
};

/* ------------------------------ Labels ------------------------------- */

const STAGE_LABELS: Record<string, string> = {
  intro: "Intro",
  discovery: "Discovery",
  objection: "Objection",
  close: "Close",
};

const CALL_TYPE_LABELS: Record<string, string> = {
  outbound_cold: "Outbound cold",
  inbound_enquiry: "Inbound enquiry",
  discovery: "Discovery",
  demo: "Demo",
  objection_heavy: "Objection heavy",
  renewal_upsell: "Renewal & upsell",
};

const EMPHASIS_LABELS: Record<CriterionEmphasis, string> = {
  minor: "Minor",
  standard: "Standard",
  major: "Major",
};

const ERROR_COPY: Record<string, string> = {
  scorecard_name_taken: "That name is already used by another scorecard.",
  company_default_taken: "Another active scorecard is already the company default.",
  scorecard_archived: "This scorecard is archived and read-only.",
  version_immutable: "This version is locked — create an editable draft instead.",
  no_draft_version: "There's no draft version to activate.",
  missing_stage_weights: "Every stage needs a weight before activation.",
  weights_must_total_100: "Stage weights must total exactly 100%.",
  at_least_one_criterion_required: "Add at least one criterion before activating.",
  call_type_or_company_default_required:
    "Choose at least one call type, or make this the company default.",
  critical_requires_pass_fail: "Critical criteria must also be pass / fail.",
  name_required: "Give the scorecard a name.",
  network_error: "Couldn't reach Gravix — check your connection and try again.",
};

function errorCopy(code: string): string {
  return ERROR_COPY[code] ?? "Something went wrong — your scorecard wasn't changed.";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeName(name: string | null | undefined): string {
  const s = String(name ?? "").trim();
  if (!s || UUID_RE.test(s)) return "Untitled scorecard";
  return s;
}

const INPUT_CLASS =
  "w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-brand-500/50 focus:outline-none";

/* ------------------------------- Modal ------------------------------- */

function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          "relative w-full rounded-xl border border-neutral-800 bg-neutral-950 shadow-xl shadow-black/50",
          wide ? "max-w-2xl" : "max-w-lg"
        )}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3.5">
          <span className="text-sm font-semibold text-white">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-500 transition-colors hover:text-neutral-300"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function Notice({ tone, text }: { tone: "ok" | "err"; text: string }) {
  return (
    <p className={tone === "ok" ? "text-xs text-brand-300" : "text-xs text-danger-300"}>{text}</p>
  );
}

/* --------------------------- New scorecard --------------------------- */

export function NewScorecardPanel({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setError(null);
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(errorCopy("name_required"));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await createScorecard({
      name: trimmed.slice(0, MAX_NAME_CHARS),
      description: description.trim() || undefined,
      is_company_default: isDefault,
    });
    setBusy(false);
    if (!res.ok) {
      setError(errorCopy(res.error));
      return;
    }
    setOpen(false);
    setName("");
    setDescription("");
    setIsDefault(false);
    onCreated(res.scorecard.id);
  };

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        New scorecard
      </Button>
      {open && (
        <Modal title="New scorecard" onClose={close}>
          <p className="text-xs text-neutral-500">
            Scorecards teach Gravix what good calls look like. A new scorecard
            starts as a draft with evenly weighted stages — draft changes do not
            affect scoring until activated.
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="new-scorecard-name" className="block text-xs font-medium text-neutral-300">
                Name
              </label>
              <input
                id="new-scorecard-name"
                value={name}
                maxLength={MAX_NAME_CHARS}
                onChange={(e) => setName(e.target.value)}
                className={clsx(INPUT_CLASS, "mt-1.5")}
                placeholder="e.g. Enterprise discovery scorecard"
              />
            </div>
            <div>
              <label htmlFor="new-scorecard-desc" className="block text-xs font-medium text-neutral-300">
                Description <span className="font-normal text-neutral-600">(optional)</span>
              </label>
              <textarea
                id="new-scorecard-desc"
                rows={2}
                maxLength={MAX_TEXT_CHARS}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={clsx(INPUT_CLASS, "mt-1.5 resize-y")}
                placeholder="What this scorecard is for, in your team's words"
              />
            </div>
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 accent-brand-500"
              />
              <span>
                <span className="block text-xs text-neutral-300">Company default</span>
                <span className="block text-[11px] text-neutral-600">
                  Once activated, applies to every call type that has no more
                  specific scorecard.
                </span>
              </span>
            </label>
            {error && <Notice tone="err" text={error} />}
            <div className="flex items-center justify-end gap-2 border-t border-neutral-900 pt-3">
              <Button variant="ghost" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void submit()} disabled={busy}>
                {busy ? "Creating…" : "Create scorecard"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ---------------------------- Workbench ------------------------------ */
// Decides which write surface a scorecard gets: a draft version opens the
// full editor; a locked (active/superseded) version offers "Create editable
// draft"; archived scorecards get nothing — they are read-only history.

export function ScorecardWorkbench({
  card,
  versions,
  siblings,
  onChanged,
}: {
  card: CardLike;
  versions: VersionDetail[];
  siblings: CardLike[];
  onChanged: () => void;
}) {
  const [forkBusy, setForkBusy] = useState(false);
  const [forkNotice, setForkNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  if (card.status === "archived") return null;

  const draft = versions.find((v) => v.status === "draft") ?? null;
  if (draft) {
    return (
      <DraftEditor key={draft.id} card={card} draft={draft} siblings={siblings} onChanged={onChanged} />
    );
  }

  const locked = versions.find((v) => v.status === "active") ?? versions[0] ?? null;
  if (!locked) return null;

  const fork = async () => {
    setForkBusy(true);
    setForkNotice(null);
    const res = await forkVersion(card.id, locked.id);
    setForkBusy(false);
    if (!res.ok) {
      if (res.error === "draft_already_exists") {
        // The API refuses to silently hand back an existing draft (it may
        // hold unrelated edits) — surface it and refresh so it opens here.
        setForkNotice({
          tone: "ok",
          text: "This scorecard already has a draft — opening it.",
        });
        onChanged();
        return;
      }
      setForkNotice({ tone: "err", text: errorCopy(res.error) });
      return;
    }
    setForkNotice({ tone: "ok", text: `Draft version created from version ${locked.version}.` });
    onChanged();
  };

  return (
    <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-neutral-300">
            Version {locked.version} is locked
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            Activated versions are locked so old call reviews stay explainable.
            To make changes, create an editable draft — it copies this
            version&apos;s weights and criteria and changes nothing until you
            activate it.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void fork()} disabled={forkBusy}>
          {forkBusy ? "Creating…" : "Create editable draft"}
        </Button>
      </div>
      {forkNotice && (
        <div className="mt-2">
          <Notice tone={forkNotice.tone} text={forkNotice.text} />
        </div>
      )}
    </div>
  );
}

/* --------------------------- Draft editor ---------------------------- */

function DraftEditor({
  card,
  draft,
  siblings,
  onChanged,
}: {
  card: CardLike;
  draft: VersionDetail;
  siblings: CardLike[];
  onChanged: () => void;
}) {
  const [name, setName] = useState(card.name);
  const [description, setDescription] = useState(card.description ?? "");
  const [isDefault, setIsDefault] = useState(card.is_company_default);
  const [savedMeta, setSavedMeta] = useState({
    name: card.name,
    description: card.description ?? "",
    isDefault: card.is_company_default,
  });

  const [state, setState] = useState<EditableVersionState>(() => editableFromVersion(draft));
  const [savedVersionJson, setSavedVersionJson] = useState(() =>
    JSON.stringify(editableSnapshot(editableFromVersion(draft)))
  );

  const [stage, setStage] = useState<ScorecardStage>("intro");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [showActivate, setShowActivate] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  const metaDirty =
    name !== savedMeta.name ||
    description !== savedMeta.description ||
    isDefault !== savedMeta.isDefault;
  const versionDirty = JSON.stringify(editableSnapshot(state)) !== savedVersionJson;
  const dirty = metaDirty || versionDirty;

  const total = weightTotal(state);
  const criteriaCount = SCORECARD_STAGES.reduce(
    (sum, s) => sum + state.stages[s].criteria.length,
    0
  );

  const readiness = useMemo(
    () =>
      computeReadiness({
        weights: SCORECARD_STAGES.map((s) => ({
          stage: s,
          weight: clampWeight(state.stages[s].weight),
        })),
        criteriaCount,
        callTypes: state.call_types,
        isCompanyDefault: isDefault,
      }),
    [state, criteriaCount, isDefault]
  );

  const conflicts = useMemo(
    () =>
      previewConflicts(
        { scorecardId: card.id, isCompanyDefault: isDefault, callTypes: state.call_types },
        siblings.map((s) => ({
          scorecardId: s.id,
          scorecardName: safeName(s.name),
          isCompanyDefault: s.is_company_default,
          status: s.status,
          activeVersion: s.active_version
            ? {
                version: s.active_version.version,
                call_types: s.active_version.call_types ?? [],
              }
            : null,
        }))
      ),
    [card.id, isDefault, state.call_types, siblings]
  );

  const setStageState = (
    target: ScorecardStage,
    patch: Partial<EditableVersionState["stages"][ScorecardStage]>
  ) => {
    setState((prev) => ({
      ...prev,
      stages: { ...prev.stages, [target]: { ...prev.stages[target], ...patch } },
    }));
  };

  const updateCriterion = (
    target: ScorecardStage,
    key: string,
    patch: Partial<EditableCriterion>
  ) => {
    // The API rejects critical without pass/fail — turning pass/fail off
    // always clears critical so a save can't be produced that would fail.
    const fixed = patch.pass_fail === false ? { ...patch, critical: false } : patch;
    setStageState(target, {
      criteria: state.stages[target].criteria.map((c) =>
        c.key === key ? { ...c, ...fixed } : c
      ),
    });
  };

  const moveCriterion = (target: ScorecardStage, key: string, dir: -1 | 1) => {
    const list = [...state.stages[target].criteria];
    const idx = list.findIndex((c) => c.key === key);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= list.length) return;
    [list[idx], list[swap]] = [list[swap], list[idx]];
    setStageState(target, { criteria: list });
  };

  const removeCriterion = (target: ScorecardStage, key: string) => {
    setStageState(target, {
      criteria: state.stages[target].criteria.filter((c) => c.key !== key),
    });
    if (expandedKey === key) setExpandedKey(null);
  };

  const addCriterion = (target: ScorecardStage) => {
    if (state.stages[target].criteria.length >= MAX_CRITERIA_PER_STAGE) return;
    const fresh = blankCriterion();
    setStageState(target, { criteria: [...state.stages[target].criteria, fresh] });
    setExpandedKey(fresh.key);
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNotice({ tone: "err", text: errorCopy("name_required") });
      return;
    }
    for (const s of SCORECARD_STAGES) {
      if (state.stages[s].criteria.some((c) => !c.label.trim())) {
        setStage(s);
        setNotice({
          tone: "err",
          text: `Every criterion needs a label — check the ${STAGE_LABELS[s]} stage.`,
        });
        return;
      }
    }

    setSaving(true);
    setNotice(null);

    if (metaDirty) {
      const metaRes = await updateScorecardMeta(card.id, {
        name: trimmedName.slice(0, MAX_NAME_CHARS),
        description: description.trim() || null,
        is_company_default: isDefault,
      });
      if (!metaRes.ok) {
        setSaving(false);
        setNotice({ tone: "err", text: errorCopy(metaRes.error) });
        return;
      }
      setSavedMeta({ name: trimmedName, description, isDefault });
    }

    if (versionDirty) {
      const verRes = await saveDraftVersion(card.id, draft.id, state);
      if (!verRes.ok) {
        setSaving(false);
        const detail = verRes.errors?.[0];
        setNotice({ tone: "err", text: errorCopy(detail?.error ?? verRes.error) });
        return;
      }
      setSavedVersionJson(JSON.stringify(editableSnapshot(state)));
    }

    setSaving(false);
    setNotice({
      tone: "ok",
      text: "Draft saved. Scoring is unchanged until you activate this version.",
    });
    onChanged();
  };

  const blockedReasons: string[] = [];
  if (dirty) blockedReasons.push("Save your draft first");
  for (const check of readiness.checks) {
    if (!check.ok) blockedReasons.push(check.label);
  }

  const stageState = state.stages[stage];

  return (
    <div className="mt-4 rounded-lg border border-brand-500/25 bg-neutral-950">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-500/10 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.14em] text-brand-300">
            Scorecard Studio
          </span>
          <span className="text-xs font-medium text-neutral-200">
            Editing draft — version {draft.version}
          </span>
          {dirty ? (
            <span className="inline-flex items-center rounded-full border border-warning-500/30 bg-warning-500/10 px-2 py-0.5 text-[10px] text-warning-300">
              Unsaved changes
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-400">
              Saved
            </span>
          )}
        </div>
        <span className="text-[11px] text-neutral-600">
          This is what Gravix will mark calls against once activated.
        </span>
      </div>

      <div className="space-y-5 px-4 py-4">
        {/* METADATA */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`sc-name-${card.id}`} className="block text-xs font-medium text-neutral-300">
              Name
            </label>
            <input
              id={`sc-name-${card.id}`}
              value={name}
              maxLength={MAX_NAME_CHARS}
              onChange={(e) => setName(e.target.value)}
              className={clsx(INPUT_CLASS, "mt-1.5")}
            />
          </div>
          <div>
            <label htmlFor={`sc-desc-${card.id}`} className="block text-xs font-medium text-neutral-300">
              Description
            </label>
            <textarea
              id={`sc-desc-${card.id}`}
              rows={1}
              maxLength={MAX_TEXT_CHARS}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={clsx(INPUT_CLASS, "mt-1.5 resize-y")}
              placeholder="What this scorecard is for"
            />
          </div>
        </div>

        {/* APPLIES TO */}
        <div>
          <span className="block text-xs font-medium text-neutral-300">Applies to</span>
          <p className="mt-0.5 text-[11px] text-neutral-600">
            Pick the call types this scorecard should mark, or make it the
            company default for everything else.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {SCORECARD_CALL_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={state.call_types.includes(t)}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      call_types: e.target.checked
                        ? [...prev.call_types, t]
                        : prev.call_types.filter((x) => x !== t),
                    }))
                  }
                  className="h-3.5 w-3.5 accent-brand-500"
                />
                <span className="text-xs text-neutral-400">{CALL_TYPE_LABELS[t]}</span>
              </label>
            ))}
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="h-3.5 w-3.5 accent-brand-500"
              />
              <span className="text-xs text-neutral-300">Company default</span>
            </label>
          </div>
        </div>

        {/* STAGE RAIL — the fixed four-stage frame. Custom sections are not
            available in this MVP; criteria live inside the four core sales
            stages. */}
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">
              Stages
            </span>
            <span
              className={clsx(
                "text-[11px] tabular-nums",
                total === 100 ? "text-neutral-500" : "text-warning-300"
              )}
            >
              Weights total {total}%
              {total !== 100 && " — must be 100% to activate (saving is fine)"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SCORECARD_STAGES.map((s) => {
              const selected = s === stage;
              const st = state.stages[s];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStage(s)}
                  aria-pressed={selected}
                  className={clsx(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    selected
                      ? "border-brand-500/40 bg-brand-500/10"
                      : "border-neutral-800 hover:border-neutral-700"
                  )}
                >
                  <span
                    className={clsx(
                      "block text-xs font-medium",
                      selected ? "text-brand-200" : "text-neutral-300"
                    )}
                  >
                    {STAGE_LABELS[s]}
                  </span>
                  <span className="mt-0.5 block text-[11px] tabular-nums text-neutral-500">
                    {clampWeight(st.weight)}% · {st.criteria.length} criteri
                    {st.criteria.length === 1 ? "on" : "a"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* SELECTED STAGE */}
        <div className="rounded-lg border border-neutral-800/70 px-3.5 py-3">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label
                htmlFor={`sc-weight-${card.id}-${stage}`}
                className="block text-xs font-medium text-neutral-300"
              >
                {STAGE_LABELS[stage]} weight
              </label>
              <div className="mt-1.5 flex items-center gap-1.5">
                <input
                  id={`sc-weight-${card.id}-${stage}`}
                  type="number"
                  min={0}
                  max={100}
                  value={stageState.weight}
                  onChange={(e) =>
                    setStageState(stage, { weight: clampWeight(e.target.value) })
                  }
                  className={clsx(INPUT_CLASS, "w-24 tabular-nums")}
                />
                <span className="text-xs text-neutral-500">%</span>
              </div>
            </div>
            <div className="min-w-[200px] flex-1">
              <label
                htmlFor={`sc-guidance-${card.id}-${stage}`}
                className="block text-xs font-medium text-neutral-300"
              >
                Stage guidance{" "}
                <span className="font-normal text-neutral-600">(optional)</span>
              </label>
              <textarea
                id={`sc-guidance-${card.id}-${stage}`}
                rows={1}
                maxLength={MAX_TEXT_CHARS}
                value={stageState.guidance}
                onChange={(e) => setStageState(stage, { guidance: e.target.value })}
                className={clsx(INPUT_CLASS, "mt-1.5 resize-y")}
                placeholder={`How should Gravix judge the ${STAGE_LABELS[stage].toLowerCase()} stage overall?`}
              />
            </div>
          </div>

          {/* CRITERIA */}
          <div className="mt-4">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">
                {STAGE_LABELS[stage]} criteria
              </span>
              <span className="text-[10px] tabular-nums text-neutral-600">
                {stageState.criteria.length}/{MAX_CRITERIA_PER_STAGE}
              </span>
            </div>

            {stageState.criteria.length === 0 && (
              <p className="mb-2 text-[11px] text-neutral-600">
                No criteria in this stage yet. Criteria are the detail — what a
                rep must actually do here for Gravix to mark the stage well.
              </p>
            )}

            <div className="space-y-2">
              {stageState.criteria.map((c, idx) => (
                <CriterionRow
                  key={c.key}
                  criterion={c}
                  index={idx}
                  count={stageState.criteria.length}
                  expanded={expandedKey === c.key}
                  onToggle={() => setExpandedKey(expandedKey === c.key ? null : c.key)}
                  onChange={(patch) => updateCriterion(stage, c.key, patch)}
                  onMove={(dir) => moveCriterion(stage, c.key, dir)}
                  onRemove={() => removeCriterion(stage, c.key)}
                  idPrefix={`sc-${card.id}-${stage}-${idx}`}
                />
              ))}
            </div>

            <div className="mt-2.5">
              <Button
                variant="ghost"
                onClick={() => addCriterion(stage)}
                disabled={stageState.criteria.length >= MAX_CRITERIA_PER_STAGE}
                title={
                  stageState.criteria.length >= MAX_CRITERIA_PER_STAGE
                    ? `Stage limit reached (${MAX_CRITERIA_PER_STAGE})`
                    : undefined
                }
              >
                Add criterion
              </Button>
            </div>
          </div>
        </div>

        {/* SAVE + ACTIVATE */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-3">
          {notice && (
            <div className="mb-2.5">
              <Notice tone={notice.tone} text={notice.text} />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-[11px] text-neutral-500">
              {dirty
                ? "Draft changes do not affect scoring until activated — save whenever you like, even with unfinished weights."
                : "Activation applies this version to future calls only. Calls already scored keep their scores, and activated versions are locked so old call reviews stay explainable."}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => void save()} disabled={saving || !dirty}>
                {saving ? "Saving…" : "Save draft"}
              </Button>
              <Button
                variant="primary"
                onClick={() => setShowActivate(true)}
                disabled={saving || dirty || !readiness.ready}
                title={blockedReasons.length ? blockedReasons.join(" · ") : undefined}
              >
                Activate version {draft.version}…
              </Button>
            </div>
          </div>
          {blockedReasons.length > 0 && (
            <p className="mt-2 text-[11px] text-neutral-600">
              Activation blocked: {blockedReasons.join(" · ")}
            </p>
          )}
          {card.status === "draft" && (
            <div className="mt-3 border-t border-neutral-900 pt-2.5 text-right">
              <button
                type="button"
                onClick={() => setShowArchive(true)}
                className="text-[11px] text-neutral-600 underline-offset-2 transition-colors hover:text-danger-300 hover:underline"
              >
                Archive scorecard
              </button>
            </div>
          )}
        </div>
      </div>

      {showActivate && (
        <ActivateModal
          card={card}
          draft={draft}
          scorecardName={safeName(name)}
          readinessReady={readiness.ready}
          criteriaCount={criteriaCount}
          callTypes={state.call_types}
          isDefault={isDefault}
          previewedConflicts={conflicts}
          siblings={siblings}
          onClose={() => setShowActivate(false)}
          onActivated={(replacedCount) => {
            setShowActivate(false);
            setNotice({
              tone: "ok",
              text:
                replacedCount > 0
                  ? `Version ${draft.version} activated — ${replacedCount} other scorecard${replacedCount === 1 ? "" : "s"} superseded. New calls are scored against it.`
                  : `Version ${draft.version} activated — new calls are scored against it.`,
            });
            onChanged();
          }}
        />
      )}

      {showArchive && (
        <ArchiveModal
          card={card}
          scorecardName={safeName(name)}
          onClose={() => setShowArchive(false)}
          onArchived={() => {
            setShowArchive(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

/** Comparable snapshot of editor state, ignoring local-only list keys. */
function editableSnapshot(state: EditableVersionState) {
  return {
    call_types: [...state.call_types].sort(),
    stages: SCORECARD_STAGES.map((s) => {
      const st = state.stages[s];
      return {
        stage: s,
        weight: clampWeight(st.weight),
        guidance: st.guidance,
        criteria: st.criteria.map(({ key: _key, ...rest }) => rest),
      };
    }),
  };
}

/* --------------------------- Criterion row --------------------------- */

function CriterionRow({
  criterion,
  index,
  count,
  expanded,
  onToggle,
  onChange,
  onMove,
  onRemove,
  idPrefix,
}: {
  criterion: EditableCriterion;
  index: number;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<EditableCriterion>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  idPrefix: string;
}) {
  const c = criterion;
  return (
    <div className="rounded-lg border border-neutral-800">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 flex-wrap items-baseline gap-1.5 text-left"
        >
          {c.label.trim() ? (
            <span className="truncate text-xs text-neutral-200">{c.label}</span>
          ) : (
            <span className="text-xs italic text-neutral-500">New criterion — add a label</span>
          )}
          {c.emphasis !== "standard" && (
            <span className="rounded border border-neutral-800 px-1 text-[10px] text-neutral-500">
              {EMPHASIS_LABELS[c.emphasis]}
            </span>
          )}
          {c.critical && (
            <span className="rounded border border-warning-500/30 bg-warning-500/10 px-1 text-[10px] text-warning-300">
              Critical
            </span>
          )}
          {c.pass_fail && (
            <span className="rounded border border-neutral-800 px-1 text-[10px] text-neutral-500">
              Pass / fail
            </span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Move up"
            className="rounded px-1 text-xs text-neutral-600 transition-colors hover:text-neutral-300 disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            aria-label="Move down"
            className="rounded px-1 text-xs text-neutral-600 transition-colors hover:text-neutral-300 disabled:opacity-30"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="rounded px-1.5 text-[11px] text-neutral-500 transition-colors hover:text-neutral-300"
          >
            {expanded ? "Done" : "Edit"}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded px-1.5 text-[11px] text-neutral-600 transition-colors hover:text-danger-300"
          >
            Remove
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-neutral-900 px-3 py-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <div>
              <label htmlFor={`${idPrefix}-label`} className="block text-[11px] font-medium text-neutral-400">
                Label
              </label>
              <input
                id={`${idPrefix}-label`}
                value={c.label}
                maxLength={MAX_NAME_CHARS}
                onChange={(e) => onChange({ label: e.target.value })}
                className={clsx(INPUT_CLASS, "mt-1")}
                placeholder="e.g. Quantifies the cost of doing nothing"
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-emphasis`} className="block text-[11px] font-medium text-neutral-400">
                Emphasis
              </label>
              <select
                id={`${idPrefix}-emphasis`}
                value={c.emphasis}
                onChange={(e) => onChange({ emphasis: e.target.value as CriterionEmphasis })}
                className={clsx(INPUT_CLASS, "mt-1")}
              >
                {CRITERION_EMPHASIS.map((e) => (
                  <option key={e} value={e}>
                    {EMPHASIS_LABELS[e]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <TextField
            id={`${idPrefix}-description`}
            label="Description"
            hint="What this criterion means in your team's words."
            value={c.description}
            onChange={(v) => onChange({ description: v })}
          />
          <TextField
            id={`${idPrefix}-scoring`}
            label="Scoring guidance"
            hint="How Gravix should judge it — what earns full marks, what loses them."
            value={c.scoring_guidance}
            onChange={(v) => onChange({ scoring_guidance: v })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              id={`${idPrefix}-good`}
              label="Good example"
              hint="A line that would pass."
              value={c.good_example}
              onChange={(v) => onChange({ good_example: v })}
            />
            <TextField
              id={`${idPrefix}-weak`}
              label="Weak example"
              hint="A line that would fall short."
              value={c.weak_example}
              onChange={(v) => onChange({ weak_example: v })}
            />
          </div>
          <TextField
            id={`${idPrefix}-coaching`}
            label="Coaching prompt"
            hint="What the rep should hear when they miss this."
            value={c.coaching_prompt}
            onChange={(v) => onChange({ coaching_prompt: v })}
          />

          <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-neutral-900 pt-2.5">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={c.pass_fail}
                onChange={(e) => onChange({ pass_fail: e.target.checked })}
                className="mt-0.5 h-3.5 w-3.5 accent-brand-500"
              />
              <span>
                <span className="block text-xs text-neutral-300">Pass / fail</span>
                <span className="block text-[11px] text-neutral-600">
                  Judged met or missed, rather than scored on a scale.
                </span>
              </span>
            </label>
            <label
              className={clsx("flex items-start gap-2", !c.pass_fail && "opacity-50")}
              title={!c.pass_fail ? "Critical criteria must be pass / fail" : undefined}
            >
              <input
                type="checkbox"
                checked={c.critical}
                disabled={!c.pass_fail}
                onChange={(e) => onChange({ critical: e.target.checked })}
                className="mt-0.5 h-3.5 w-3.5 accent-brand-500"
              />
              <span>
                <span className="block text-xs text-neutral-300">Critical</span>
                <span className="block text-[11px] text-neutral-600">
                  Missing this seriously hurts the stage — reserve it for
                  non-negotiables.
                </span>
              </span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function TextField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] font-medium text-neutral-400">
        {label} <span className="font-normal text-neutral-600">(optional)</span>
      </label>
      <p className="mt-0.5 text-[11px] text-neutral-600">{hint}</p>
      <textarea
        id={id}
        rows={2}
        maxLength={MAX_TEXT_CHARS}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(INPUT_CLASS, "mt-1 resize-y")}
      />
    </div>
  );
}

/* --------------------------- Activate modal -------------------------- */
// Two explicit gates, mirroring the API's own design:
//   1. the manager confirms activation (nothing has been sent before this);
//   2. if the API answers 409 with conflicts, the conflicts are listed and a
//      second, separate confirmation arms replace_conflicts. The flag is
//      never sent on the first attempt and never sent unarmed.

function ActivateModal({
  card,
  draft,
  scorecardName,
  readinessReady,
  criteriaCount,
  callTypes,
  isDefault,
  previewedConflicts,
  siblings,
  onClose,
  onActivated,
}: {
  card: CardLike;
  draft: VersionDetail;
  scorecardName: string;
  readinessReady: boolean;
  criteriaCount: number;
  callTypes: string[];
  isDefault: boolean;
  previewedConflicts: { scorecardName: string; version: number }[];
  siblings: CardLike[];
  onClose: () => void;
  onActivated: (replacedCount: number) => void;
}) {
  const [phase, setPhase] = useState<"confirm" | "conflicts">("confirm");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ScorecardConflict[]>([]);
  const [replaceArmed, setReplaceArmed] = useState(false);

  const nameFor = (scorecardId: string) => {
    const match = siblings.find((s) => s.id === scorecardId);
    if (!match) return "Another scorecard";
    return safeName(match.name);
  };

  const activate = async () => {
    setBusy(true);
    setError(null);
    // First attempt: no replace_conflicts, ever. Conflicts come back as 409.
    const res = await activateScorecard(card.id, { activation_note: note });
    setBusy(false);
    if (res.ok) {
      onActivated(res.replaced?.length ?? 0);
      return;
    }
    if (res.status === 409 && res.conflicts?.length) {
      setConflicts(res.conflicts);
      setReplaceArmed(false);
      setPhase("conflicts");
      return;
    }
    setError(errorCopy(res.errors?.[0]?.error ?? res.error));
  };

  const confirmReplace = async () => {
    if (!replaceArmed) return;
    setBusy(true);
    setError(null);
    const res = await activateScorecard(card.id, {
      activation_note: note,
      replace_conflicts: true,
    });
    setBusy(false);
    if (res.ok) {
      onActivated(res.replaced?.length ?? conflicts.length);
      return;
    }
    setError(errorCopy(res.errors?.[0]?.error ?? res.error));
  };

  return (
    <Modal
      title={phase === "confirm" ? `Activate ${scorecardName}?` : "Replace active scorecards?"}
      onClose={onClose}
      wide
    >
      {phase === "confirm" ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-3">
            <p className="text-xs font-medium text-neutral-200">
              {scorecardName} — version {draft.version}
            </p>
            <ul className="mt-2 space-y-1 text-[11px] text-neutral-500">
              <li>
                Applies to:{" "}
                {isDefault
                  ? callTypes.length
                    ? `company default + ${callTypes.map((t) => CALL_TYPE_LABELS[t] ?? t).join(", ")}`
                    : "every call type (company default)"
                  : callTypes.map((t) => CALL_TYPE_LABELS[t] ?? t).join(", ") || "—"}
              </li>
              <li>{criteriaCount} criteria across the four stages</li>
              <li>{readinessReady ? "Meets every activation requirement" : "Not ready"}</li>
            </ul>
          </div>

          <p className="text-xs text-neutral-400">
            Activation affects <span className="text-neutral-200">future scoring only</span> —
            calls already scored keep their scores. This version becomes locked
            once active, so old call reviews stay explainable; further changes
            mean a new draft.
          </p>

          {previewedConflicts.length > 0 && (
            <p className="rounded-lg border border-warning-500/25 bg-warning-500/5 px-3 py-2 text-[11px] text-warning-300">
              Heads-up: this looks like it overlaps{" "}
              {previewedConflicts.map((c) => `${c.scorecardName} v${c.version}`).join(", ")}.
              Gravix will list any real clashes and ask you again before
              anything is replaced.
            </p>
          )}

          <div>
            <label htmlFor="activation-note" className="block text-xs font-medium text-neutral-300">
              Activation note <span className="font-normal text-neutral-600">(optional)</span>
            </label>
            <p className="mt-0.5 text-[11px] text-neutral-600">
              Why this version — shown in the version history.
            </p>
            <textarea
              id="activation-note"
              rows={2}
              maxLength={MAX_TEXT_CHARS}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={clsx(INPUT_CLASS, "mt-1.5 resize-y")}
            />
          </div>

          {error && <Notice tone="err" text={error} />}

          <div className="flex items-center justify-end gap-2 border-t border-neutral-900 pt-3">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void activate()} disabled={busy}>
              {busy ? "Activating…" : `Activate version ${draft.version}`}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-neutral-400">
            These scorecards are actively scoring calls that{" "}
            <span className="text-neutral-200">{scorecardName}</span> would take
            over. Nothing has been replaced yet.
          </p>

          <ul className="space-y-2">
            {conflicts.map((c) => (
              <li
                key={c.version_id}
                className="rounded-lg border border-warning-500/25 bg-warning-500/5 px-3 py-2"
              >
                <span className="text-xs text-neutral-200">
                  {nameFor(c.scorecard_id)} — version {c.version}
                </span>
                <span className="mt-0.5 block text-[11px] text-neutral-500">
                  {c.reason === "call_type"
                    ? `Currently scores: ${c.call_types.map((t) => CALL_TYPE_LABELS[t] ?? t).join(", ")}`
                    : "Currently the active company default"}
                </span>
              </li>
            ))}
          </ul>

          <p className="text-[11px] text-neutral-500">
            Replacing supersedes their active versions — history is kept,
            nothing is deleted, and calls they already scored keep their
            scores. Their scorecards drop back to draft.
          </p>

          <label className="flex items-start gap-2.5 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5">
            <input
              type="checkbox"
              checked={replaceArmed}
              onChange={(e) => setReplaceArmed(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-brand-500"
            />
            <span className="text-xs text-neutral-300">
              Replace {conflicts.length === 1 ? "this scorecard" : `these ${conflicts.length} scorecards`}{" "}
              and make {scorecardName} the one Gravix uses.
            </span>
          </label>

          {error && <Notice tone="err" text={error} />}

          <div className="flex items-center justify-end gap-2 border-t border-neutral-900 pt-3">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel — keep things as they are
            </Button>
            <Button
              variant="danger"
              onClick={() => void confirmReplace()}
              disabled={busy || !replaceArmed}
              title={!replaceArmed ? "Tick the confirmation first" : undefined}
            >
              {busy ? "Replacing…" : "Replace and activate"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------------------------- Archive modal -------------------------- */
// Only reachable for scorecards whose card status is "draft" (never
// activated, or dropped back to draft) — archiving one cannot change how any
// call is scored. Active scorecards cannot be archived from this MVP.

function ArchiveModal({
  card,
  scorecardName,
  onClose,
  onArchived,
}: {
  card: CardLike;
  scorecardName: string;
  onClose: () => void;
  onArchived: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const archive = async () => {
    setBusy(true);
    setError(null);
    const res = await archiveScorecard(card.id);
    setBusy(false);
    if (!res.ok) {
      setError(errorCopy(res.error));
      return;
    }
    onArchived();
  };

  return (
    <Modal title={`Archive ${scorecardName}?`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-neutral-400">
          Archiving removes this scorecard from the live picture. Nothing is
          deleted — every version and its history survive — and scoring doesn&apos;t
          change, because this scorecard isn&apos;t active.
        </p>
        <p className="text-[11px] text-neutral-600">
          There&apos;s no un-archive in this release, so bringing it back would need
          a new scorecard.
        </p>
        {error && <Notice tone="err" text={error} />}
        <div className="flex items-center justify-end gap-2 border-t border-neutral-900 pt-3">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void archive()} disabled={busy}>
            {busy ? "Archiving…" : "Archive scorecard"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
