"use client";

// Intelligence Layer — Day 225: Context Engine tab (manager MVP).
//
// Backed entirely by the Day 218 API (manager-gated, company-scoped):
//   GET  /v1/intelligence/context            draft + published rows
//   PUT  /v1/intelligence/context            save the draft only
//   POST /v1/intelligence/context/publish    publish the draft as a new version
//   GET  /v1/intelligence/context/compiled   deterministic compiled block
//
// Scope decisions for this MVP (deliberate, see PREMIUM_UX_AUDIT.md §Day 225):
//  - Editing covers the free-text fields only. The structured lists (products,
//    objections, competitors, compliance) are READ-ONLY here — they need real
//    repeater editors, which is a later lane. They are still rendered so the
//    manager sees the whole picture rather than a page that pretends they
//    don't exist.
//  - No AI Autofill, no website scraping, no "AI assistant" — none of that
//    exists in the API, so none of it is drawn here.
//
// SAFETY — the PUT replaces the entire draft context object. Every save must
// therefore start from the context we loaded and merge the edited fields into
// it, so the untouched structured lists survive round-trips. Never build the
// payload from the form fields alone: that would silently delete the seeded
// products/objections/competitors on the first save.

import { useCallback, useEffect, useMemo, useState } from "react";
import { proxyFetch } from "@/lib/api";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
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
// this map must never invent a section.

type FieldDef = { path: string[]; label: string; hint: string; rows: number };
type FieldGroup = { key: string; title: string; blurb: string; fields: FieldDef[] };

const MAX_FIELD_CHARS = 1000; // API clips at 1,000 per field

const FIELD_GROUPS: FieldGroup[] = [
  {
    key: "profile",
    title: "Company profile",
    blurb: "Who you are and who you sell to.",
    fields: [
      {
        path: ["profile", "about"],
        label: "About the company",
        hint: "What the company does, in the words you'd use on a call.",
        rows: 4,
      },
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
      {
        path: ["profile", "icp"],
        label: "Ideal customer",
        hint: "The buyer this team should be winning.",
        rows: 3,
      },
    ],
  },
  {
    key: "offering",
    title: "Pricing & positioning",
    blurb: "How you price and how you frame value.",
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
  },
  {
    key: "tone",
    title: "Tone & coaching style",
    blurb: "How Gravix should coach your reps.",
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

const SECTION_LABELS: Record<string, string> = {
  profile: "Company profile",
  offering: "Products & pricing",
  objections: "Objections",
  competitors: "Competitors",
  compliance: "Compliance",
  tone: "Tone",
};

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

  const filledCount = SECTION_KEYS.filter((k) => sectionFilled(draftContext, k)).length;
  const products = asList(draftContext?.offering?.products_services);
  const objections = asList(draftContext?.objections);
  const competitors = asList(draftContext?.competitors);
  const noGo = asTags(draftContext?.compliance?.no_go_language);
  const disclosures = asTags(draftContext?.compliance?.required_disclosures);
  const hasDraftRow = !!draftRow;

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

      {/* STATUS */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Published context"
          value={published ? `v${published.version}` : "None"}
          subtext={
            published
              ? `Published ${formatDate(published.published_at)}`
              : "Gravix scores without company context"
          }
          variant={published ? "default" : "warning"}
        />
        <StatCard
          label="Draft"
          value={draftStatus}
          subtext={
            hasDraftRow
              ? `Last saved ${formatDate(draftRow?.updated_at ?? null)}`
              : "Edits start a draft — publishing stays a separate step"
          }
          variant={dirty ? "warning" : "default"}
        />
        <StatCard
          label="Sections with content"
          value={`${filledCount}/${SECTION_KEYS.length}`}
          subtext="Empty sections are simply left out"
        />
        <StatCard
          label="Objections taught"
          value={objections.length}
          subtext="Approved responses Gravix can coach towards"
        />
      </div>

      {/* SECTION COMPLETENESS */}
      <SectionCard
        eyebrow="Coverage"
        title="What Gravix knows"
        subtitle="Each section you fill in is added to the block Gravix reads when scoring"
      >
        <div className="flex flex-wrap gap-2 px-5 py-4">
          {SECTION_KEYS.map((key) => {
            const filled = sectionFilled(draftContext, key);
            return (
              <span
                key={key}
                className={
                  filled
                    ? "inline-flex items-center gap-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs text-brand-300"
                    : "inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-500"
                }
              >
                {SECTION_LABELS[key]}
                <span className="text-[10px] uppercase tracking-wider opacity-70">
                  {filled ? "Taught" : "Empty"}
                </span>
              </span>
            );
          })}
        </div>
      </SectionCard>

      {/* EDITOR */}
      {FIELD_GROUPS.map((group) => (
        <SectionCard key={group.key} eyebrow="Draft" title={group.title} subtitle={group.blurb}>
          <div className="space-y-5 px-5 py-4">
            {group.fields.map((field) => {
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
        </SectionCard>
      ))}

      {/* READ-ONLY STRUCTURED SECTIONS */}
      <SectionCard
        eyebrow="Reference"
        title="Products, objections & competitors"
        subtitle="Read-only for now — these are part of your published context and are used when scoring"
      >
        <div className="space-y-5 px-5 py-4">
          <ReadOnlyList
            title="Products & services"
            empty="No products taught yet."
            items={products.map((p) => ({
              head: String(p.name ?? "").trim(),
              body: String(p.description ?? "").trim(),
            }))}
          />
          <ReadOnlyList
            title="Objections & approved responses"
            empty="No objections taught yet."
            items={objections.map((o) => ({
              head: String(o.objection ?? "").trim(),
              body: String(o.approved_response ?? "").trim(),
            }))}
          />
          <ReadOnlyList
            title="Competitors"
            empty="No competitors taught yet."
            items={competitors.map((c) => ({
              head: String(c.name ?? "").trim(),
              body: String(c.positioning ?? c.notes ?? "").trim(),
            }))}
          />
          <div>
            <div className="text-xs font-medium text-neutral-300">Compliance</div>
            {noGo.length === 0 && disclosures.length === 0 ? (
              <p className="mt-1 text-xs text-neutral-600">No compliance guidance taught yet.</p>
            ) : (
              <div className="mt-2 space-y-1.5 text-xs text-neutral-400">
                {noGo.length > 0 && <p>Never say: {noGo.join(" · ")}</p>}
                {disclosures.map((d) => (
                  <p key={d}>Required disclosure: {d}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* COMPILED PREVIEW */}
      <SectionCard
        eyebrow="Preview"
        title="What Gravix reads"
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
