"use client";

// Intelligence Layer — Day 225 (Context Engine MVP) + Day 232 (premium
// workspace pass: hero band, module rail, focus editor, static guidance).
//
// Backed entirely by the Day 218 API (manager-gated, company-scoped):
//   GET  /v1/intelligence/context            draft + published rows
//   PUT  /v1/intelligence/context            save the draft only
//   POST /v1/intelligence/context/publish    publish the draft as a new version
//   GET  /v1/intelligence/context/compiled   deterministic compiled block
//
// Scope decisions (deliberate, see PREMIUM_UX_AUDIT.md §Day 225/§Day 232):
//  - Editing covers the free-text fields only. The structured lists (products,
//    objections, competitors, compliance) are READ-ONLY here — they need real
//    repeater editors, which is a later lane. Each list is shown inside its
//    module so the manager sees the whole picture.
//  - No AI Autofill, no website scraping, no "AI assistant" — none of that
//    exists in the API, so none of it is drawn here. The guidance panel is
//    static example copy, clearly labelled as such.
//  - Module strength labels (Not taught / Basic / Strong) are deterministic
//    functions of the draft content — never scores, never model output.
//
// SAFETY — the PUT replaces the entire draft context object. Every save must
// therefore start from the context we loaded and merge the edited fields into
// it, so the untouched structured lists survive round-trips. Never build the
// payload from the form fields alone: that would silently delete the seeded
// products/objections/competitors on the first save.

import { useCallback, useEffect, useMemo, useState } from "react";
import { proxyFetch } from "@/lib/api";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

/* ----------------------------- Types ----------------------------- */

type ContextRow = {
  id: string;
  status: string;
  version: number;
  context: Record<string, any>;
  compiled_context: string | null;
  published_at: string | null;
  updated_at: string | null;
};

type ContextResponse = {
  ok: boolean;
  draft: ContextRow | null;
  published: ContextRow | null;
};

type LoadError = "forbidden" | "not_migrated" | "failed";

/* --------------------------- Field map --------------------------- */
// Mirrors the API's CONTEXT_SECTION_KEYS / compileContextBlock contract
// (api src/lib/contextEngine.ts). Unknown top-level keys are a hard 400, so
// this map must never invent a section — every editable path below starts
// with one of the six real section keys.

type FieldDef = { path: string[]; label: string; hint: string; rows: number };

const MAX_FIELD_CHARS = 1000; // API clips at 1,000 per field

/* --------------------------- Modules ----------------------------- */
// The manager-facing shape of the six API sections: eight focused modules,
// one in view at a time. Modules only regroup the same six keys — they never
// add sections the API doesn't have.

type ListKind = "products" | "objections" | "competitors" | "compliance";

type ModuleDef = {
  id: string;
  label: string;
  blurb: string;
  fields: FieldDef[];
  lists: ListKind[];
  guidance: string[];
};

