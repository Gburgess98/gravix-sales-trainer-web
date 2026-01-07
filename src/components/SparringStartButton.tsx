"use client";

import { useState, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import { proxyFetch } from "@/lib/api";

type SparringPersonaPreset = {
  id: string;
  label: string;
  description?: string;
  difficulty_default?: string;
  traits?: string[];
};

type Props = {
  label?: string;
  personaId?: string; // e.g. "price_sensitive"
  difficulty?: string; // e.g. "normal" | "easy" | "hard"
  className?: string;
};

export default function SparringStartButton({
  label = "Start sparring",
  personaId = "price_sensitive",
  difficulty = "normal",
  className = "",
}: Props) {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [localPersona, setLocalPersona] = useState(personaId);
  const [localDifficulty, setLocalDifficulty] = useState(difficulty);
  const [mode, setMode] = useState<"standard" | "time_trial" | "close_2m">("standard");

  const [presets, setPresets] = useState<SparringPersonaPreset[]>([]);

  // Professional profile (Kendo-style) local state
  const [jobTitle, setJobTitle] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");

  useEffect(() => {
    async function loadPresets() {
      try {
        const res = await proxyFetch("/api/proxy/v1/sparring/personas", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (json && json.ok && Array.isArray(json.personas)) {
          setPresets(json.personas as SparringPersonaPreset[]);
        }
      } catch (e) {
        console.error("Failed to load sparring personas", e);
      }
    }
    loadPresets();
  }, []);

  function onClick() {
    if (busy) return;
    setModalOpen(true);
  }

  async function beginSession() {
    if (busy) return;
    setBusy(true);
    setErr(null);

    try {
      const body: any = {
        personaId: localPersona,
        difficulty: localDifficulty,
        meta: {
          opponent_profile: {
            jobTitle: jobTitle || null,
            industry: industry || null,
            companySize: companySize || null,
          },
        },
      };

      // Attach game mode + optional target duration for drills
      if (mode === "standard") {
        body.mode = "standard";
      } else if (mode === "time_trial") {
        body.mode = "time_trial";
      } else if (mode === "close_2m") {
        // Treat this as a special case of time_trial with a 2-minute target
        body.mode = "time_trial";
        body.targetDurationSec = 120; // 2 minutes target
      }

      const res = await proxyFetch("/api/proxy/v1/sparring/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json || json.ok === false || !json.session?.id) {
        throw new Error(json?.error || "Failed to start sparring session.");
      }

      router.push(`/sparring/${encodeURIComponent(json.session.id)}`);
    } catch (e: any) {
      console.error("Start sparring failed", e);
      setErr(e?.message || "Failed to start sparring session.");
    } finally {
      setBusy(false);
      setModalOpen(false);
    }
  }

  const difficultyLabel = (value: string | undefined) => {
    if (!value) return "";
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  };

  return (
    <Fragment>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={onClick}
          disabled={busy}
          className={`inline-flex items-center justify-center rounded-full border border-emerald-500 px-4 py-1.5 text-xs font-medium ${busy
            ? "bg-emerald-700/60 text-black/70"
            : "bg-emerald-600 text-black hover:bg-emerald-500"
            } disabled:opacity-50 ${className}`}
        >
          {busy ? "Starting…" : label}
        </button>
        {err && <p className="text-[11px] text-red-400">{err}</p>}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            className="w-full max-w-4xl rounded-2xl bg-neutral-950 border border-neutral-800 p-8 shadow-2xl max-h-[80vh] overflow-y-auto"
          >
            <h3 className="mb-3 text-lg font-semibold text-neutral-100">
              Choose your opponent
            </h3>

            <div className="space-y-4 text-sm">
              {/* Opponent preview */}
              <div className="rounded-xl border border-neutral-700 bg-neutral-800/40 p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-700/40 text-xl">
                    🤖
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium capitalize text-neutral-100">
                      {localPersona.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-neutral-400">
                      {difficultyLabel(localDifficulty)} difficulty
                    </span>
                  </div>
                </div>
              </div>

              {/* Preset opponents */}
              {presets.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
                      Preset opponents
                    </span>
                    <span className="text-[11px] text-neutral-500">
                      Pick a boss to spar against
                    </span>
                  </div>

                  <div className="space-y-2 mt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
                        Game mode
                      </span>
                      <span className="text-[11px] text-neutral-500">
                        Standard, time trial, or a 2-minute close drill
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setMode("standard")}
                        className={`rounded-full border px-3 py-1 text-xs ${mode === "standard"
                          ? "border-emerald-400 bg-emerald-500/10 text-emerald-200"
                          : "border-neutral-700 bg-neutral-900 text-neutral-300"
                          }`}
                      >
                        Standard round
                      </button>

                      <button
                        type="button"
                        onClick={() => setMode("time_trial")}
                        className={`rounded-full border px-3 py-1 text-xs ${mode === "time_trial"
                          ? "border-emerald-400 bg-emerald-500/10 text-emerald-200"
                          : "border-neutral-700 bg-neutral-900 text-neutral-300"
                          }`}
                      >
                        Time trial (speed)
                      </button>

                      <button
                        type="button"
                        onClick={() => setMode("close_2m")}
                        className={`rounded-full border px-3 py-1 text-xs ${mode === "close_2m"
                          ? "border-emerald-400 bg-emerald-500/10 text-emerald-200"
                          : "border-neutral-700 bg-neutral-900 text-neutral-300"
                          }`}
                      >
                        Close in 2 minutes
                      </button>
                    </div>
                  </div>

                  <div className="grid max-h-64 grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2">
                    {presets.map((p) => {
                      const selected = p.id === localPersona;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setLocalPersona(p.id);
                            if (p.difficulty_default) {
                              setLocalDifficulty(p.difficulty_default);
                            }
                          }}
                          className={`flex w-full flex-col items-start rounded-2xl border px-4 py-3 text-left text-xs transition ${selected
                            ? "border-emerald-500/80 bg-emerald-500/5"
                            : "border-neutral-800 bg-neutral-950 hover:border-neutral-600"
                            }`}
                        >
                          <div className="flex w-full items-center justify-between gap-2">
                            <div>
                              <div className="text-[13px] font-medium text-neutral-100">
                                {p.label}
                              </div>
                              {p.description && (
                                <div className="mt-0.5 text-[11px] text-neutral-400">
                                  {p.description}
                                </div>
                              )}
                            </div>
                            {p.difficulty_default && (
                              <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300">
                                {difficultyLabel(p.difficulty_default)}
                              </span>
                            )}
                          </div>
                          {Array.isArray(p.traits) && p.traits.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                              {p.traits.map((t) => (
                                <span
                                  key={t}
                                  className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-neutral-300"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Professional profile */}
              <div className="mt-2 space-y-3">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
                    Professional profile
                  </h4>
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Optional — use this to shape the opponent. Leave blank to keep it random.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-neutral-300">
                    Job title &amp; role
                  </label>
                  <input
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="e.g. VP of Sales, CFO, Founder"
                    className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-100 outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-neutral-300">
                    Industry sector
                  </label>
                  <input
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g. SaaS, Real estate, Automotive"
                    className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-100 outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-neutral-300">
                    Company size
                  </label>
                  <select
                    value={companySize}
                    onChange={(e) => setCompanySize(e.target.value)}
                    className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-100 outline-none focus:border-emerald-500"
                  >
                    <option value="">Random</option>
                    <option value="1-10">1–10 employees</option>
                    <option value="11-50">11–50 employees</option>
                    <option value="51-200">51–200 employees</option>
                    <option value="201-1000">201–1,000 employees</option>
                    <option value="1000+">1,000+ employees</option>
                  </select>
                </div>
              </div>

              {/* Manual persona + difficulty overrides */}
              <div className="mt-4 grid grid-cols-1 gap-3 border-t border-neutral-800 pt-3 text-xs md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-neutral-300">Persona</label>
                  <select
                    className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1"
                    value={localPersona}
                    onChange={(e) => setLocalPersona(e.target.value)}
                  >
                    <option value="price_sensitive">Price Sensitive</option>
                    <option value="distracted">Distracted</option>
                    <option value="cautious_cfo">Cautious CFO</option>
                    <option value="gatekeeper">Gatekeeper</option>
                    <option value="silent">Silent Type</option>
                    <option value="angry">Angry Buyer</option>
                    <option value="random">Random</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-neutral-300">Difficulty</label>
                  <select
                    className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1"
                    value={localDifficulty}
                    onChange={(e) => setLocalDifficulty(e.target.value)}
                  >
                    <option value="easy">Easy</option>
                    <option value="normal">Normal</option>
                    <option value="hard">Hard</option>
                    <option value="nightmare">Nightmare</option>
                  </select>
                </div>
              </div>

              {err && <p className="text-xs text-red-400">{err}</p>}

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded border border-neutral-600 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={beginSession}
                  disabled={busy}
                  className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-black hover:bg-emerald-500 disabled:opacity-50"
                >
                  {busy ? "Starting…" : "Begin"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Fragment>
  );
}