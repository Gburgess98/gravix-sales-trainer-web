"use client";

// Intelligence Layer — Day 233: page-level Intelligence Command band.
//
// Sits above the Context/Scorecards tabs and tells the moat story in one
// glance: Gravix knows how this company sells (published context) and what
// good calls look like (active scorecard), future scoring uses both, and old
// calls keep their history. Every status here derives from the two real
// read endpoints the tabs already use:
//   GET /v1/intelligence/context
//   GET /v1/intelligence/scorecards
// Nothing is claimed that the API didn't report. On 401/403 (rep view) or
// load failure the band renders nothing — the tabs' own calm gate states
// carry the page.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { proxyFetch } from "@/lib/api";
import { SectionCard } from "@/components/ui/section-card";
import { buttonClasses } from "@/components/ui/button";

type IntelligenceTab = "context" | "scorecards";

type CommandStatus = {
  contextPublishedVersion: number | null;
  contextHasDraft: boolean;
  scorecardActiveName: string | null;
  scorecardActiveVersion: number | null;
  scorecardDraftCount: number;
};

// Never let a UUID-shaped or missing name become a visible label
// (PREMIUM_UX_AUDIT §38 — same rule as the tabs).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeName(name: unknown): string | null {
  const s = String(name ?? "").trim();
  if (!s || UUID_RE.test(s)) return null;
  return s;
}

export function IntelligenceCommand({
  onSelectTab,
}: {
  onSelectTab: (tab: IntelligenceTab) => void;
}) {
  const [status, setStatus] = useState<CommandStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const [ctxRes, scRes] = await Promise.all([
        proxyFetch(`/v1/intelligence/context`, { cache: "no-store" }),
        proxyFetch(`/v1/intelligence/scorecards`, { cache: "no-store" }),
      ]);
      if (!ctxRes.ok || !scRes.ok) return; // gate or failure — band stays hidden
      const ctx = await ctxRes.json();
      const sc = await scRes.json();
      if (ctx?.ok !== true || sc?.ok !== true) return;

      const items: any[] = Array.isArray(sc.items) ? sc.items : [];
      const activeCard =
        items.find((i) => i?.active_version && i?.is_company_default) ??
        items.find((i) => i?.active_version) ??
        null;

      setStatus({
        contextPublishedVersion: ctx.published?.version ?? null,
        contextHasDraft: !!ctx.draft,
        scorecardActiveName: activeCard ? safeName(activeCard.name) ?? "Company scorecard" : null,
        scorecardActiveVersion: activeCard?.active_version?.version ?? null,
        scorecardDraftCount: items.filter((i) => i?.status === "draft").length,
      });
    } catch {
      // Band is optional garnish — never an error surface.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!status) return null;

  const {
    contextPublishedVersion,
    contextHasDraft,
    scorecardActiveName,
    scorecardActiveVersion,
    scorecardDraftCount,
  } = status;

  const anythingLive = contextPublishedVersion !== null || scorecardActiveName !== null;

  return (
    <SectionCard variant="ai" className="mb-6">
      {/* PILLARS — the two halves of the moat, doubling as tab shortcuts. */}
      <div className="grid gap-px bg-neutral-900/60 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onSelectTab("context")}
          className="bg-neutral-950/60 px-5 py-4 text-left transition-colors hover:bg-neutral-900/40"
        >
          <div className="text-[10px] uppercase tracking-[0.14em] text-brand-300">Context</div>
          <div className="mt-1 text-sm font-semibold text-neutral-100">
            Teach Gravix how your company sells
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">
            {contextPublishedVersion !== null
              ? `Published v${contextPublishedVersion}${contextHasDraft ? " · draft in progress" : ""}`
              : contextHasDraft
              ? "Draft in progress — nothing published yet"
              : "Not taught yet"}
          </div>
        </button>
        <button
          type="button"
          onClick={() => onSelectTab("scorecards")}
          className="bg-neutral-950/60 px-5 py-4 text-left transition-colors hover:bg-neutral-900/40"
        >
          <div className="text-[10px] uppercase tracking-[0.14em] text-brand-300">Scorecards</div>
          <div className="mt-1 text-sm font-semibold text-neutral-100">
            Define what good calls look like
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">
            {scorecardActiveName
              ? `${scorecardActiveName}${
                  scorecardActiveVersion !== null ? ` v${scorecardActiveVersion}` : ""
                } active${
                  scorecardDraftCount > 0
                    ? ` · ${scorecardDraftCount} draft${scorecardDraftCount === 1 ? "" : "s"} waiting`
                    : ""
                }`
              : scorecardDraftCount > 0
              ? `Gravix Default in use · ${scorecardDraftCount} draft${
                  scorecardDraftCount === 1 ? "" : "s"
                } waiting`
              : "Gravix Default rubric in use"}
          </div>
        </button>
      </div>

      {/* STATUS CHIPS + EXPLANATION */}
      <div className="border-t border-brand-500/10 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip live={contextPublishedVersion !== null}>
            {contextPublishedVersion !== null
              ? `Published context v${contextPublishedVersion}`
              : "No context published"}
          </Chip>
          <Chip live={scorecardActiveName !== null}>
            {scorecardActiveName ? "Active scorecard" : "Gravix Default scorecard"}
          </Chip>
          <Chip live>Future scoring protected</Chip>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-neutral-500">
          Context shapes how Gravix understands your business. Scorecards define
          what it marks calls against. Changes only affect future scoring after
          publish or activation.
        </p>
      </div>

      {/* STATUS STRIP — four cells, first two data-driven. */}
      <div className="grid gap-px border-t border-brand-500/10 bg-neutral-900/60 sm:grid-cols-2 lg:grid-cols-4">
        <StripCell
          label="Context"
          value={
            contextPublishedVersion !== null
              ? `Published v${contextPublishedVersion}`
              : "Nothing published"
          }
          detail={
            contextHasDraft
              ? "Draft changes waiting — publish to apply"
              : contextPublishedVersion !== null
              ? "Live for future scoring"
              : "Gravix scores without company context"
          }
        />
        <StripCell
          label="Scorecards"
          value={scorecardActiveName ? "Active company default" : "Gravix Default in use"}
          detail={
            scorecardDraftCount > 0
              ? `${scorecardDraftCount} draft${scorecardDraftCount === 1 ? "" : "s"} waiting — activation is always confirmed`
              : "Drafts never score until activated"
          }
        />
        <StripCell
          label="Runtime"
          value={anythingLive ? "Company intelligence live" : "Gravix defaults in use"}
          detail={
            anythingLive
              ? "Future calls use the assets that are published and active here"
              : "Future calls use Gravix's built-in rubric until you publish or activate"
          }
        />
        <StripCell
          label="Safety"
          value="History protected"
          detail="Already-scored calls keep their scoring history"
        />
      </div>
    </SectionCard>
  );
}