const MODULES: ModuleDef[] = [
  {
    id: "company",
    label: "Company profile",
    blurb: "What the company does, in the words reps should use.",
    fields: [
      {
        path: ["profile", "about"],
        label: "About the company",
        hint: "What the company does, in the words you'd use on a call.",
        rows: 5,
      },
    ],
    lists: [],
    guidance: [
      "Two or three sentences a new rep could say out loud on a first call.",
      "Name the market and the problem you remove, not the org chart.",
      "Skip mission-statement language — write how your best rep talks.",
    ],
  },
  {
    id: "motion",
    label: "Sales motion",
    blurb: "How selling actually runs day to day.",
    fields: [
      {
        path: ["profile", "sales_motion"],
        label: "Sales motion",
        hint: "For example: outbound cold calling into SMB.",
        rows: 2,
      },
      {
        path: ["profile", "sales_motion_notes"],
        label: "Sales motion notes",
        hint: "How the motion actually runs — cycle length, who decides.",
        rows: 3,
      },
    ],
    lists: [],
    guidance: [
      "State the motion in one line: outbound, inbound, field, partner-led.",
      "Add the two facts that change coaching: cycle length and who signs.",
      "If discovery and demo are separate calls, say so — scoring reads this.",
    ],
  },
  {
    id: "icp",
    label: "ICP & buyer",
    blurb: "The customer this team should be winning.",
    fields: [
      {
        path: ["profile", "icp"],
        label: "Ideal customer",
        hint: "The buyer this team should be winning.",
        rows: 4,
      },
    ],
    lists: [],
    guidance: [
      "Describe the buyer, not just the company: role, pressure, budget.",
      "Include one disqualifier — who reps should politely walk away from.",
      "Concrete beats broad: “50–500 seat ops teams” over “companies”. ",
    ],
  },
  {
    id: "products",
    label: "Products & positioning",
    blurb: "What you sell, how you price it, and the value story.",
    fields: [
      {
        path: ["offering", "pricing_positioning", "pricing_notes"],
        label: "Pricing notes",
        hint: "Ranges, discounting rules, what reps may commit to.",
        rows: 3,
      },
      {
        path: ["offering", "pricing_positioning", "positioning_notes"],
        label: "Positioning",
        hint: "The value story that should land on every call.",
        rows: 3,
      },
    ],
    lists: ["products"],
    guidance: [
      "Pricing notes should say what a rep may promise without approval.",
      "Positioning is the sentence you want repeated on every call.",
      "Products ride along read-only below — they publish with the rest.",
    ],
  },
  {
    id: "objections",
    label: "Objections",
    blurb: "The pushback reps hear and the approved responses.",
    fields: [],
    lists: ["objections"],
    guidance: [
      "Strong objection entries pair the exact words a prospect uses with the response you want repeated.",
      "Three to five well-chosen objections beat a long unranked list.",
      "These entries come from your seeded context and publish as-is.",
    ],
  },
  {
    id: "competitors",
    label: "Competitors",
    blurb: "Who you lose to and how you position against them.",
    fields: [],
    lists: ["competitors"],
    guidance: [
      "Name the two or three you actually meet in deals, not the whole market.",
      "For each: the honest reason you win, in words reps can say.",
      "Never coach reps to rubbish a competitor — position, don't attack.",
    ],
  },
  {
    id: "compliance",
    label: "Compliance & no-go",
    blurb: "Language reps must avoid and disclosures they must make.",
    fields: [],
    lists: ["compliance"],
    guidance: [
      "No-go language is scored hard — keep it to genuinely banned phrases.",
      "Required disclosures should be word-for-word, not paraphrased.",
      "If regulation applies to you, this is the module to keep strongest.",
    ],
  },
  {
    id: "tone",
    label: "Tone & coaching style",
    blurb: "How Gravix should sound when it coaches your reps.",
    fields: [
      {
        path: ["tone", "playbook_guidance"],
        label: "Playbook guidance",
        hint: "The method reps are expected to follow.",
        rows: 3,
      },
      {
        path: ["tone", "tone_notes"],
        label: "Tone notes",
        hint: "How feedback should read — direct, supportive, formal.",
        rows: 3,
      },
    ],
    lists: [],
    guidance: [
      "Name the method if you use one — reps get coached towards it.",
      "One line on tone changes every piece of feedback: “direct but warm”.",
      "Say what great sounds like, not just what to avoid.",
    ],
  },
];

/* --------------------------- Helpers ----------------------------- */

function readPath(obj: Record<string, any> | null | undefined, path: string[]): string {
  let cur: any = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return "";
    cur = cur[key];
  }
  return typeof cur === "string" ? cur : "";
}

/** Immutably set a nested string, creating intermediate objects as needed. */
function writePath(
  obj: Record<string, any>,
  path: string[],
  value: string
): Record<string, any> {
  const [head, ...rest] = path;
  const next = { ...obj };
  if (rest.length === 0) {
    if (value.trim()) next[head] = value;
    else delete next[head]; // empty fields are omitted, matching the compiler
    return next;
  }
  const child = next[head] && typeof next[head] === "object" && !Array.isArray(next[head])
    ? next[head]
    : {};
  next[head] = writePath(child, rest, value);
  // Drop the branch entirely once it has emptied out.
  if (Object.keys(next[head]).length === 0) delete next[head];
  return next;
}

