"use client";

// Intelligence Layer — Day 225 (read views) + Day 227 (editor wiring)
// + Day 230 (list demo hygiene: archived cards collapse into Archived history).
//
// Backed by the Day 219B/220 API (manager-gated, company-scoped):
//   GET /v1/intelligence/scorecards       company cards + the Gravix default
//   GET /v1/intelligence/scorecards/:id   versions with stage weights + criteria
//
// THIS FILE STAYS READ-ONLY. Its read views are read-only here for now and
// forever: the Day 225/226 validators pin that this file issues no mutating
// request, wires no activate/archive/fork endpoint, and renders no editor
// fields. Day 227's Scorecard Studio editor honours that boundary from the
// outside — ScorecardStudioEditor.tsx renders every mutating control, and
// src/lib/scorecardStudioApi.ts owns every mutating request. From the read
// views themselves nothing is activated, replaced or edited.
//
// The list endpoint omits stage weights and criteria, so the detail panel
// fetches GET /:id on demand rather than inventing a summary from the list.

import { useCallback, useEffect, useState } from "react";
import { proxyFetch } from "@/lib/api";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { computeReadiness, previewConflicts } from "@/lib/scorecardReadiness";
import { NewScorecardPanel, ScorecardWorkbench } from "./ScorecardStudioEditor";

/* ----------------------------- Types ----------------------------- */

type VersionSummary = {
  id: string;
  version: number;
  status: string;
  call_types: string[];
  origin: string;
  activated_at: string | null;
};

type ScorecardItem = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  is_company_default: boolean;
  updated_at: string | null;
  latest_version: VersionSummary | null;
  active_version: VersionSummary | null;
};

type Criterion = {
  id: string;
  stage: string;
  label: string;
  description: string | null;
  scoring_guidance: string | null;
  pass_fail: boolean;
  critical: boolean;
  emphasis: string;
};

type StageWeight = { stage: string; weight: number; guidance: string | null };

type VersionDetail = VersionSummary & {
  stage_weights?: StageWeight[];
  criteria?: Criterion[];
  activation_note: string | null;
};

type DefaultRubric = {
  id: string;
  name: string;
  version: string;
  read_only: boolean;
  stages: { stage: string; weight: number }[];
};

type LoadError = "forbidden" | "not_migrated" | "failed";

/* ---------------------------- Labels ----------------------------- */

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

const EMPHASIS_LABELS: Record<string, string> = {
  minor: "Minor",
  standard: "Standard",
  major: "Major",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
  superseded: "Superseded",
};

function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage.replace(/_/g, " ");
}

function callTypeLabel(t: string): string {
  return CALL_TYPE_LABELS[t] ?? t.replace(/_/g, " ");
}

function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s.replace(/_/g, " ");
}

// Never let a UUID-shaped or missing name become a visible label
// (PREMIUM_UX_AUDIT §38, same rule as Day 223's provenance helper).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function scorecardLabel(name: string | null | undefined): string {
  const s = String(name ?? "").trim();
  if (!s || UUID_RE.test(s)) return "Untitled scorecard";
  return s;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/* --------------------------- Component --------------------------- */

