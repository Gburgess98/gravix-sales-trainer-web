

"use client";

import { useEffect, useMemo, useState } from "react";
import { proxyFetch } from "@/lib/api";

const BUYER_STYLES = [
  "Aggressive buyer",
  "Friendly evaluator",
  "Sceptical procurement",
  "Impatient owner",
  "Analytical CFO",
  "Silent decision maker",
  "Price-focused buyer",
  "Distrustful enterprise buyer",
];

const INDUSTRY_PRESETS = [
  "SaaS",
  "Real estate",
  "Recruitment",
  "Solar",
  "Insurance",
  "Automotive",
  "Luxury retail",
  "Travel",
  "Financial services",
];

export default function AdminPersonasPage() {
  const [buyerStyle, setBuyerStyle] = useState(BUYER_STYLES[0]);
  const [industryPreset, setIndustryPreset] = useState(
    INDUSTRY_PRESETS[0]
  );

  const [companyName, setCompanyName] = useState("Gravix Demo Company");

  const [personaMemory, setPersonaMemory] = useState(
    "Already using a competitor\nConcerned about onboarding time\nNeeds ROI quickly"
  );

  const [objections, setObjections] = useState(
    "Too expensive\nNeed to think about it\nAlready using another provider"
  );

  const [competitors, setCompetitors] = useState(
    "Competitor X\nCompetitor Y"
  );

  const [pressureLevel, setPressureLevel] = useState(72);
  const [trustDecay, setTrustDecay] = useState(58);
  const [objectionAggression, setObjectionAggression] = useState(66);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadPersonaConfig() {
      try {
        setLoading(true);
        setSaveError(null);

        const res = await proxyFetch("/v1/admin/persona-config", {
          cache: "no-store",
        });

        const data = await res.json();

        if (!res.ok || data?.ok === false) {
          throw new Error(data?.error || "Failed to load config");
        }

        if (!mounted) return;

        const config = data.config || {};

        setCompanyName(data.company_name || "Unknown company");

        if (typeof config.buyer_style === "string") {
          setBuyerStyle(config.buyer_style);
        }

        if (typeof config.industry_preset === "string") {
          setIndustryPreset(config.industry_preset);
        }

        setPersonaMemory(
          Array.isArray(config.persona_memory)
            ? config.persona_memory.join("\n")
            : ""
        );

        setObjections(
          Array.isArray(config.objection_patterns)
            ? config.objection_patterns.join("\n")
            : ""
        );

        setCompetitors(
          Array.isArray(config.competitor_names)
            ? config.competitor_names.join("\n")
            : ""
        );

        setPressureLevel(
          Number(config.emotional_tuning?.pressure_level ?? 50)
        );

        setTrustDecay(
          Number(config.emotional_tuning?.trust_decay ?? 50)
        );

        setObjectionAggression(
          Number(config.emotional_tuning?.objection_aggression ?? 50)
        );
      } catch (e: any) {
        console.error("Failed loading persona config", e);

        if (mounted) {
          setSaveError(e?.message || "Failed to load persona config.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadPersonaConfig();

    return () => {
      mounted = false;
    };
  }, []);

  const memoryCount = useMemo(
    () =>
      personaMemory
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean).length,
    [personaMemory]
  );

  const objectionCount = useMemo(
    () =>
      objections
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean).length,
    [objections]
  );

  async function savePersonaConfig() {
    try {
      setSaving(true);
      setSaveError(null);
      setSaveMessage(null);

      const payload = {
        buyer_style: buyerStyle,
        industry_preset: industryPreset,

        objection_patterns: objections
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),

        competitor_names: competitors
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),

        common_pushbacks: objections
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 10),

        persona_memory: personaMemory
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),

        emotional_tuning: {
          pressure_level: pressureLevel,
          trust_decay: trustDecay,
          objection_aggression: objectionAggression,
        },
      };

      const res = await proxyFetch("/v1/admin/persona-config", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || "Failed to save persona config");
      }

      setSaveMessage("Persona configuration saved successfully.");

      setTimeout(() => {
        setSaveMessage(null);
      }, 3500);
    } catch (e: any) {
      console.error("Failed saving persona config", e);

      setSaveError(e?.message || "Failed to save persona config.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-black px-6 py-8 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {loading && (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 px-5 py-4 text-sm text-neutral-300">
            Loading company persona configuration…
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
              Persona config management
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
              Enterprise AI buyer configuration
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
              Configure company-specific buyer personalities, objection
              libraries, emotional pressure, and behavioural patterns for
              Gravix sparring simulations.
            </p>
          </div>

          <button
            type="button"
            onClick={savePersonaConfig}
            disabled={saving || loading}
            className="inline-flex items-center rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 transition-all duration-150 hover:bg-cyan-500/20 active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? "Saving…" : loading ? "Loading…" : "Save persona config"}
          </button>
        </div>

        {saveMessage && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {saveMessage}
          </div>
        )}

        {saveError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {saveError}
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Company persona identity
                  </h2>

                  <p className="mt-1 text-xs text-neutral-500">
                    Controls how AI buyers behave for this company.
                  </p>
                </div>

                <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-emerald-300">
                  Enterprise ready
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-[0.12em] text-neutral-400">
                    Company name
                  </label>

                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-black px-4 py-3 text-sm text-white outline-none transition-all focus:border-cyan-500/50"
                    placeholder="Company name"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-[0.12em] text-neutral-400">
                    Industry preset
                  </label>

                  <select
                    value={industryPreset}
                    onChange={(e) => setIndustryPreset(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-black px-4 py-3 text-sm text-white outline-none transition-all focus:border-cyan-500/50"
                  >
                    {INDUSTRY_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>
                        {preset}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-2 block text-xs font-medium uppercase tracking-[0.12em] text-neutral-400">
                  Buyer style
                </label>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {BUYER_STYLES.map((style) => {
                    const active = style === buyerStyle;

                    return (
                      <button
                        key={style}
                        type="button"
                        onClick={() => setBuyerStyle(style)}
                        className={`rounded-xl border px-4 py-3 text-left transition-all duration-150 active:scale-[0.98] ${
                          active
                            ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-100"
                            : "border-neutral-800 bg-black text-neutral-300 hover:border-neutral-700"
                        }`}
                      >
                        <div className="text-sm font-medium">{style}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Objection libraries
                  </h2>

                  <p className="mt-1 text-xs text-neutral-500">
                    Configure realistic industry-specific pushback patterns.
                  </p>
                </div>

                <div className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-red-300">
                  {objectionCount} objections
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-[0.12em] text-neutral-400">
                    Common objections
                  </label>

                  <textarea
                    value={objections}
                    onChange={(e) => setObjections(e.target.value)}
                    className="min-h-[220px] w-full rounded-xl border border-neutral-800 bg-black px-4 py-3 text-sm text-white outline-none transition-all focus:border-red-500/50"
                    placeholder="One objection per line"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-[0.12em] text-neutral-400">
                    Competitor names
                  </label>

                  <textarea
                    value={competitors}
                    onChange={(e) => setCompetitors(e.target.value)}
                    className="min-h-[220px] w-full rounded-xl border border-neutral-800 bg-black px-4 py-3 text-sm text-white outline-none transition-all focus:border-orange-500/50"
                    placeholder="One competitor per line"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Persona memory
                  </h2>

                  <p className="mt-1 text-xs text-neutral-500">
                    Persistent buyer context used during AI sparring.
                  </p>
                </div>

                <div className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-violet-300">
                  {memoryCount} memory items
                </div>
              </div>

              <div className="mt-5">
                <textarea
                  value={personaMemory}
                  onChange={(e) => setPersonaMemory(e.target.value)}
                  className="min-h-[220px] w-full rounded-xl border border-neutral-800 bg-black px-4 py-3 text-sm text-white outline-none transition-all focus:border-violet-500/50"
                  placeholder="One memory item per line"
                />
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
              <h2 className="text-lg font-semibold text-white">
                Emotional pressure tuning
              </h2>

              <p className="mt-1 text-xs text-neutral-500">
                Configure how difficult and emotionally aggressive AI buyers
                become during sparring.
              </p>

              <div className="mt-6 space-y-6">
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs text-neutral-400">
                    <span>Pressure escalation</span>
                    <span>{pressureLevel}%</span>
                  </div>

                  <input
                    type="range"
                    value={pressureLevel}
                    min={0}
                    max={100}
                    onChange={(e) => setPressureLevel(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-xs text-neutral-400">
                    <span>Trust decay speed</span>
                    <span>{trustDecay}%</span>
                  </div>

                  <input
                    type="range"
                    value={trustDecay}
                    min={0}
                    max={100}
                    onChange={(e) => setTrustDecay(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-xs text-neutral-400">
                    <span>Objection aggression</span>
                    <span>{objectionAggression}%</span>
                  </div>

                  <input
                    type="range"
                    value={objectionAggression}
                    min={0}
                    max={100}
                    onChange={(e) =>
                      setObjectionAggression(Number(e.target.value))
                    }
                    className="w-full"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Live persona preview
                  </h2>

                  <p className="mt-1 text-xs text-neutral-500">
                    Preview how this AI buyer behaves during sparring.
                  </p>
                </div>

                <div className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-cyan-300">
                  Simulation preview
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-neutral-800 bg-black p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {buyerStyle}
                    </div>

                    <div className="mt-1 text-xs text-neutral-500">
                      {industryPreset} • {companyName}
                    </div>
                  </div>

                  <div className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-neutral-300">
                    AI buyer
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-100">
                  “Honestly, your pricing feels high compared to what we’re
                  already using — and I’m not convinced onboarding this would
                  be worth the disruption.”
                </div>

                <div className="mt-4 grid gap-3 text-[11px] text-neutral-400">
                  <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                    <span>Pressure level</span>
                    <span>{pressureLevel}%</span>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                    <span>Trust decay</span>
                    <span>{trustDecay}%</span>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                    <span>Objection aggression</span>
                    <span>{objectionAggression}%</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}