function asList(v: unknown): Record<string, any>[] {
  return Array.isArray(v)
    ? v.filter((e) => !!e && typeof e === "object" && !Array.isArray(e))
    : [];
}

function asTags(v: unknown): string[] {
  return Array.isArray(v)
    ? v.map((e) => (typeof e === "string" ? e.trim() : "")).filter(Boolean)
    : [];
}

/** Which of the six API sections carry any content. */
function sectionFilled(context: Record<string, any>, key: string): boolean {
  switch (key) {
    case "profile":
      return ["about", "sales_motion", "sales_motion_notes", "icp"].some((f) =>
        readPath(context, ["profile", f]).trim()
      );
    case "offering":
      return (
        asList(context?.offering?.products_services).length > 0 ||
        !!readPath(context, ["offering", "pricing_positioning", "pricing_notes"]).trim() ||
        !!readPath(context, ["offering", "pricing_positioning", "positioning_notes"]).trim()
      );
    case "objections":
      return asList(context?.objections).length > 0;
    case "competitors":
      return asList(context?.competitors).length > 0;
    case "compliance":
      return (
        asTags(context?.compliance?.no_go_language).length > 0 ||
        asTags(context?.compliance?.required_disclosures).length > 0
      );
    case "tone":
      return ["playbook_guidance", "tone_notes"].some((f) =>
        readPath(context, ["tone", f]).trim()
      );
    default:
      return false;
  }
}

const SECTION_KEYS = [
  "profile",
  "offering",
  "objections",
  "competitors",
  "compliance",
  "tone",
] as const;

type Strength = "empty" | "basic" | "strong";

const STRENGTH_LABELS: Record<Strength, string> = {
  empty: "Not taught",
  basic: "Basic",
  strong: "Strong",
};

/**
 * Deterministic strength per module, from the draft content only. "Strong"
 * needs every field filled with some depth (or a well-stocked list) — an
 * honest nudge, not a score, and it never blocks saving or publishing.
 */
