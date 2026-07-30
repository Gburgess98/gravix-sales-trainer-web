"use client";

// Day 268 — Scoring v2 Call Review components. Thin renderers of the view model
// built by lib/scoringV2Client.buildScoringV2ViewModel. No scoring logic lives
// here (no browser recompute); all copy/derivation is in the pure lib so it is
// testable without a runner. Additive: rendered only when valid v2 exists.
// UK spelling.

import { useId, useState } from "react";
import Link from "next/link";
import type {
  BannerVM,
  StageCriteriaVM,
  CriterionVM,
  EvidenceVM,
  ObjectionVM,
  ProvenanceRowVM,
} from "@/lib/scoringV2Client";

type Tone = "success" | "warning" | "danger" | "neutral";

const TONE_CLASSES: Record<Tone, string> = {
  success: "border-success-500/30 bg-success-500/10 text-success-300",
  warning: "border-warning-500/30 bg-warning-500/10 text-warning-300",
  danger: "border-danger-500/30 bg-danger-500/10 text-danger-300",
  neutral: "border-neutral-700 bg-neutral-900 text-neutral-400",
};

/** Status/handled chip — label text is ALWAYS present (never colour-only). */
export function StatusChip({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE_CLASSES[tone]}`}>
      {label}
    </span>
  );
}

export interface JumpHandlers {
  onSeek?: (seconds: number) => void;
  onJumpSegment?: (index: number) => void;
}

// ── Confidence / degraded banner ──────────────────────────────────────────────
export function ScoreV2Banner({ banner }: { banner: BannerVM }) {
  if (banner.degraded) {
    return (
      <div
        role="status"
        className="rounded-xl border border-warning-500/30 bg-warning-500/10 px-4 py-3 text-sm"
      >
        <div className="font-medium text-warning-200">{banner.lead}</div>
        <p className="mt-1 text-warning-100/80">{banner.detail}</p>
      </div>
    );
  }
  if (!banner.confidenceLabel) return null;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-300">
      <span className="font-medium text-neutral-200">{banner.confidenceLabel}</span>
      {banner.confidenceValue && <span className="text-neutral-500 tabular-nums">· {banner.confidenceValue}</span>}
    </div>
  );
}

// ── One evidence line ─────────────────────────────────────────────────────────
function EvidenceLine({ ev, jumps }: { ev: EvidenceVM; jumps: JumpHandlers }) {
  const canSeek = ev.jump?.kind === "seek" && !!jumps.onSeek;
  const canSegment = ev.jump?.kind === "segment" && !!jumps.onJumpSegment;
  return (
    <div className="border-l-2 border-neutral-700 pl-3">
      <div className="flex items-start justify-between gap-3">
        {/* Verbatim transcript quote — visually distinct from AI coaching text. */}
        <blockquote className="text-sm italic leading-6 text-neutral-300">“{ev.quote}”</blockquote>
        {ev.jump && (canSeek || canSegment) && (
          <button
            type="button"
            onClick={() => {
              if (ev.jump?.kind === "seek") jumps.onSeek?.(ev.jump.seconds);
              else if (ev.jump?.kind === "segment") jumps.onJumpSegment?.(ev.jump.index);
            }}
            className="shrink-0 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] text-indigo-300 hover:text-indigo-200 hover:border-neutral-600"
            aria-label={ev.timestampLabel ? `Jump to ${ev.timestampLabel}` : "Jump to transcript moment"}
          >
            {ev.timestampLabel ? `Jump to ${ev.timestampLabel}` : "Jump to moment"}
          </button>
        )}
      </div>
      {ev.speaker && <div className="mt-0.5 text-[11px] uppercase tracking-wide text-neutral-500">{ev.speaker}</div>}
    </div>
  );
}

// ── One criterion row ─────────────────────────────────────────────────────────
function CriterionRow({ c, jumps }: { c: CriterionVM; jumps: JumpHandlers }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-black/20 px-3 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-sm font-medium text-neutral-100">{c.label}</span>
          <StatusChip label={c.statusLabel} tone={c.statusTone} />
          {c.emphasisLabel && (
            <span className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
              {c.emphasisLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          {c.weightLabel && <span>{c.weightLabel}</span>}
          <span className={`font-semibold tabular-nums ${c.observed ? "text-neutral-200" : "text-neutral-500"}`}>{c.scoreDisplay}</span>
        </div>
      </div>

      {c.evidence.length > 0 && (
        <div className="mt-2.5 space-y-2">
          {c.evidence.map((ev, i) => (
            <EvidenceLine key={i} ev={ev} jumps={jumps} />
          ))}
        </div>
      )}

      {c.whyPointsLost && (
        <div className="mt-2.5">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-0.5">
            Why points were lost{c.pointsLostLabel ? ` · ${c.pointsLostLabel}` : ""}
          </div>
          <p className="text-sm text-neutral-300">{c.whyPointsLost}</p>
        </div>
      )}

      {c.coachingAction && (
        <div className="mt-2.5">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-0.5">Next action</div>
          <p className="text-sm text-neutral-400">{c.coachingAction}</p>
        </div>
      )}

      {c.drill && (
        <div className="mt-2 text-xs text-neutral-500">
          Suggested drill: <span className="text-neutral-300">{c.drill.title}</span>
          {/* Assignment mapping is not yet wired for criterion drills (Day 269);
              we show the recommendation without a misleading Assign action. */}
        </div>
      )}
    </div>
  );
}

// ── Expandable criteria block within a stage card ─────────────────────────────
export function StageCriteria({ vm, jumps }: { vm: StageCriteriaVM; jumps: JumpHandlers }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-left hover:border-neutral-700"
      >
        <span className="text-xs text-neutral-300">
          <span className="font-medium text-neutral-200">{vm.count} criteri{vm.count === 1 ? "on" : "a"}</span>
          {vm.summary ? <span className="text-neutral-500"> · {vm.summary}</span> : null}
        </span>
        <span className="text-neutral-400 text-xs" aria-hidden="true">{open ? "Hide ▲" : "Show ▼"}</span>
      </button>
      {open && (
        <div id={panelId} className="mt-2 space-y-2">
          {vm.criteria.map((c) => (
            <CriterionRow key={c.id} c={c} jumps={jumps} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Objection matches section ─────────────────────────────────────────────────
export function ObjectionMatches({ objections, jumps }: { objections: ObjectionVM[]; jumps: JumpHandlers }) {
  if (!objections || objections.length === 0) return null;
  return (
    <div className="rounded-xl border border-neutral-800 bg-black/30 p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-500 mb-3">Objections detected</div>
      <ul className="space-y-3">
        {objections.map((o, i) => (
          <li key={i} className="rounded-lg border border-neutral-800 bg-black/20 px-3 py-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                {o.label && <span className="text-sm font-medium text-neutral-100">{o.label}</span>}
                <StatusChip label={o.handledLabel} tone={o.handledTone} />
                {o.category && (
                  <span className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                    {o.category}
                  </span>
                )}
              </div>
              {o.href && (
                <Link href={o.href} className="shrink-0 text-xs text-indigo-300 hover:text-indigo-200">
                  Objection Library →
                </Link>
              )}
            </div>
            <blockquote className="mt-2 text-sm italic leading-6 text-neutral-300">“{o.detectedText}”</blockquote>
            {o.evidence && (o.evidence.timestampLabel || o.evidence.jump) && (
              <div className="mt-2">
                <EvidenceLine ev={o.evidence} jumps={jumps} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Provenance detail rows ────────────────────────────────────────────────────
export function ScoreV2Provenance({ rows }: { rows: ProvenanceRowVM[] }) {
  if (!rows || rows.length === 0) return null;
  return (
    <details className="rounded-xl border border-neutral-800 bg-black/20 px-4 py-3">
      <summary className="cursor-pointer text-xs uppercase tracking-wide text-neutral-500">Scoring detail</summary>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 text-xs">
            <dt className="text-neutral-500">{r.label}</dt>
            <dd className="text-neutral-300 tabular-nums text-right break-all">{r.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
