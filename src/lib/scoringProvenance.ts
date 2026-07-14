// Day 223 — Intelligence Layer provenance for the call review page.
//
// Normalises `calls.rubric._meta` (stamped by the Day 221 scoring runtime,
// proven live on Day 222) into calm, honest display labels. Three rules
// govern this module:
//   1. Never claim more than the data says. No `_meta` at all (every call
//      scored before Day 221, including the UFC hero call) reads exactly like
//      today: the Gravix default rubric. Absent context is never rendered as
//      "context applied".
//   2. Never surface raw identifiers as a visible label. A scorecard whose
//      name is missing or UUID-shaped falls back to a safe human label — but
//      still reports that a company scorecard was used, because it was.
//   3. Pure and defensive — any shape may arrive from an old row, so every
//      field is read through a guard and nothing here throws.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The built-in rubric's display name — also what the API stamps by default. */
export const GRAVIX_DEFAULT_RUBRIC_LABEL = "Gravix default rubric";
/** Shown when a company scorecard was used but cannot be safely named. */
export const UNNAMED_COMPANY_SCORECARD_LABEL = "Company scorecard";

export type ScoringProvenance = {
  /** Primary "scored with" label. Always safe to render. */
  scorecardLabel: string;
  /** Short provenance chip ("Company default" / "Gravix default"). */
  scorecardSourceLabel: string;
  /** "Company context vN applied", or null when no context was used. */
  contextLabel: string | null;
  /** Scoring model/version, or null. Secondary detail only. */
  modelLabel: string | null;
  hasCustomScorecard: boolean;
  hasCompanyContext: boolean;
  /** Full identifiers for a hover title — never a prominent label. */
  detailTitle: string | null;
};

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function positiveInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/** A name is displayable only if it exists and is not a raw identifier. */
function displayableName(name: string): boolean {
  if (!name) return false;
  if (UUID_RE.test(name)) return false;
  return true;
}

/**
 * Normalise scoring provenance from a call's rubric._meta.
 *
 * @param rubric      the call's `rubric` column (any shape, may be null)
 * @param fallbackModel `calls.ai_model`, used when _meta carries no model
 */
export function getScoringProvenance(
  rubric: any,
  fallbackModel?: string | null
): ScoringProvenance {
  const meta = rubric && typeof rubric === "object" ? rubric._meta ?? null : null;

  const source = text(meta?.scorecard_source);
  const name = text(meta?.scorecard_name);
  const version = positiveInt(meta?.scorecard_version);
  const contextVersion = positiveInt(meta?.context_version);

  // Only these two sources mean a company-authored scorecard was used.
  // Anything else — including "gravix_default", an unknown value, or no
  // _meta at all — is the built-in rubric.
  const hasCustomScorecard = source === "custom" || source === "company_default";

  let scorecardLabel: string;
  if (!hasCustomScorecard) {
    scorecardLabel = GRAVIX_DEFAULT_RUBRIC_LABEL;
  } else if (displayableName(name)) {
    scorecardLabel = version ? `${name} v${version}` : name;
  } else {
    // A company scorecard was genuinely used; we just cannot name it safely.
    scorecardLabel = version
      ? `${UNNAMED_COMPANY_SCORECARD_LABEL} v${version}`
      : UNNAMED_COMPANY_SCORECARD_LABEL;
  }

  let scorecardSourceLabel: string;
  if (source === "custom") scorecardSourceLabel = "Call-type scorecard";
  else if (source === "company_default") scorecardSourceLabel = "Company default";
  else scorecardSourceLabel = "Gravix default";

  const modelLabel = text(meta?.scoring_model_version) || text(fallbackModel) || null;

  const detailParts: string[] = [];
  const scorecardId = text(meta?.scorecard_id);
  const versionId = text(meta?.scorecard_version_id);
  const publishedAt = text(meta?.context_published_at);
  const rubricVersion = text(meta?.rubric_version);
  if (scorecardId) detailParts.push(`Scorecard ${scorecardId}`);
  if (versionId) detailParts.push(`Version ${versionId}`);
  if (rubricVersion) detailParts.push(`Rubric ${rubricVersion}`);
  if (publishedAt) detailParts.push(`Context published ${publishedAt}`);

  return {
    scorecardLabel,
    scorecardSourceLabel,
    contextLabel: contextVersion ? `Company context v${contextVersion} applied` : null,
    modelLabel,
    hasCustomScorecard,
    hasCompanyContext: contextVersion != null,
    detailTitle: detailParts.length ? detailParts.join(" · ") : null,
  };
}
