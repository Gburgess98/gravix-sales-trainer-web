"use client";

// Intelligence Layer — Day 250: Objection Library (manager MVP).
//
// The third Intelligence pillar after Context (how you sell) and Scorecards
// (what good calls look like): approved guidance for how reps should handle
// buyer pushback. Backed by the Day 236 API (manager-gated, company-scoped),
// all requests via src/lib/objectionLibraryApi.ts → proxyFetch.
//
// Lifecycle: draft → approved → archived.
//   - drafts are editable here; approval is the completeness gate
//   - approved items are immutable (locked, read-only) — no fork/revision today
//   - archived items are read-only history; nothing is ever hard-deleted
//
// Explicitly NOT here (no API behind them, so nothing is drawn): AI Builder,
// AI autofill, suggestion mining, Whisperer/scoring runtime hooks. Manual
// evidence creation is deferred too — evidence is shown read-only.

import { useCallback, useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import {
  OBJECTION_CATEGORIES,
  categoryLabel,
  objectionStatusLabel,
  objectionLabel,
  computeObjectionReadiness,
  buildObjectionAssignmentPrefill,
  linesToList,
  listToLines,
  listObjections,
  getObjection,
  createObjection,
  updateObjection,
  approveObjection,
  archiveObjection,
  type ObjectionItem,
  type ObjectionEvidence,
  type ObjectionPatch,
} from "@/lib/objectionLibraryApi";
import {
  listTeamUsers,
  assignCoachingFromObjection,
  type UploadRepOption,
} from "@/lib/api";

type LoadError = "forbidden" | "not_migrated" | "failed";

const INPUT_CLASS =
  "w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-brand-500/50 focus:outline-none";

const MAX_LABEL = 200;
const MAX_TEXT = 4000;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/* ------------------------------ Status pill ----------------------------- */
// Status-only colour (Day 203 rule): approved reads as settled (success),
// draft as in-progress (neutral), archived as muted history.
const STATUS_PILL: Record<string, string> = {
  approved: "border-success-500/30 bg-success-500/10 text-success-300",
  draft: "border-neutral-700 bg-neutral-800/60 text-neutral-300",
  archived: "border-neutral-800 bg-neutral-900/60 text-neutral-500",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]",
        STATUS_PILL[status] ?? STATUS_PILL.draft
      )}
    >
      {objectionStatusLabel(status)}
    </span>
  );
}

/* -------------------------------- Modal --------------------------------- */