function moduleStrength(m: ModuleDef, ctx: Record<string, any>): Strength {
  const fieldValues = m.fields.map((f) => readPath(ctx, f.path).trim());
  const filledFields = fieldValues.filter(Boolean).length;
  const fieldChars = fieldValues.join("").length;

  let listCount = 0;
  let listStrong = false;
  for (const kind of m.lists) {
    if (kind === "products") {
      const n = asList(ctx?.offering?.products_services).length;
      listCount += n;
      if (n >= 2) listStrong = true;
    } else if (kind === "objections") {
      const n = asList(ctx?.objections).length;
      listCount += n;
      if (n >= 3) listStrong = true;
    } else if (kind === "competitors") {
      const n = asList(ctx?.competitors).length;
      listCount += n;
      if (n >= 2) listStrong = true;
    } else {
      const noGo = asTags(ctx?.compliance?.no_go_language).length;
      const disclosures = asTags(ctx?.compliance?.required_disclosures).length;
      listCount += noGo + disclosures;
      if (noGo >= 3 || (noGo >= 1 && disclosures >= 1)) listStrong = true;
    }
  }

  const hasAny = filledFields > 0 || listCount > 0;
  if (!hasAny) return "empty";

  const fieldsStrong =
    m.fields.length > 0 && filledFields === m.fields.length && fieldChars >= 150;
  if (m.fields.length > 0 && m.lists.length > 0) {
    return fieldsStrong && listStrong ? "strong" : "basic";
  }
  if (m.fields.length > 0) return fieldsStrong ? "strong" : "basic";
  return listStrong ? "strong" : "basic";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* --------------------------- Component --------------------------- */

export default function ContextTab() {
  const [published, setPublished] = useState<ContextRow | null>(null);
  const [draftRow, setDraftRow] = useState<ContextRow | null>(null);

  // The full draft context object — the merge base for every save.
  const [draftContext, setDraftContext] = useState<Record<string, any>>({});
  // The last context we know the server holds, for a dirty check.
  const [savedContext, setSavedContext] = useState<Record<string, any>>({});

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<LoadError | null>(null);

  const [activeModule, setActiveModule] = useState<string>(MODULES[0].id);

  const [compiled, setCompiled] = useState<string>("");
  const [compiledState, setCompiledState] = useState<"published" | "draft">("published");
  const [compiledLoading, setCompiledLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  /* ------------------------- Loading ------------------------- */

  const load = useCallback(async () => {
    setLoaded(false);
    setLoadError(null);
    try {
      const res = await proxyFetch(`/v1/intelligence/context`, { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        setLoadError("forbidden");
        return;
      }
      const json = (await res.json()) as ContextResponse & { error?: string };
      if (res.status === 503 || json?.error === "context_engine_not_migrated") {
        setLoadError("not_migrated");
        return;
      }
      if (!res.ok || json?.ok !== true) {
        setLoadError("failed");
        return;
      }
      setPublished(json.published ?? null);
      setDraftRow(json.draft ?? null);

      // No draft yet? Start the working copy from the published version so a
      // first save can never publish a context that is emptier than today's.
      const base =
        json.draft?.context ??
        (json.published?.context ? { ...json.published.context } : {});
      setDraftContext(base);
      setSavedContext(json.draft?.context ?? base);
    } catch {
      setLoadError("failed");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadCompiled = useCallback(async (state: "published" | "draft") => {
    setCompiledLoading(true);
    try {
      const res = await proxyFetch(
        `/v1/intelligence/context/compiled?state=${state}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      setCompiled(res.ok && json?.ok ? String(json.compiled ?? "") : "");
    } catch {
      setCompiled("");
    } finally {
      setCompiledLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loaded && !loadError) void loadCompiled(compiledState);
  }, [loaded, loadError, compiledState, loadCompiled]);

  /* -------------------------- Actions ------------------------- */

  const dirty = useMemo(
    () => JSON.stringify(draftContext) !== JSON.stringify(savedContext),
    [draftContext, savedContext]
  );

  const onField = (path: string[], value: string) => {
    setDraftContext((prev) => writePath(prev, path, value));
    setNotice(null);
  };

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await proxyFetch(`/v1/intelligence/context`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // draftContext is the loaded object with edits merged in — the
        // structured lists ride along untouched.
        body: JSON.stringify({ context: draftContext }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok !== true) {
        setNotice({
          tone: "error",
          text:
            json?.error === "context_too_large"
              ? "That context is too large to save. Trim the longer fields and try again."
              : "Draft could not be saved. Nothing was changed.",
        });
        return;
      }
      setDraftRow(json.draft ?? null);
      setSavedContext(json.draft?.context ?? draftContext);
      setNotice({ tone: "ok", text: "Draft saved. Publish when you're ready for Gravix to use it." });
      if (compiledState === "draft") void loadCompiled("draft");
    } catch {
      setNotice({ tone: "error", text: "Draft could not be saved. Nothing was changed." });
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    setNotice(null);
    try {
      const res = await proxyFetch(`/v1/intelligence/context/publish`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || json?.ok !== true) {
        setNotice({
          tone: "error",
          text:
            json?.error === "no_draft_to_publish"
              ? "There's no draft to publish yet. Save a draft first."
              : "Publish failed. Your published context is unchanged.",
        });
        return;
      }
      setNotice({
        tone: "ok",
        text: `Published version ${json.published?.version ?? ""}. New calls will be scored with it.`.trim(),
      });
      await load();
      void loadCompiled(compiledState);
    } catch {
      setNotice({ tone: "error", text: "Publish failed. Your published context is unchanged." });
    } finally {
      setPublishing(false);
    }
  };

  /* -------------------------- Render -------------------------- */

  if (loaded && loadError === "forbidden") {
    return (
      <SectionCard padded>
        <EmptyState
          message="Intelligence is available to managers"
          sub="Ask your manager or administrator if you need access to company context."
        />
      </SectionCard>
    );
  }

  if (loaded && loadError === "not_migrated") {
    return (
      <SectionCard padded>
        <EmptyState
          message="The Context Engine isn't switched on for this environment yet"
          sub="Nothing is wrong with your data — this environment is missing the context tables."
          action={{ label: "Try again", onClick: () => void load() }}
        />
      </SectionCard>
    );
  }

  if (loaded && loadError === "failed") {
    return (
      <SectionCard padded>
        <EmptyState
          message="Company context is unavailable right now"
          sub="Your context hasn't changed — this is just a loading problem."
          action={{ label: "Try again", onClick: () => void load() }}
        />
      </SectionCard>
    );
  }

  if (!loaded) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-neutral-900/60" />
        ))}
      </div>
    );
  }

  const strengths = new Map(MODULES.map((m) => [m.id, moduleStrength(m, draftContext)]));
  const taughtCount = MODULES.filter((m) => strengths.get(m.id) !== "empty").length;
  const filledCount = SECTION_KEYS.filter((k) => sectionFilled(draftContext, k)).length;
  const objections = asList(draftContext?.objections);
  const hasDraftRow = !!draftRow;
  const active = MODULES.find((m) => m.id === activeModule) ?? MODULES[0];
  const activeStrength = strengths.get(active.id) ?? "empty";

  const draftStatus = !hasDraftRow
    ? "Not started"
    : dirty
    ? "Unsaved edits"
    : published && JSON.stringify(draftRow?.context) === JSON.stringify(published.context)
    ? "Matches published"
    : "Ready to publish";

  return (
    <div className="space-y-6">
      {/* WHAT THIS IS */}
      <p className="text-sm text-neutral-400">
        Context teaches Gravix your business — what you sell, how you price it and
        how your reps should sound. Published context is applied when calls are
        scored.
      </p>

      {/* HERO / STATUS BAND */}
      <SectionCard
        variant="ai"
        eyebrow="Company intelligence"
        title="Teach Gravix how your company sells"
        subtitle={
          published
            ? "Your published context shapes how every new call is scored and coached."
            : "Nothing is published yet — Gravix currently scores without company context."
        }
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-4">
          <HeroStat
            label="Published"
            value={published ? `v${published.version}` : "None"}
            detail={
              published
                ? `Published ${formatDate(published.published_at)}`
                : "Publish below when ready"
            }
          />
          <HeroStat
            label="Draft"
            value={draftStatus}
            detail={
              hasDraftRow
                ? `Last saved ${formatDate(draftRow?.updated_at ?? null)}`
                : "Edits start a draft"
            }
          />
          <HeroStat
            label="Modules taught"
            value={`${taughtCount}/${MODULES.length}`}
            detail={`${filledCount}/${SECTION_KEYS.length} sections in the compiled block`}
          />
          <HeroStat
            label="Objections taught"
            value={String(objections.length)}
            detail="Approved responses Gravix coaches towards"
          />
        </div>
      </SectionCard>

      {/* MODULE RAIL + FOCUS EDITOR */}
      <SectionCard
        eyebrow="Draft"
        title="Company knowledge"
        subtitle="Work one module at a time — everything saves together as one draft"
      >
        <div className="grid lg:grid-cols-[230px_minmax(0,1fr)]">
          {/* Rail */}
          <div className="flex gap-1 overflow-x-auto border-b border-neutral-900 p-2 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r">
            {MODULES.map((m) => {
              const s = strengths.get(m.id) ?? "empty";
              const isActive = m.id === activeModule;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setActiveModule(m.id)}
                  aria-pressed={isActive}
                  className={
                    isActive
                      ? "flex shrink-0 items-center justify-between gap-3 rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-2 text-left lg:w-full"
                      : "flex shrink-0 items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:bg-neutral-900/60 lg:w-full"
                  }
                >
                  <span
                    className={
                      isActive ? "text-xs font-medium text-brand-200" : "text-xs text-neutral-300"
                    }
                  >
                    {m.label}
                  </span>
                  <StrengthPill strength={s} />
                </button>
              );
            })}
          </div>

          {/* Focus editor */}
          <div className="min-w-0 px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-neutral-100">{active.label}</h3>
                <p className="mt-0.5 text-xs text-neutral-500">{active.blurb}</p>
              </div>
              <StrengthPill strength={activeStrength} withLabel />
            </div>

            {/* Editable fields */}
            {active.fields.length > 0 && (
              <div className="mt-4 space-y-5">
                {active.fields.map((field) => {
                  const value = readPath(draftContext, field.path);
                  return (
                    <div key={field.path.join(".")}>
                      <label
                        htmlFor={`ctx-${field.path.join("-")}`}
                        className="block text-xs font-medium text-neutral-300"
                      >
                        {field.label}
                      </label>
                      <p className="mt-0.5 text-[11px] text-neutral-500">{field.hint}</p>
                      <textarea
                        id={`ctx-${field.path.join("-")}`}
                        rows={field.rows}
                        maxLength={MAX_FIELD_CHARS}
                        value={value}
                        onChange={(e) => onField(field.path, e.target.value)}
                        className="mt-2 w-full resize-y rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-brand-500/50 focus:outline-none"
                        placeholder="Not taught yet"
                      />
                      <div className="mt-1 text-right text-[10px] tabular-nums text-neutral-600">
                        {value.length}/{MAX_FIELD_CHARS}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Read-only structured lists for this module */}
            {active.lists.length > 0 && (
              <div className="mt-4 rounded-lg border border-neutral-800/70 bg-neutral-950 px-4 py-3">
                <p className="text-[11px] text-neutral-500">
                  Read-only for now — these entries are part of your context and
                  publish with everything else.
                </p>
                <div className="mt-3 space-y-4">
                  {active.lists.includes("products") && (
                    <ReadOnlyList
                      title="Products & services"
                      empty="No products taught yet."
                      items={asList(draftContext?.offering?.products_services).map((p) => ({
                        head: String(p.name ?? "").trim(),
                        body: String(p.description ?? "").trim(),
                      }))}
                    />
                  )}
                  {active.lists.includes("objections") && (
                    <ReadOnlyList
                      title="Objections & approved responses"
                      empty="No objections taught yet."
                      items={asList(draftContext?.objections).map((o) => ({
                        head: String(o.objection ?? "").trim(),
                        body: String(o.approved_response ?? "").trim(),
                      }))}
                    />
                  )}
                  {active.lists.includes("competitors") && (
                    <ReadOnlyList
                      title="Competitors"
                      empty="No competitors taught yet."
                      items={asList(draftContext?.competitors).map((c) => ({
                        head: String(c.name ?? "").trim(),
                        body: String(c.positioning ?? c.notes ?? "").trim(),
                      }))}
                    />
                  )}
                  {active.lists.includes("compliance") && (
                    <ComplianceView
                      noGo={asTags(draftContext?.compliance?.no_go_language)}
                      disclosures={asTags(draftContext?.compliance?.required_disclosures)}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Static guidance — example copy only, nothing generated. */}
            <div className="mt-4 rounded-lg border border-neutral-800/70 bg-neutral-900/30 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                What strong context looks like
              </div>
              <ul className="mt-2 space-y-1.5">
                {active.guidance.map((g) => (
                  <li key={g} className="flex gap-2 text-[11px] leading-relaxed text-neutral-400">
                    <span className="text-neutral-600">—</span>
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-neutral-600">
                Static guidance. Gravix never writes your context for you — what
                you save here is exactly what scoring reads.
              </p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* COMPILED PREVIEW */}
      <SectionCard
        eyebrow="Preview"
        title="View as Gravix sees it"
        subtitle="The exact block handed to scoring — built from your context, no AI involved"
        actions={
          <div className="flex items-center gap-1">
            {(["published", "draft"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setCompiledState(s)}
                className={
                  compiledState === s
                    ? "rounded-md border border-brand-500/40 bg-brand-500/10 px-2.5 py-1 text-xs text-brand-300"
                    : "rounded-md border border-neutral-800 px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-300"
                }
              >
                {s === "published" ? "Published" : "Draft"}
              </button>
            ))}
          </div>
        }
      >
        <div className="px-5 py-4">
          {compiledLoading ? (
            <div className="h-24 animate-pulse rounded-lg bg-neutral-900/60" />
          ) : compiled ? (
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-xs leading-relaxed text-neutral-300">
              {compiled}
            </pre>
          ) : (
            <p className="text-xs text-neutral-600">
              {compiledState === "published"
                ? "Nothing published yet — calls are scored without company context."
                : "Your draft is empty, so it would add nothing to scoring."}
            </p>
          )}
        </div>
      </SectionCard>

      {/* SAVE / PUBLISH */}
      <div className="sticky bottom-4 rounded-xl border border-neutral-800 bg-neutral-950/95 p-4 shadow-lg shadow-black/40 backdrop-blur">
        {notice && (
          <p
            className={
              notice.tone === "ok"
                ? "mb-3 text-xs text-brand-300"
                : "mb-3 text-xs text-danger-300"
            }
          >
            {notice.text}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-neutral-500">
            {dirty
              ? "You have unsaved changes. Saving updates the draft only — scoring keeps using the published version."
              : "Publishing creates a new version and affects future scoring only. Calls already scored keep their scores — nothing is re-scored. The previous version is archived, never deleted."}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => void save()} disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save draft"}
            </Button>
            <Button
              variant="primary"
              onClick={() => void publish()}
              disabled={publishing || !hasDraftRow || dirty}
              title={
                dirty
                  ? "Save your draft before publishing"
                  : !hasDraftRow
                  ? "Save a draft before publishing"
                  : undefined
              }
            >
              {publishing ? "Publishing…" : "Publish context"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------- Sub-components ------------------------ */

function HeroStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-neutral-100">{value}</div>
      <div className="mt-0.5 text-[11px] text-neutral-500">{detail}</div>
    </div>
  );
}

function StrengthPill({
  strength,
  withLabel = false,
}: {
  strength: Strength;
  withLabel?: boolean;
}) {
  const cls =
    strength === "strong"
      ? "inline-flex items-center rounded-full border border-success-500/30 bg-success-500/10 px-2 py-0.5 text-[10px] text-success-300"
      : strength === "basic"
      ? "inline-flex items-center rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-400"
      : "inline-flex items-center rounded-full border border-warning-500/30 bg-warning-500/10 px-2 py-0.5 text-[10px] text-warning-300";
  return (
    <span className={cls}>
      {STRENGTH_LABELS[strength]}
      {withLabel && strength === "empty" ? " — fill it in below" : ""}
    </span>
  );
}

function ComplianceView({ noGo, disclosures }: { noGo: string[]; disclosures: string[] }) {
  if (noGo.length === 0 && disclosures.length === 0) {
    return <p className="text-xs text-neutral-600">No compliance guidance taught yet.</p>;
  }
  return (
    <div className="space-y-1.5 text-xs text-neutral-400">
      {noGo.length > 0 && (
        <p>
          <span className="text-neutral-200">Never say:</span> {noGo.join(" · ")}
        </p>
      )}
      {disclosures.map((d) => (
        <p key={d}>
          <span className="text-neutral-200">Required disclosure:</span> {d}
        </p>
      ))}
    </div>
  );
}

function ReadOnlyList({
  title,
  items,
  empty,
}: {
  title: string;
  items: { head: string; body: string }[];
  empty: string;
}) {
  const visible = items.filter((i) => i.head || i.body);
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium text-neutral-300">{title}</span>
        {visible.length > 0 && (
          <span className="text-[10px] tabular-nums text-neutral-600">{visible.length}</span>
        )}
      </div>
      {visible.length === 0 ? (
        <p className="mt-1 text-xs text-neutral-600">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {visible.map((item, i) => (
            <li key={`${item.head}-${i}`} className="text-xs text-neutral-400">
              {item.head && <span className="text-neutral-200">{item.head}</span>}
              {item.head && item.body && <span className="text-neutral-600"> — </span>}
              {item.body}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
