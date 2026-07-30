"use client";

// Day 268 — DEV-ONLY preview for the Scoring v2 Call Review UI.
//
// Renders the deterministic, test-only fixtures (lib/fixtures/scoringV2Fixtures)
// through the real Scoring v2 components + the safe getScoringV2 guard. This is
// NOT a real call, NOT production data, and hits no API. It exists purely for
// browser QA / screenshots and the Day-268 Playwright spec. No AuthGate — it is
// a standalone dev harness. UK spelling.

import { useMemo, useState } from "react";
import { getScoringV2, buildScoringV2ViewModel } from "@/lib/scoringV2Client";
import { SCORING_V2_FIXTURES } from "@/lib/fixtures/scoringV2Fixtures";
import { ScoreV2Banner, StageCriteria, ObjectionMatches, ScoreV2Provenance } from "@/components/scoring-v2/ScoringV2Review";

const STAGE_LABELS: Record<string, string> = {
  intro: "Intro",
  discovery: "Discovery",
  objection: "Objection handling",
  close: "Close",
};

export default function ScoringV2PreviewPage() {
  const [fixtureId, setFixtureId] = useState(SCORING_V2_FIXTURES[0].id);
  const [lastJump, setLastJump] = useState<string>("");

  const fixture = useMemo(() => SCORING_V2_FIXTURES.find((f) => f.id === fixtureId)!, [fixtureId]);
  const scoreV2 = useMemo(() => getScoringV2(fixture.analysisJson), [fixture]);
  const vm = useMemo(() => (scoreV2 ? buildScoringV2ViewModel(scoreV2) : null), [scoreV2]);

  const segments: any[] = fixture.analysisJson?.transcript?.segments ?? [];
  const jumps = {
    onSeek: (sec: number) => {
      setLastJump(`Sought to ${sec}s`);
      const seg = segments.find((s) => s.start_sec === sec);
      if (seg) document.getElementById(`transcript-seg-${seg.idx}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    onJumpSegment: (index: number) => {
      setLastJump(`Jumped to segment ${index}`);
      document.getElementById(`transcript-seg-${index}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
  };

  // The v1 stage scores from the fixture's top-level projection (what the real
  // page renders from analysis_json.stages). Used to show the stage cards here.
  const v1Stages: Record<string, { score: number; notes: string }> = fixture.analysisJson?.stages ?? {};

  return (
    <main className="mx-auto w-full max-w-[1100px] px-6 py-8 space-y-6 text-neutral-100">
      <div>
        <div className="text-[11px] uppercase tracking-[0.16em] text-amber-400 mb-1">Dev preview · fixtures only (not a real call)</div>
        <h1 className="text-xl font-semibold">Scoring v2 Call Review</h1>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Fixture selector">
        {SCORING_V2_FIXTURES.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFixtureId(f.id)}
            aria-pressed={f.id === fixtureId}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              f.id === fixtureId ? "border-indigo-500 bg-indigo-500/10 text-indigo-200" : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-600"
            }`}
          >
            {f.title}
          </button>
        ))}
      </div>
      <p className="text-sm text-neutral-400" data-testid="fixture-blurb">{fixture.blurb}</p>

      <section id="review" className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-4 sm:px-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-medium">Why this call scored {vm ? vm.overall : (fixture.analysisJson?.overall ?? "—")}/100</h2>
          {!vm && <span data-testid="v1-fallback-note" className="text-xs text-neutral-500">v1 rendering (no criteria UI)</span>}
        </div>

        {vm && <ScoreV2Banner banner={vm.banner} />}

        <div className="space-y-3">
          {["intro", "discovery", "objection", "close"].map((key) => {
            const st = v1Stages[key];
            const score = typeof st?.score === "number" ? st.score : null;
            const stageVM = vm?.stagesByKey[key as "intro" | "discovery" | "objection" | "close"];
            return (
              <div key={key} className="rounded-xl border border-neutral-800 bg-black/30 px-4 py-3.5" data-testid={`stage-card-${key}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{STAGE_LABELS[key]}</span>
                  <span className="text-sm font-semibold tabular-nums text-neutral-200">{score !== null ? `${score}/100` : "—"}</span>
                </div>
                {st?.notes && <p className="mt-2 text-sm text-neutral-400">{st.notes}</p>}
                {stageVM && <StageCriteria vm={stageVM} jumps={jumps} />}
              </div>
            );
          })}
        </div>

        {vm && vm.objections.length > 0 && <ObjectionMatches objections={vm.objections} jumps={jumps} />}
        {vm && <ScoreV2Provenance rows={vm.provenanceRows} />}
      </section>

      {segments.length > 0 && (
        <section className="rounded-xl border border-neutral-800 bg-black/30 p-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Transcript</div>
            {lastJump && <span data-testid="jump-indicator" className="text-xs text-indigo-300">{lastJump}</span>}
          </div>
          <div className="mt-3 space-y-2">
            {segments.map((s) => (
              <div key={s.idx} id={`transcript-seg-${s.idx}`} className="flex gap-3 text-sm scroll-mt-24">
                <div className="w-14 shrink-0 text-neutral-500 tabular-nums">{Math.floor(s.start_sec / 60)}:{String(s.start_sec % 60).padStart(2, "0")}</div>
                <div className="flex-1">
                  <span className="font-semibold mr-2 text-neutral-300">{s.speaker}:</span>
                  <span className="text-neutral-200">{s.text}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
