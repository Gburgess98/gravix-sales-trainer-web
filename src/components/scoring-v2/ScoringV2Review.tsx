"use client";

// Day 268 — Scoring v2 Call Review components. Thin renderers of the view model
// built by lib/scoringV2Client.buildScoringV2ViewModel. No scoring logic lives
// here (no browser recompute); all copy/derivation is in the pure lib so it is
// testable without a runner. Additive: rendered only when valid v2 exists.
// UK spelling.

import { useId, useState } from "react";
import Link from "next/link";
import { Badge, dsButton } from "@/components/ds";
import type { Tone as DsTone } from "@/lib/ds-model";
import type {
  BannerVM,
  StageCriteriaVM,
  CriterionVM,
  EvidenceVM,
  ObjectionVM,
  ProvenanceRowVM,
} from "@/lib/scoringV2Client";

type Tone = "success" | "warning" | "danger" | "neutral";

// v2 status tones → shared design-system badge tones (colour is never the only signal: the label is always rendered).
const DS_TONE: Record<Tone, DsTone> = { success: "good", warning: "warn", danger: "bad", neutral: "neutral" };

/** Status/handled chip — label text is ALWAYS present (never colour-only). */
export function StatusChip({ label, tone }: { label: string; tone: Tone }) {
  return (
    <Badge tone={DS_TONE[tone]}>{label}</Badge>
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
        className="rounded-[var(--ds-radius-control)] border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm"
      >
        <div className="font-medium text-amber-100">{banner.lead}</div>
        <p className="mt-1 text-[var(--ds-text-2)]">{banner.detail}</p>
      </div>
    );
  }
  if (!banner.confidenceLabel) return null;
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1 text-xs text-[var(--ds-text-2)] ring-1 ring-inset ring-white/10" title="Reported by criteria-level (v2) scoring">
      <span className="font-medium text-[var(--ds-text)]">{banner.confidenceLabel}</span>
      {banner.confidenceValue && <span className="tabular-nums text-[var(--ds-text-3)]">· {banner.confidenceValue}</span>}
    </div>
  );
}

// ── One evidence line ─────────────────────────────────────────────────────────
function EvidenceLine({ ev, jumps, hideQuote = false }: { ev: EvidenceVM; jumps: JumpHandlers; hideQuote?: boolean }) {
  const canSeek = ev.jump?.kind === "seek" && !!jumps.onSeek;
  const canSegment = ev.jump?.kind === "segment" && !!jumps.onJumpSegment;
  return (
    <div className="border-l-2 border-[var(--ds-border-strong)] pl-3">
      <div className="flex items-start justify-between gap-3">
        {/* Verbatim transcript quote — visually distinct from AI coaching text. */}
        {hideQuote ? <span /> : <blockquote className="text-sm italic leading-6 text-[var(--ds-text-2)]">“{ev.quote}”</blockquote>}
        {ev.jump && (canSeek || canSegment) && (
          <button
            type="button"
            onClick={() => {
              if (ev.jump?.kind === "seek") jumps.onSeek?.(ev.jump.seconds);
              else if (ev.jump?.kind === "segment") jumps.onJumpSegment?.(ev.jump.index);
            }}
            className={dsButton("secondary", "sm", "shrink-0 !px-2 !py-0.5 !text-xs tabular-nums")}
            aria-label={ev.timestampLabel ? `Jump to ${ev.timestampLabel}` : "Jump to transcript moment"}
          >
            {ev.timestampLabel ? `Jump to ${ev.timestampLabel}` : "Jump to moment"}
          </button>
        )}
      </div>
      {ev.speaker && <div className="mt-0.5 text-xs text-[var(--ds-text-3)]">{ev.speaker}</div>}
    </div>
  );
}

