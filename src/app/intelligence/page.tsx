"use client";

// Intelligence Layer — Day 225: the Intelligence workspace (manager MVP).
//
// The first product surface for the Day 207–211 blueprint, backed by the real
// Day 218–236 APIs. Three tabs:
//   ?tab=context      Context Engine   — teach Gravix your business
//   ?tab=scorecards   Scorecard Studio — teach Gravix what good calls look like
//   ?tab=objections   Objection Library — how the team handles buyer pushback
//
// Route/nav decisions come from CONTEXT_ENGINE_ROUTE_PLAN.md §1–2 and are
// deliberate: /crm/analytics stays "observe" (what the team is doing) and
// /intelligence is "teach" (what Gravix knows about how you sell). The sidebar
// labels — "Analytics" vs "Intelligence" — keep them apart.
//
// Not built here on purpose (no API behind them yet, so nothing is drawn):
// AI Builder, AI Autofill, website scraping, objection suggestion mining,
// Playbook Library, team management, runtime scoring controls, custom stage
// editor.

import { useEffect, useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceTabs } from "@/components/shell/workspace-tabs";
import ContextTab from "./ContextTab";
import ScorecardsTab from "./ScorecardsTab";
import ObjectionsTab from "./ObjectionsTab";
import { IntelligenceCommand, ScoringImpactPanel } from "./IntelligenceCommand";

type IntelligenceTab = "context" | "scorecards" | "objections";

const TABS: { id: IntelligenceTab; label: string }[] = [
  { id: "context", label: "Context" },
  { id: "scorecards", label: "Scorecards" },
  { id: "objections", label: "Objections" },
];

const VALID_TABS: IntelligenceTab[] = ["context", "scorecards", "objections"];

export default function IntelligencePage() {
  const [tab, setTab] = useState<IntelligenceTab>("context");

  // Deep-link support (Day 165/178 pattern): reading window.location rather
  // than useSearchParams keeps this page out of a Suspense boundary.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("tab") as IntelligenceTab;
    if (VALID_TABS.includes(wanted)) setTab(wanted);
  }, []);

  const onTabChange = (next: IntelligenceTab) => {
    setTab(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  };

  return (
    <PageContainer>
      <PageHeader
        title="Intelligence"
        subtitle="Teach Gravix your business and what a good call sounds like"
      />

      {/* Day 233 — page-level Intelligence Command band: the moat story and
          cross-tab status, driven by the same two read endpoints the tabs use.
          Renders nothing for reps (the tabs carry their own gate states). */}
      <div className="mt-6">
        <IntelligenceCommand onSelectTab={onTabChange} />
      </div>

      <div className="mt-6">
        <WorkspaceTabs tabs={TABS} active={tab} onChange={onTabChange} />
        {tab === "context" ? (
          <ContextTab />
        ) : tab === "scorecards" ? (
          <ScorecardsTab />
        ) : (
          <ObjectionsTab />
        )}
      </div>

      {/* Day 233 — scoring-impact trust panel + provenance bridge. */}
      <div className="mt-6">
        <ScoringImpactPanel />
      </div>
    </PageContainer>
  );
}