function Modal({
  title,
  onClose,
  children,
  wide,
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

function Field({
  label,
  optional,
  hint,
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-300">
        {label} {optional && <span className="font-normal text-neutral-600">(optional)</span>}
      </label>
      {hint && <p className="mt-0.5 text-[11px] text-neutral-600">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/* ---------------------------- Editable form ----------------------------- */
// Shared shape for the create modal and the draft workbench.

type FormState = {
  label: string;
  category: string;
  buyer_phrases: string; // one per line
  why_it_matters: string;
  approved_response: string;
  weak_response_patterns: string; // one per line
  no_go_language: string; // one per line
  coaching_note: string;
};

function blankForm(): FormState {
  return {
    label: "",
    category: "other",
    buyer_phrases: "",
    why_it_matters: "",
    approved_response: "",
    weak_response_patterns: "",
    no_go_language: "",
    coaching_note: "",
  };
}

function formFromItem(item: ObjectionItem): FormState {
  return {
    label: item.label ?? "",
    category: item.category ?? "other",
    buyer_phrases: listToLines(item.buyer_phrases),
    why_it_matters: item.why_it_matters ?? "",
    approved_response: item.approved_response ?? "",
    weak_response_patterns: listToLines(item.weak_response_patterns),
    no_go_language: listToLines(item.no_go_language),
    coaching_note: item.coaching_note ?? "",
  };
}

function patchFromForm(form: FormState): ObjectionPatch {
  return {
    label: form.label.trim().slice(0, MAX_LABEL),
    category: form.category,
    buyer_phrases: linesToList(form.buyer_phrases),
    why_it_matters: form.why_it_matters.trim() ? form.why_it_matters.trim().slice(0, MAX_TEXT) : null,
    approved_response: form.approved_response.trim() ? form.approved_response.trim().slice(0, MAX_TEXT) : null,
    weak_response_patterns: linesToList(form.weak_response_patterns),
    no_go_language: linesToList(form.no_go_language),
    coaching_note: form.coaching_note.trim() ? form.coaching_note.trim().slice(0, MAX_TEXT) : null,
  };
}

// Readiness reads the LIVE form, so the manager sees what approval still needs
// as they type — the same five requirements the API enforces.
function formReadiness(form: FormState) {
  return computeObjectionReadiness({
    label: form.label,
    category: form.category,
    buyer_phrases: linesToList(form.buyer_phrases),
    approved_response: form.approved_response,
    coaching_note: form.coaching_note,
    why_it_matters: form.why_it_matters,
  });
}

function FormFields({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch });
  return (
    <div className="space-y-4">
      <Field label="Label" hint="A short name for this objection, e.g. “Too expensive vs PureGym”.">
        <input
          className={INPUT_CLASS}
          maxLength={MAX_LABEL}
          value={form.label}
          onChange={(e) => set({ label: e.target.value })}
          placeholder="Name this objection"
        />
      </Field>
      <Field label="Category">
        <select
          className={INPUT_CLASS}
          value={form.category}
          onChange={(e) => set({ category: e.target.value })}
        >
          {OBJECTION_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Buyer phrases" hint="What the buyer actually says. One per line.">
        <textarea
          className={clsx(INPUT_CLASS, "resize-y")}
          rows={3}
          value={form.buyer_phrases}
          onChange={(e) => set({ buyer_phrases: e.target.value })}
          placeholder={"It's too expensive\nI can get this cheaper elsewhere"}
        />
      </Field>
      <Field label="Approved response" hint="How the team should handle it — the guidance reps follow.">
        <textarea
          className={clsx(INPUT_CLASS, "resize-y")}
          rows={3}
          maxLength={MAX_TEXT}
          value={form.approved_response}
          onChange={(e) => set({ approved_response: e.target.value })}
          placeholder="The response you want reps to give"
        />
      </Field>
      <Field label="Why it matters" optional hint="Why this objection is worth handling well.">
        <textarea
          className={clsx(INPUT_CLASS, "resize-y")}
          rows={2}
          maxLength={MAX_TEXT}
          value={form.why_it_matters}
          onChange={(e) => set({ why_it_matters: e.target.value })}
        />
      </Field>
      <Field label="Coaching note" optional hint="A note for coaching. Approval needs this or “why it matters”.">
        <textarea
          className={clsx(INPUT_CLASS, "resize-y")}
          rows={2}
          maxLength={MAX_TEXT}
          value={form.coaching_note}
          onChange={(e) => set({ coaching_note: e.target.value })}
        />
      </Field>
      <Field label="Weak response patterns" optional hint="Responses to avoid. One per line.">
        <textarea
          className={clsx(INPUT_CLASS, "resize-y")}
          rows={2}
          value={form.weak_response_patterns}
          onChange={(e) => set({ weak_response_patterns: e.target.value })}
        />
      </Field>
      <Field label="No-go language" optional hint="Things reps should never say. One per line.">
        <textarea
          className={clsx(INPUT_CLASS, "resize-y")}
          rows={2}
          value={form.no_go_language}
          onChange={(e) => set({ no_go_language: e.target.value })}
        />
      </Field>
    </div>
  );
}

function ReadinessNote({ form }: { form: FormState }) {
  const { ready, missing } = formReadiness(form);
  if (ready) {
    return (
      <p className="text-xs text-success-300">Ready to approve — all required guidance is in place.</p>
    );
  }
  return (
    <div className="text-xs text-neutral-400">
      <p className="text-neutral-300">To approve, this objection still needs:</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-neutral-500">
        {missing.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------- New objection ------------------------------ */

function NewObjectionButton({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setError(null);
  };

  const submit = async () => {
    if (!form.label.trim()) {
      setError("Give this objection a label to save it as a draft.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await createObjection(patchFromForm(form));
    setBusy(false);
    if (!res.ok) {
      setError(
        res.error === "objection_label_taken"
          ? "An objection with this label already exists."
          : "Could not save this draft. Please try again."
      );
      return;
    }
    setForm(blankForm());
    setOpen(false);
    onCreated(res.item.id);
  };

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        New objection
      </Button>
      {open && (
        <Modal title="New objection" onClose={close} wide>
          <p className="text-xs text-neutral-500">
            Only a label is needed to save a draft. You can fill in the rest before approving.
          </p>
          <div className="mt-4">
            <FormFields form={form} setForm={setForm} />
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-neutral-800 pt-4">
            <ReadinessNote form={form} />
            <div className="flex shrink-0 items-center gap-2 pl-4">
              <Button variant="ghost" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={submit} disabled={busy}>
                {busy ? "Saving…" : "Save draft"}
              </Button>
            </div>
          </div>
          {error && <p className="mt-3 text-xs text-danger-300">{error}</p>}
        </Modal>
      )}
    </>
  );
}

/* ----------------------------- Confirm modal ---------------------------- */

function ConfirmModal({
  title,
  body,
  confirmLabel,
  confirmVariant = "primary",
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger";
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-neutral-300">{body}</p>
      <div className="mt-5 flex items-center justify-end gap-2 border-t border-neutral-800 pt-4">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant={confirmVariant} onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/* ------------------------------ Evidence -------------------------------- */

function EvidenceList({ evidence }: { evidence: ObjectionEvidence[] }) {
  if (!evidence.length) {
    return (
      <p className="text-xs text-neutral-600">
        Evidence will appear here when this objection is linked to calls or moments.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {evidence.map((e) => (
        <li key={e.id} className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs">
          {e.phrase ? (
            <p className="text-neutral-200">“{e.phrase}”</p>
          ) : (
            <p className="text-neutral-400">Linked call</p>
          )}
          <p className="mt-1 text-neutral-600">
            {objectionStatusLabel(e.source) === e.source ? e.source : e.source} · {formatDate(e.created_at)}
          </p>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------- Read-only view ----------------------------- */

function ReadOnlyBlock({ label, value }: { label: string; value: string | null | undefined }) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">{label}</div>
      <p className="mt-1 whitespace-pre-line text-sm text-neutral-200">{s}</p>
    </div>
  );
}

function ReadOnlyList({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">{label}</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-neutral-200">
        {values.map((v, i) => (
          <li key={i}>{v}</li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------ Workbench ------------------------------- */

/* ----------------------- Assign coaching (Day 254) ---------------------- */
// Turn an APPROVED objection into a coaching assignment for a rep, via the same
// engine call review uses (assignCoachingFromObjection → POST /v1/assignments).
// The objection is never changed; the prefill is deterministic and editable.

function AssignCoachingModal({ item, onClose }: { item: ObjectionItem; onClose: () => void }) {
  const prefill = useMemo(() => buildObjectionAssignmentPrefill(item), [item]);
  const [reps, setReps] = useState<UploadRepOption[]>([]);
  const [repsLoading, setRepsLoading] = useState(true);
  const [repId, setRepId] = useState("");
  const [title, setTitle] = useState(prefill.title);
  const [notes, setNotes] = useState(prefill.notes);
  const [dueAt, setDueAt] = useState(""); // yyyy-mm-dd, optional
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | { tone: "ok" | "skipped" | "err"; text: string }>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setRepsLoading(true);
      const list = await listTeamUsers();
      if (!alive) return;
      // A drill lands on a rep; keep managers out of the target list where roles exist.
      const assignable = list.filter((r) => (r.role ?? "").toLowerCase() !== "manager");
      const pool = assignable.length ? assignable : list;
      setReps(pool);
      setRepId(pool[0]?.id ?? "");
      setRepsLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const canSubmit = Boolean(repId) && title.trim().length >= 3 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setResult(null);
    const res = await assignCoachingFromObjection({
      repId,
      title: title.trim(),
      notes: notes.trim(),
      dueAt: dueAt ? new Date(`${dueAt}T09:00:00`).toISOString() : null,
      objectionId: item.id,
      objectionLabel: objectionLabel(item.label),
      objectionCategory: item.category,
    });
    setBusy(false);
    if (!res.ok) {
      setResult({ tone: "err", text: "Could not create the assignment. Please try again." });
      return;
    }
    if (res.skipped) {
      setResult({
        tone: "skipped",
        text: "This rep already has an active drill for this focus — nothing new was created.",
      });
      return;
    }
    setResult({ tone: "ok", text: "Coaching assigned. It will appear in the rep's assignments." });
  };

  const done = result?.tone === "ok" || result?.tone === "skipped";

  return (
    <Modal title="Assign coaching" onClose={onClose} wide>
      {done ? (
        <div className="space-y-4">
          <div
            className={clsx(
              "rounded-lg border px-3 py-2 text-sm",
              result?.tone === "ok"
                ? "border-success-500/25 bg-success-500/5 text-success-300"
                : "border-neutral-800 bg-neutral-900/60 text-neutral-300"
            )}
          >
            {result?.text}
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Objection">
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-200">
              {objectionLabel(item.label)}{" "}
              <span className="text-neutral-500">· {categoryLabel(item.category)}</span>
            </div>
          </Field>

          <Field label="Assign to">
            <select
              className={INPUT_CLASS}
              value={repId}
              onChange={(e) => setRepId(e.target.value)}
              disabled={repsLoading || busy}
            >
              {repsLoading ? (
                <option value="">Loading team…</option>
              ) : reps.length === 0 ? (
                <option value="">No reps available</option>
              ) : (
                reps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))
              )}
            </select>
          </Field>

          <Field label="Assignment title">
            <input
              className={INPUT_CLASS}
              value={title}
              maxLength={MAX_LABEL}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </Field>

          <Field label="Instructions" hint="Prefilled from the approved response and coaching note. Edit if you like.">
            <textarea
              className={clsx(INPUT_CLASS, "min-h-[160px] resize-y")}
              value={notes}
              maxLength={MAX_TEXT}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
            />
          </Field>

          <Field label="Due date" optional>
            <input
              type="date"
              className={INPUT_CLASS}
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              disabled={busy}
            />
          </Field>

          {result?.tone === "err" && <p className="text-xs text-danger-300">{result.text}</p>}

          <div className="flex justify-end gap-2 border-t border-neutral-800 pt-4">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={!canSubmit}>
              {busy ? "Assigning…" : "Assign coaching"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ObjectionWorkbench({
  item,
  evidence,
  onChanged,
}: {
  item: ObjectionItem;
  evidence: ObjectionEvidence[];
  onChanged: () => void;
}) {
  const isDraft = item.status === "draft";
  const isApproved = item.status === "approved";
  const isArchived = item.status === "archived";

  const [form, setForm] = useState<FormState>(formFromItem(item));
  const [savedForm, setSavedForm] = useState<FormState>(formFromItem(item));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<null | "approve" | "archive">(null);
  const [assignOpen, setAssignOpen] = useState(false);

  // Reset the working copy whenever a different item (or a fresh status) loads.
  useEffect(() => {
    setForm(formFromItem(item));
    setSavedForm(formFromItem(item));
    setNotice(null);
  }, [item]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(savedForm), [form, savedForm]);
  const readiness = useMemo(() => formReadiness(savedForm), [savedForm]);

  const save = async () => {
    setBusy(true);
    setNotice(null);
    const res = await updateObjection(item.id, patchFromForm(form));
    setBusy(false);
    if (!res.ok) {
      setNotice({
        tone: "err",
        text:
          res.error === "objection_label_taken"
            ? "An objection with this label already exists."
            : "Could not save your changes. Please try again.",
      });
      return;
    }
    setSavedForm(formFromItem(res.item));
    setForm(formFromItem(res.item));
    setNotice({ tone: "ok", text: "Draft saved." });
    onChanged();
  };

  const doApprove = async () => {
    setBusy(true);
    const res = await approveObjection(item.id);
    setBusy(false);
    setConfirm(null);
    if (!res.ok) {
      setNotice({ tone: "err", text: "Could not approve this objection. Check the required fields and try again." });
      return;
    }
    setNotice({ tone: "ok", text: "Approved." });
    onChanged();
  };

  const doArchive = async () => {
    setBusy(true);
    const res = await archiveObjection(item.id);
    setBusy(false);
    setConfirm(null);
    if (!res.ok) {
      setNotice({ tone: "err", text: "Could not archive this objection. Please try again." });
      return;
    }
    setNotice({ tone: "ok", text: "Archived." });
    onChanged();
  };

  return (
    <div className="space-y-5">
      {/* Lifecycle banner */}
      {isApproved && (
        <div className="rounded-lg border border-success-500/25 bg-success-500/5 px-3 py-2 text-xs text-success-300">
          Approved guidance is locked. Editing is disabled to keep coaching consistent.
        </div>
      )}
      {isArchived && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-xs text-neutral-400">
          Archived history. This objection is kept for reference and can no longer be edited.
        </div>
      )}

      {/* Editable draft, or read-only detail */}
      {isDraft ? (
        <FormFields form={form} setForm={setForm} />
      ) : (
        <div className="space-y-4">
          <ReadOnlyList label="Buyer phrases" values={item.buyer_phrases} />
          <ReadOnlyBlock label="Approved response" value={item.approved_response} />
          <ReadOnlyBlock label="Why it matters" value={item.why_it_matters} />
          <ReadOnlyBlock label="Coaching note" value={item.coaching_note} />
          <ReadOnlyList label="Weak response patterns" values={item.weak_response_patterns} />
          <ReadOnlyList label="No-go language" values={item.no_go_language} />
        </div>
      )}

      {/* Draft actions */}
      {isDraft && (
        <div className="space-y-3 border-t border-neutral-800 pt-4">
          <ReadinessNote form={form} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={save} disabled={busy || !dirty}>
              {busy ? "Saving…" : dirty ? "Save draft" : "Saved"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setConfirm("approve")}
              disabled={busy || !readiness.ready || dirty}
              title={
                dirty
                  ? "Save your changes before approving"
                  : !readiness.ready
                  ? "Fill in the required fields before approving"
                  : undefined
              }
            >
              Approve
            </Button>
            <Button variant="ghost" onClick={() => setConfirm("archive")} disabled={busy}>
              Archive
            </Button>
          </div>
          {dirty && readiness.ready && (
            <p className="text-[11px] text-neutral-600">Save your changes to enable approval.</p>
          )}
        </div>
      )}

      {/* Approved actions — assign coaching + archive, no edit (item stays locked) */}
      {isApproved && (
        <div className="space-y-2 border-t border-neutral-800 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => setAssignOpen(true)} disabled={busy}>
              Assign coaching
            </Button>
            <Button variant="ghost" onClick={() => setConfirm("archive")} disabled={busy}>
              Archive
            </Button>
          </div>
          <p className="text-[11px] text-neutral-600">
            Create a coaching drill for a rep from this approved guidance. The objection stays locked.
          </p>
        </div>
      )}

      {notice && (
        <p className={notice.tone === "ok" ? "text-xs text-brand-300" : "text-xs text-danger-300"}>
          {notice.text}
        </p>
      )}

      {/* Evidence */}
      <div className="border-t border-neutral-800 pt-4">
        <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-neutral-500">Evidence</div>
        <EvidenceList evidence={evidence} />
      </div>

      {confirm === "approve" && (
        <ConfirmModal
          title="Approve this objection?"
          body="Future coaching can use this approved guidance. Existing call scores do not change."
          confirmLabel="Approve"
          busy={busy}
          onConfirm={doApprove}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "archive" && (
        <ConfirmModal
          title="Archive this objection?"
          body="It will move to Archived history and can no longer be edited. Nothing is deleted — you can still read it."
          confirmLabel="Archive"
          confirmVariant="danger"
          busy={busy}
          onConfirm={doArchive}
          onClose={() => setConfirm(null)}
        />
      )}
      {assignOpen && isApproved && (
        <AssignCoachingModal item={item} onClose={() => setAssignOpen(false)} />
      )}
    </div>
  );
}

/* ------------------------------- List row ------------------------------- */

function ObjectionRow({
  item,
  open,
  onClick,
}: {
  item: ObjectionItem;
  open: boolean;
  onClick: () => void;
}) {
  const phraseCount = item.buyer_phrases?.length ?? 0;
  const preview = String(item.approved_response ?? "").trim();
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "w-full rounded-xl border px-4 py-3 text-left transition-colors",
        open
          ? "border-brand-500/40 bg-brand-500/5"
          : "border-neutral-800/70 bg-neutral-950 hover:border-neutral-700"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium text-neutral-100">{objectionLabel(item.label)}</span>
        <StatusPill status={item.status} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
        <span>{categoryLabel(item.category)}</span>
        <span>·</span>
        <span>{phraseCount} buyer {phraseCount === 1 ? "phrase" : "phrases"}</span>
        {item.updated_at && (
          <>
            <span>·</span>
            <span>Updated {formatDate(item.updated_at)}</span>
          </>
        )}
      </div>
      {preview && !open && (
        <p className="mt-1.5 line-clamp-1 text-xs text-neutral-400">{preview}</p>
      )}
    </button>
  );
}

/* ------------------------------- Component ------------------------------ */

export default function ObjectionsTab() {
  const [items, setItems] = useState<ObjectionItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<LoadError | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, { item: ObjectionItem; evidence: ObjectionEvidence[] }>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);

  const [archiveOpen, setArchiveOpen] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoaded(false);
    setLoadError(null);
    const res = await listObjections();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) setLoadError("forbidden");
      else if (res.status === 503 || res.error === "objection_library_not_migrated") setLoadError("not_migrated");
      else setLoadError("failed");
      setLoaded(true);
      return;
    }
    setItems(Array.isArray(res.items) ? res.items : []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailError(false);
    setDetailLoading(true);
    const res = await getObjection(id);
    setDetailLoading(false);
    if (!res.ok) {
      setDetailError(true);
      return;
    }
    setDetail((prev) => ({ ...prev, [id]: { item: res.item, evidence: res.evidence ?? [] } }));
  }, []);

  const openDetail = useCallback(
    async (id: string) => {
      if (openId === id) {
        setOpenId(null);
        return;
      }
      setOpenId(id);
      setDetailError(false);
      await fetchDetail(id);
    },
    [openId, fetchDetail]
  );

  // Refresh both the list and the open item's detail after a mutation, so the
  // status pill and the workbench never drift out of sync.
  const refresh = useCallback(
    async (id: string) => {
      await Promise.all([fetchDetail(id), load(true)]);
    },
    [fetchDetail, load]
  );

  const handleCreated = useCallback(
    async (id: string) => {
      await Promise.all([fetchDetail(id), load(true)]);
      setOpenId(id);
    },
    [fetchDetail, load]
  );

  // Auto-expand Archived history if the open item is (or becomes) archived, so
  // the selection is never hidden by the collapse.
  useEffect(() => {
    if (openId && items.some((i) => i.id === openId && i.status === "archived")) {
      setArchiveOpen(true);
    }
  }, [openId, items]);

  const approved = items.filter((i) => i.status === "approved");
  const drafts = items.filter((i) => i.status === "draft");
  const archived = items.filter((i) => i.status === "archived");
  const categoriesCovered = new Set(approved.map((i) => i.category)).size;

  /* ----------------------------- States ----------------------------- */

  if (loaded && loadError === "forbidden") {
    return (
      <SectionCard padded>
        <EmptyState
          message="Intelligence is available to managers"
          sub="Ask your manager or administrator if you need access to the Objection Library."
        />
      </SectionCard>
    );
  }

  if (loaded && loadError) {
    return (
      <SectionCard padded>
        <EmptyState
          message={
            loadError === "not_migrated"
              ? "The Objection Library isn't switched on for this environment yet"
              : "The Objection Library is unavailable right now"
          }
          sub="Nothing about your scoring has changed — this is just a loading problem."
          action={{ label: "Try again", onClick: () => void load() }}
        />
      </SectionCard>
    );
  }

  if (!loaded) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-neutral-900/60" />
        ))}
      </div>
    );
  }

  const empty = items.length === 0;

  const renderGroup = (label: string, rows: ObjectionItem[]) =>
    rows.map((item) => (
      <div key={item.id} className="space-y-2">
        <ObjectionRow item={item} open={openId === item.id} onClick={() => void openDetail(item.id)} />
        {openId === item.id && (
          <SectionCard padded>
            {detailLoading && !detail[item.id] ? (
              <div className="h-24 animate-pulse rounded-lg bg-neutral-900/60" />
            ) : detailError && !detail[item.id] ? (
              <EmptyState
                message="Could not load this objection"
                sub="Please try again."
                action={{ label: "Retry", onClick: () => void fetchDetail(item.id) }}
              />
            ) : detail[item.id] ? (
              <ObjectionWorkbench
                item={detail[item.id].item}
                evidence={detail[item.id].evidence}
                onChanged={() => void refresh(item.id)}
              />
            ) : null}
          </SectionCard>
        )}
      </div>
    ));

  return (
    <div className="mt-4 space-y-6">
      {/* Heading + intro + create */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Objection Library</h2>
          <p className="mt-1 max-w-xl text-sm text-neutral-400">
            Approved guidance for how your team handles buyer pushback.
          </p>
        </div>
        <NewObjectionButton onCreated={handleCreated} />
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Approved" value={approved.length} />
        <StatCard label="Drafts" value={drafts.length} />
        <StatCard label="Archived" value={archived.length} />
        <StatCard label="Categories covered" value={`${categoriesCovered} / ${OBJECTION_CATEGORIES.length}`} />
      </div>

      {empty ? (
        <SectionCard padded>
          <EmptyState
            message="No objections yet"
            sub="Capture how your team should handle buyer pushback, one objection at a time."
          />
          <div className="mt-3 flex justify-center">
            <NewObjectionButton onCreated={handleCreated} />
          </div>
        </SectionCard>
      ) : (
        <div className="space-y-6">
          {/* Approved first */}
          {approved.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Approved guidance</div>
              {renderGroup("Approved", approved)}
            </div>
          )}

          {/* Drafts second */}
          {drafts.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Drafts</div>
              {renderGroup("Drafts", drafts)}
            </div>
          )}

          {/* Approved-empty nudge when only drafts exist */}
          {approved.length === 0 && drafts.length > 0 && (
            <p className="text-xs text-neutral-600">
              Nothing approved yet — complete a draft and approve it to publish guidance for your team.
            </p>
          )}

          {/* Archived collapsed by default */}
          {archived.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setArchiveOpen((v) => !v)}
                className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-neutral-500 transition-colors hover:text-neutral-300"
              >
                <span>{archiveOpen ? "▾" : "▸"}</span>
                Archived history ({archived.length})
              </button>
              {archiveOpen && renderGroup("Archived", archived)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