// ── One criterion row ─────────────────────────────────────────────────────────
function CriterionRow({ c, jumps }: { c: CriterionVM; jumps: JumpHandlers }) {
  return (
    <div className="rounded-[var(--ds-radius-control)] border border-[var(--ds-border)] bg-white/[0.03] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[var(--ds-text)]">{c.label}</span>
          <StatusChip label={c.statusLabel} tone={c.statusTone} />
          {c.emphasisLabel && (
            <Badge>{c.emphasisLabel}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--ds-text-3)]">
          {c.weightLabel && <span>{c.weightLabel}</span>}
          {/* The chip already says "Not observed"; do not repeat it as the score. */}
          {(c.observed || c.scoreDisplay !== c.statusLabel) && (
            <span className={`font-semibold tabular-nums ${c.observed ? "text-[var(--ds-text)]" : "text-[var(--ds-text-3)]"}`}>{c.scoreDisplay}</span>
          )}
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
          <div className="mb-0.5 text-xs font-medium text-[var(--ds-text-3)]">
            Why points were lost{c.pointsLostLabel ? ` · ${c.pointsLostLabel}` : ""}
          </div>
          <p className="text-sm leading-6 text-[var(--ds-text-2)]">{c.whyPointsLost}</p>
        </div>
      )}

      {c.coachingAction && (
        <div className="mt-2.5">
          <div className="mb-0.5 text-xs font-medium text-[var(--ds-text-3)]">Next action</div>
          <p className="text-sm leading-6 text-[var(--ds-text-2)]">{c.coachingAction}</p>
        </div>
      )}

      {c.drill && (
        <div className="mt-2 text-xs text-[var(--ds-text-3)]">
          Suggested drill: <span className="text-[var(--ds-text-2)]">{c.drill.title}</span>
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
        className="ds-focus flex w-full items-center justify-between gap-3 rounded-[var(--ds-radius-control)] border border-[var(--ds-border)] bg-white/[0.03] px-3 py-2 text-left transition-colors hover:border-[var(--ds-border-strong)] motion-reduce:transition-none"
      >
        <span className="text-sm text-[var(--ds-text-2)]">
          <span className="font-medium text-[var(--ds-text)]">{vm.count} criteri{vm.count === 1 ? "on" : "a"}</span>
          {vm.summary ? <span className="text-[var(--ds-text-3)]"> · {vm.summary}</span> : null}
        </span>
        <span className="text-xs text-[var(--ds-text-3)]" aria-hidden="true">{open ? "Hide ▲" : "Show ▼"}</span>
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
    <div className="border-t border-[var(--ds-border)] px-5 py-4 sm:px-6" data-testid="v2-objections">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-sm font-medium text-[var(--ds-text)]">Objections detected</h3>
        <span className="text-xs text-[var(--ds-text-3)]">From criteria-level (v2) scoring</span>
      </div>
      <ul className="space-y-3">
        {objections.map((o, i) => (
          <li key={i} className="rounded-[var(--ds-radius-control)] border border-[var(--ds-border)] bg-white/[0.03] px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {o.label && <span className="text-sm font-medium text-[var(--ds-text)]">{o.label}</span>}
                <StatusChip label={o.handledLabel} tone={o.handledTone} />
                {o.category && (
                  <Badge>{o.category}</Badge>
                )}
              </div>
              {o.href && (
                <Link href={o.href} className="ds-focus shrink-0 rounded text-xs text-[var(--ds-highlight)] hover:underline">
                  Objection Library →
                </Link>
              )}
            </div>
            <blockquote className="mt-2 text-sm italic leading-6 text-[var(--ds-text-2)]">“{o.detectedText}”</blockquote>
            {o.evidence && (o.evidence.timestampLabel || o.evidence.jump) && (
              <div className="mt-2">
                <EvidenceLine ev={o.evidence} jumps={jumps} hideQuote={o.evidence.quote.trim() === o.detectedText.trim()} />
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
    <details className="rounded-[var(--ds-radius-control)] border border-[var(--ds-border)] bg-white/[0.03] px-4 py-3">
      <summary className="ds-focus cursor-pointer rounded text-sm text-[var(--ds-text-2)]">Scoring detail <span className="text-[var(--ds-text-3)]">· v2 provenance</span></summary>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 text-xs">
            <dt className="text-[var(--ds-text-3)]">{r.label}</dt>
            <dd className="break-all text-right tabular-nums text-[var(--ds-text-2)]">{r.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