export default function ScorecardsTab() {
  const [items, setItems] = useState<ScorecardItem[]>([]);
  const [defaultRubric, setDefaultRubric] = useState<DefaultRubric | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<LoadError | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, VersionDetail[]>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);

  // Day 230 — Archived history is collapsed by default so QA/probe leftovers
  // never dominate the primary list. Collapse is display-only: nothing is
  // deleted, nothing gains an un-archive control, and every archived card
  // stays clickable/readable once the section is expanded.
  const [archiveOpen, setArchiveOpen] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoaded(false);
    setLoadError(null);
    try {
      const res = await proxyFetch(`/v1/intelligence/scorecards`, { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        setLoadError("forbidden");
        return;
      }
      const json = await res.json();
      if (res.status === 503 || json?.error === "scorecard_studio_not_migrated") {
        setLoadError("not_migrated");
        return;
      }
      if (!res.ok || json?.ok !== true) {
        setLoadError("failed");
        return;
      }
      setItems(Array.isArray(json.items) ? json.items : []);
      setDefaultRubric(json.default_rubric ?? null);
    } catch {
      setLoadError("failed");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // If the open card is (or becomes) archived — e.g. the manager just archived
  // it from the workbench — auto-expand Archived history so the selection is
  // never hidden by the collapse. Direct selection from the list is untouched.
  useEffect(() => {
    if (openId && items.some((i) => i.id === openId && i.status === "archived")) {
      setArchiveOpen(true);
    }
  }, [openId, items]);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailError(false);
    setDetailLoading(true);
    try {
      const res = await proxyFetch(`/v1/intelligence/scorecards/${id}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || json?.ok !== true) {
        setDetailError(true);
        return;
      }
      setDetail((prev) => ({ ...prev, [id]: json.versions ?? [] }));
    } catch {
      setDetailError(true);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openDetail = useCallback(
    async (id: string) => {
      if (openId === id) {
        setOpenId(null);
        return;
      }
      setOpenId(id);
      setDetailError(false);
      if (detail[id]) return;
      await fetchDetail(id);
    },
    [openId, detail, fetchDetail]
  );

  // After any Scorecard Studio mutation (create/save/fork/activate/archive)
  // the list statuses AND the open card's versions can both change — refresh
  // both quietly so the workspace never flashes back to its skeleton.
  const refreshCard = useCallback(
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

  /* -------------------------- Render -------------------------- */

  if (loaded && loadError === "forbidden") {
    return (
      <SectionCard padded>
        <EmptyState
          message="Intelligence is available to managers"
          sub="Ask your manager or administrator if you need access to scorecards."
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
              ? "Scorecards aren't switched on for this environment yet"
              : "Scorecards are unavailable right now"
          }
          sub="Your scoring hasn't changed — this is just a loading problem."
          action={{ label: "Try again", onClick: () => void load() }}
        />
      </SectionCard>
    );
  }

  if (!loaded) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-neutral-900/60" />
        ))}
      </div>
    );
  }

  const activeCard = items.find((i) => i.active_version && i.is_company_default) ?? null;

  // Day 230 grouping — demo-safe ordering. Primary list: active cards first
  // (company default leading), then drafts. Archived cards move to the
  // collapsed Archived history section after everything else.
  const archivedItems = items.filter((i) => i.status === "archived");
  const primaryItems = items.filter((i) => i.status !== "archived");
  const activeItems = primaryItems
    .filter((i) => i.active_version)
    .sort((a, b) => Number(b.is_company_default) - Number(a.is_company_default));
  const draftItems = primaryItems.filter((i) => !i.active_version);

  const renderCard = (card: ScorecardItem) => {
    const version = card.active_version ?? card.latest_version;
    const isOpen = openId === card.id;
    return (
      <div key={card.id}>
        <button
          type="button"
          onClick={() => void openDetail(card.id)}
          aria-expanded={isOpen}
          className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-neutral-900/40"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-neutral-100">
                {scorecardLabel(card.name)}
              </span>
              {version && (
                <span className="text-xs text-neutral-500">
                  v{version.version}
                </span>
              )}
              <StatusPill status={card.status} />
              {card.is_company_default && (
                <span className="inline-flex items-center rounded-full border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-[10px] text-brand-300">
                  Company default
                </span>
              )}
            </div>
            {card.description && (
              <p className="mt-1 line-clamp-2 text-xs text-neutral-500">
                {card.description}
              </p>
            )}
            <p className="mt-1.5 text-[11px] text-neutral-600">
              {version?.call_types?.length
                ? `Applies to: ${version.call_types.map(callTypeLabel).join(" · ")}`
                : "Applies to all call types"}
            </p>
          </div>
          <span className="shrink-0 text-xs text-neutral-500">
            {isOpen ? "Hide" : "View"}
          </span>
        </button>

        {isOpen && (
          <div className="border-t border-neutral-900 bg-neutral-950/60 px-5 py-4">
            {detailLoading && !detail[card.id] ? (
              <div className="h-20 animate-pulse rounded-lg bg-neutral-900/60" />
            ) : detailError && !detail[card.id] ? (
              <p className="text-xs text-neutral-500">
                Couldn&apos;t load this scorecard&apos;s detail.{" "}
                <button
                  type="button"
                  onClick={() => void openDetail(card.id)}
                  className="underline hover:text-neutral-300"
                >
                  Try again
                </button>
              </p>
            ) : (
              <>
                <VersionDetailView
                  versions={detail[card.id] ?? []}
                  card={card}
                  siblings={items}
                />
                <ScorecardWorkbench
                  card={card}
                  versions={detail[card.id] ?? []}
                  siblings={items}
                  onChanged={() => void refreshCard(card.id)}
                />
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-400">
        Scorecards teach Gravix what a good call looks like — the stages that
        matter and how much each one counts. The active company scorecard is
        applied when calls are scored.
      </p>

      {/* WHAT IS SCORING CALLS TODAY — only ever claims what the API reports. */}
      <SectionCard
        variant={activeCard ? "ai" : "default"}
        padded
        eyebrow="Scoring today"
        title={
          activeCard
            ? `${scorecardLabel(activeCard.name)} v${activeCard.active_version?.version ?? 1}`
            : "Gravix Default rubric"
        }
        subtitle={
          activeCard
            ? "Your company scorecard is active and applied to new calls."
            : "No company scorecard is active, so calls are scored with the Gravix default."
        }
      >
        <p className="text-xs text-neutral-500">
          {activeCard
            ? `Activated ${formatDate(activeCard.active_version?.activated_at ?? null)}. Previous versions are archived, never deleted.`
            : "Create and activate a company scorecard below — Gravix will use it for future calls."}
        </p>
      </SectionCard>

      {/* COMPANY SCORECARDS — active + drafts only; archived lives below. */}
      <SectionCard
        eyebrow="Company"
        title="Your scorecards"
        subtitle="Scorecards define what Gravix marks calls against — select one to see and edit its stages and criteria"
        actions={<NewScorecardPanel onCreated={(id) => void handleCreated(id)} />}
      >
        {items.length === 0 ? (
          <EmptyState
            message="No company scorecards yet"
            sub="Every call is scored with the Gravix Default rubric below. Create one with “New scorecard” — the Scorecard Studio editor lets you set the stage weights and detailed criteria Gravix marks against."
          />
        ) : primaryItems.length === 0 ? (
          <EmptyState
            message="No active or draft scorecards"
            sub="Earlier scorecards are kept in Archived history below and never affect scoring. Create a fresh one with “New scorecard” whenever you're ready."
          />
        ) : (
          <div>
            {activeItems.length > 0 && (
              <>
                <GroupHeading
                  label="Active"
                  copy="Active scorecards affect future scoring."
                />
                <div className="divide-y divide-neutral-900">
                  {activeItems.map(renderCard)}
                </div>
              </>
            )}
            {draftItems.length > 0 && (
              <>
                <GroupHeading
                  label="Drafts"
                  copy="Drafts do not affect scoring until activated."
                />
                <div className="divide-y divide-neutral-900">
                  {draftItems.map(renderCard)}
                </div>
              </>
            )}
          </div>
        )}
      </SectionCard>

      {/* GRAVIX DEFAULT */}
      {defaultRubric && (
        <SectionCard
          eyebrow="Built in"
          title={defaultRubric.name}
          subtitle="Gravix's own rubric — used whenever no company scorecard is active"
        >
          <div className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-500">{defaultRubric.version}</span>
              <span className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-400">
                Read-only
              </span>
            </div>
            <div className="mt-3">
              <StageWeightBars
                weights={defaultRubric.stages.map((s) => ({
                  stage: s.stage,
                  weight: s.weight,
                  guidance: null,
                }))}
              />
            </div>
            <p className="mt-3 text-[11px] text-neutral-600">
              Gravix&apos;s built-in rubric: the same four call stages, weighted
              evenly, applied to every call type. It&apos;s part of the product
              rather than your data, so it can&apos;t be edited, archived or
              switched off — a company scorecard simply takes precedence over it
              once activated.
            </p>
          </div>
        </SectionCard>
      )}

      {/* ARCHIVED HISTORY — collapsed by default; only rendered when it has
          something to show. Cards stay clickable/readable once expanded.
          Display-only: history is kept as-is and gains no controls. */}
      {archivedItems.length > 0 && (
        <SectionCard
          eyebrow="History"
          title="Archived history"
          subtitle="Archived scorecards stay available for history, but do not affect future scoring."
          actions={
            <button
              type="button"
              onClick={() => setArchiveOpen((v) => !v)}
              aria-expanded={archiveOpen}
              className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-900"
            >
              {archiveOpen
                ? "Collapse"
                : `Show ${archivedItems.length} archived`}
            </button>
          }
        >
          {archiveOpen ? (
            <div className="divide-y divide-neutral-900">
              {archivedItems.map(renderCard)}
            </div>
          ) : (
            <p className="px-5 py-4 text-xs text-neutral-600">
              {archivedItems.length} archived scorecard
              {archivedItems.length === 1 ? "" : "s"} — collapsed to keep the
              studio focused. Nothing here is deleted, and archived scorecards
              never score new calls.
            </p>
          )}
        </SectionCard>
      )}

      <p className="text-xs text-neutral-600">
        Draft changes do not affect scoring until activated. Activated versions
        are locked so old call reviews stay explainable.
      </p>
    </div>
  );
}

/**
 * Day 230 — small group heading inside the primary list, carrying the honest
 * one-line effect of each group on scoring.
 */
function GroupHeading({ label, copy }: { label: string; copy: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 border-b border-neutral-900 bg-neutral-950/40 px-5 py-2">
      <span className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
        {label}
      </span>
      <span className="text-[11px] text-neutral-600">{copy}</span>
    </div>
  );
}

/* ------------------------- Sub-components ------------------------ */

function StatusPill({ status }: { status: string }) {
  const active = status === "active";
  return (
    <span
      className={
        active
          ? "inline-flex items-center rounded-full border border-success-500/30 bg-success-500/10 px-2 py-0.5 text-[10px] text-success-300"
          : "inline-flex items-center rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-400"
      }
    >
      {statusLabel(status)}
    </span>
  );
}

function StageWeightBars({ weights }: { weights: StageWeight[] }) {
  if (!weights.length) return null;
  const max = Math.max(...weights.map((w) => w.weight), 1);
  return (
    <div className="space-y-2">
      {weights.map((w) => (
        <div key={w.stage} className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-xs text-neutral-400">
            {stageLabel(w.stage)}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-900">
            <div
              className="h-full rounded-full bg-brand-500/60"
              style={{ width: `${(w.weight / max) * 100}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-neutral-500">
            {w.weight}%
          </span>
        </div>
      ))}
    </div>
  );
}

