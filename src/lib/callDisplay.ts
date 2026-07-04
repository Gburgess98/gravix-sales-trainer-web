// Day 172 — human-friendly call identity for demo-facing cards.
// Gravix listens to the call; labels should read like a coaching moment,
// not a storage artefact (raw filenames, UUIDs, "Weakest: Unknown").

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const AUDIO_EXT_RE = /\.(mp3|wav|m4a|mp4|ogg|webm|aac|flac)$/i;
const SEED_FILE_RE = /^demo-call-\d+/i;

/** True when a label looks like a raw filename / UUID / storage path. */
export function isRawCallLabel(label: string | null | undefined): boolean {
  const s = String(label ?? "").trim();
  if (!s) return true;
  if (UUID_RE.test(s)) return true;
  if (AUDIO_EXT_RE.test(s)) return true;
  if (SEED_FILE_RE.test(s)) return true;
  if (s.includes("/")) return true;
  return false;
}

/** Calm weakest-skill copy: never "Unknown" in demo-facing UI. */
export function weakestSkillLabel(weakest: string | null | undefined): string {
  const s = String(weakest ?? "").trim();
  if (!s || /^unknown$/i.test(s)) return "Needs review";
  return s;
}

/**
 * Best human title for a call card/header.
 * - explicit human title/filename wins
 * - else "Rep — Skill Coaching Call"
 * - else "Rep — Sales Call"
 * - else "Sales call review"
 */
export function formatCallDisplayTitle(opts: {
  title?: string | null;
  repName?: string | null;
  weakestSkill?: string | null;
}): string {
  const title = String(opts.title ?? "").trim();
  if (title && !isRawCallLabel(title)) return title;

  const repRaw = String(opts.repName ?? "").trim();
  const rep = repRaw && !/^unknown( rep)?$/i.test(repRaw) ? repRaw : "";
  const weakRaw = String(opts.weakestSkill ?? "").trim();
  const weak = weakRaw && !/^unknown$/i.test(weakRaw) ? weakRaw : "";

  if (rep && weak) return `${rep} — ${weak} Coaching Call`;
  if (rep) return `${rep} — Sales Call`;
  return "Sales call review";
}