/**
 * Page-footer trust panel: the five scoring-impact facts, stated plainly, and
 * the provenance bridge to where the proof lives. Static truths of the system
 * (Days 221–223) — this panel makes no data claims, so it renders for anyone
 * who can see the page.
 */
export function ScoringImpactPanel() {
  return (
    <SectionCard
      eyebrow="Trust"
      title="Scoring impact"
      subtitle="Exactly when Intelligence changes what a call is marked against"
    >
      <div className="px-5 py-4">
        <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {[
            "Draft context does not affect scoring.",
            "Draft scorecards do not affect scoring.",
            "Published context affects future scoring.",
            "Active scorecards affect future scoring.",
            "Already-scored calls keep their original scoring provenance.",
          ].map((line) => (
            <li key={line} className="flex gap-2 text-xs text-neutral-400">
              <span className="text-neutral-600">—</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-900 pt-3">
          <p className="text-[11px] text-neutral-500">
            Newly scored calls show the active context and scorecard on the call
            review page, so every score stays explainable.
          </p>
          <Link href="/call-library" className={buttonClasses("ghost", "sm")}>
            Open call library
          </Link>
        </div>
      </div>
    </SectionCard>
  );
}

/* ------------------------- Sub-components ------------------------ */

function Chip({ live, children }: { live: boolean; children: React.ReactNode }) {
  return (
    <span
      className={
        live
          ? "inline-flex items-center rounded-full border border-brand-500/30 bg-brand-500/10 px-2.5 py-0.5 text-[11px] text-brand-300"
          : "inline-flex items-center rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-0.5 text-[11px] text-neutral-400"
      }
    >
      {children}
    </span>
  );
}

function StripCell({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="bg-neutral-950 px-5 py-3">
      <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">{label}</div>
      <div className="mt-1 text-xs font-medium text-neutral-200">{value}</div>
      <div className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">{detail}</div>
    </div>
  );
}