function VersionDetailView({
  versions,
  card,
  siblings,
}: {
  versions: VersionDetail[];
  card: ScorecardItem;
  siblings: ScorecardItem[];
}) {
  if (!versions.length) {
    return <p className="text-xs text-neutral-500">This scorecard has no versions yet.</p>;
  }
  // Show the active version if there is one, else the newest.
  const version = versions.find((v) => v.status === "active") ?? versions[0];
  // POST /activate always targets the card's draft version, so readiness is
  // about the draft — never about the version being displayed.
  const draft = versions.find((v) => v.status === "draft") ?? null;
  // If the displayed version IS the draft, the Day 227 editor below renders
  // its weights and criteria as editable fields — skip the duplicate read
  // view and keep the status row + readiness mirror.
  const editorShowsBody = version.status === "draft";
  const weights = version.stage_weights ?? [];
  const criteria = version.criteria ?? [];
  const stages = weights.length
    ? weights.map((w) => w.stage)
    : Array.from(new Set(criteria.map((c) => c.stage)));

  return (
    <div className="space-y-5">
      {/* STATUS ROW */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <span className="font-medium text-neutral-300">Version {version.version}</span>
        <StatusPill status={version.status} />
        <span className="text-neutral-500">
          {version.status === "active"
            ? `Activated ${formatDate(version.activated_at)}`
            : "Not applied to scoring"}
        </span>
        <span className="text-neutral-600">·</span>
        <span className="text-neutral-500">
          {version.call_types?.length
            ? version.call_types.map(callTypeLabel).join(" · ")
            : card.is_company_default
            ? "Every call type"
            : "No call types set"}
        </span>
        {versions.length > 1 && (
          <>
            <span className="text-neutral-600">·</span>
            <span className="text-neutral-600">{versions.length} versions in history</span>
          </>
        )}
      </div>

      {version.activation_note && (
        <p className="text-xs text-neutral-500">Note: {version.activation_note}</p>
      )}

      {/* CURRENTLY ACTIVE — read-only status, not a control. */}
      {version.status === "active" && (
        <div className="rounded-lg border border-brand-500/25 bg-brand-500/5 px-3 py-2.5">
          <p className="text-xs text-brand-300">
            Currently active — this version scores new calls.
          </p>
          <p className="mt-1 text-[11px] text-neutral-500">
            Already-scored calls keep the score they were given. To change how
            calls are marked, create an editable draft below and activate it.
          </p>
        </div>
      )}

      {/* STAGE WEIGHTS */}
      {weights.length > 0 && !editorShowsBody && (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">
              Stage weights
            </span>
            <span className="text-[10px] tabular-nums text-neutral-600">
              Totals {weights.reduce((s, w) => s + (Number(w.weight) || 0), 0)}%
            </span>
          </div>
          <StageWeightBars weights={weights} />
          {weights.some((w) => w.guidance) && (
            <ul className="mt-3 space-y-1">
              {weights
                .filter((w) => w.guidance)
                .map((w) => (
                  <li key={w.stage} className="text-[11px] text-neutral-500">
                    <span className="text-neutral-400">{stageLabel(w.stage)}:</span>{" "}
                    {w.guidance}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {/* CRITERIA */}
      {editorShowsBody ? null : criteria.length > 0 ? (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">
              Criteria
            </span>
            <span className="text-[10px] tabular-nums text-neutral-600">
              {criteria.length} across {stages.length} stages
            </span>
          </div>
          <div className="space-y-3">
            {stages.map((stage) => {
              const forStage = criteria.filter((c) => c.stage === stage);
              if (!forStage.length) return null;
              const weight = weights.find((w) => w.stage === stage)?.weight;
              return (
                <div
                  key={stage}
                  className="rounded-lg border border-neutral-800/70 px-3 py-2.5"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-medium text-neutral-300">
                      {stageLabel(stage)}
                    </span>
                    <span className="text-[10px] tabular-nums text-neutral-600">
                      {weight != null ? `${weight}% · ` : ""}
                      {forStage.length} criteri{forStage.length === 1 ? "on" : "a"}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-2">
                    {forStage.map((c) => (
                      <li key={c.id}>
                        <div className="flex flex-wrap items-baseline gap-1.5">
                          <span className="text-xs text-neutral-300">{c.label}</span>
                          {c.emphasis && c.emphasis !== "standard" && (
                            <span className="rounded border border-neutral-800 px-1 text-[10px] text-neutral-500">
                              {EMPHASIS_LABELS[c.emphasis] ?? c.emphasis}
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
                        </div>
                        {(c.description || c.scoring_guidance) && (
                          <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">
                            {c.description || c.scoring_guidance}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-neutral-600">
          No criteria on this version — stage weights alone decide the score.
        </p>
      )}

      {/* DRAFT READINESS — display only, no activation action. */}
      {draft && <ReadinessPanel draft={draft} card={card} siblings={siblings} />}
    </div>
  );
}

/**
 * Shows whether a draft version WOULD pass the API's activation gate. Display
 * only: Day 226 ships no activation action, so this never sends POST /activate
 * and never sends replace_conflicts.
 */
function ReadinessPanel({
  draft,
  card,
  siblings,
}: {
  draft: VersionDetail;
  card: ScorecardItem;
  siblings: ScorecardItem[];
}) {
  const readiness = computeReadiness({
    weights: (draft.stage_weights ?? []).map((w) => ({ stage: w.stage, weight: w.weight })),
    criteriaCount: (draft.criteria ?? []).length,
    callTypes: draft.call_types ?? [],
    isCompanyDefault: card.is_company_default,
  });

  const conflicts = previewConflicts(
    {
      scorecardId: card.id,
      isCompanyDefault: card.is_company_default,
      callTypes: draft.call_types ?? [],
    },
    siblings.map((s) => ({
      scorecardId: s.id,
      scorecardName: scorecardLabel(s.name),
      isCompanyDefault: s.is_company_default,
      status: s.status,
      activeVersion: s.active_version
        ? { version: s.active_version.version, call_types: s.active_version.call_types ?? [] }
        : null,
    }))
  );

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-neutral-300">
          Draft version {draft.version} — activation readiness
        </span>
        <span
          className={
            readiness.ready
              ? "inline-flex items-center rounded-full border border-success-500/30 bg-success-500/10 px-2 py-0.5 text-[10px] text-success-300"
              : "inline-flex items-center rounded-full border border-warning-500/30 bg-warning-500/10 px-2 py-0.5 text-[10px] text-warning-300"
          }
        >
          {readiness.ready ? "Meets requirements" : "Not ready"}
        </span>
      </div>

      {/* Two-up on wider screens so the four checks scan in one glance. */}
      <ul className="mt-2.5 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {readiness.checks.map((c) => (
          <li key={c.id} className="flex items-baseline gap-2 text-[11px]">
            <span className={c.ok ? "text-success-300" : "text-neutral-600"}>
              {c.ok ? "✓" : "○"}
            </span>
            <span className={c.ok ? "text-neutral-400" : "text-neutral-300"}>{c.label}</span>
            <span className="text-neutral-600">{c.detail}</span>
          </li>
        ))}
      </ul>

      {conflicts.length > 0 && (
        <div className="mt-3 border-t border-neutral-900 pt-2.5">
          <p className="text-[11px] text-warning-300">
            Would clash with {conflicts.length} active scorecard
            {conflicts.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-1 space-y-1">
            {conflicts.map((c) => (
              <li key={`${c.scorecardName}-${c.version}`} className="text-[11px] text-neutral-500">
                {c.scorecardName} v{c.version} —{" "}
                {c.reason === "call_type"
                  ? `already active for ${c.callTypes.map(callTypeLabel).join(", ")}`
                  : "is the current company default"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Display-only mirror of the activation gate — from this panel itself
          nothing is activated or replaced; activation lives behind the draft
          editor's explicit confirmation modal (ScorecardStudioEditor.tsx). */}
      <p className="mt-3 text-[11px] text-neutral-600">
        These are the checks Gravix runs at activation. Activating is done from
        the draft editor below, and always asks for confirmation first.
      </p>
    </div>
  );
}
