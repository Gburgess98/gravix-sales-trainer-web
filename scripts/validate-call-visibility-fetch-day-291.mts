/**
 * Day 291 — regression validator for Call Library's org call-visibility read.
 *
 * Before this fix (deployed b337050) the visibility policy was read with a raw
 *   fetch("/api/proxy/v1/admin/org-settings", { headers: { "x-user-id": … } })
 * using a legacy localStorage identity header, and the state defaulted to
 * "everyone" — so ANY failure (the endpoint is manager-only, so every non-manager
 * read fails; plus transport/5xx) silently left the UI claiming "everyone" and
 * ENABLED the Company-calls toggle. Company scope is enforced server-side in
 * /v1/calls/paged, so this leaked no data, but it presented a misleading control.
 *
 * This validator statically asserts the Day 291 contract so it cannot regress:
 *   1. Canonical auth — the policy read goes through proxyFetch (Bearer +
 *      x-user-id injected by the helper); no raw /api/proxy fetch and no legacy
 *      identity header (x-user-id / localStorage uid) remain in the page.
 *   2. Honest failure — visibility defaults to "unknown", is only ever set from a
 *      validated API value (never a hard-coded "everyone"), and any failed/unknown
 *      read resolves to "unknown".
 *   3. Never broadens scope — Company is offered only when visibility ===
 *      "everyone"; unknown/failed keeps the UI at "mine".
 *
 * Runs on Node's native type stripping — no network, no secrets. Usage:
 *   node scripts/validate-call-visibility-fetch-day-291.mts
 *
 * Non-vacuity: checks below fail against b337050 (raw fetch + x-user-id + default
 * "everyone"). Proven by running against that revision.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
let fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) console.log(`OK    ${label}`);
  else {
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    fail = 1;
  }
}
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

console.log("Day 291 — Call Library visibility fetch hardening (no network, no secrets)\n");

const page = read("src/app/call-library/page.tsx");

// Isolate the visibility loader for tighter, non-vacuous checks.
function slice(from: string, to: string): string {
  const a = page.indexOf(from);
  if (a < 0) return "";
  const b = page.indexOf(to, a + from.length);
  return b > a ? page.slice(a, b) : "";
}
const loader = slice("const loadVisibility", "useEffect(() => {\n    void loadVisibility");

// ── 1. Canonical authenticated proxy path (no legacy identity) ────────────────
console.log("── canonical authenticated policy read ──");
check("visibility read uses proxyFetch('/v1/admin/org-settings')", /proxyFetch\(\s*["']\/v1\/admin\/org-settings["']/.test(page));
check("page imports the proxyFetch helper", /import\s*\{[^}]*\bproxyFetch\b[^}]*\}\s*from\s*["']@\/lib\/api["']/.test(page));
check("NO raw /api/proxy fetch remains in the page", !/\bfetch\(\s*[`'"]\/api\/proxy/.test(page));
check("NO legacy x-user-id header remains", !/["']x-user-id["']/i.test(page));
check("NO legacy localStorage uid identity remains", !/localStorage\.getItem\(\s*["']uid["']\s*\)/.test(page));

// ── 2. Honest failure policy — never silently "everyone" ──────────────────────
console.log("\n── honest failure policy ──");
check("visibility state defaults to 'unknown' (not 'everyone')", /useState<[^>]*>\(\s*["']unknown["']\s*\)/.test(page));
check("visibility is never hard-coded to 'everyone'", !/setVisibility\(\s*["']everyone["']\s*\)/.test(page));
check("loader located", loader.length > 0);
check("loader sets 'unknown' on non-policy / failed read", (loader.match(/setVisibility\(\s*["']unknown["']\s*\)/g) || []).length >= 2, `${(loader.match(/setVisibility\(\s*["']unknown["']\s*\)/g) || []).length} sites`);
check("loader only accepts validated policy values", /v === "everyone"[\s\S]*?v === "managers"[\s\S]*?v === "disabled"/.test(loader));
check("loader gates the success set on r.ok", /if\s*\(\s*r\.ok\s*&&/.test(loader));

// ── 3. Failure/unknown can never broaden scope ────────────────────────────────
console.log("\n── unknown/failed policy cannot broaden scope ──");
check("Company toggle offered only when visibility === 'everyone'", /disabled:\s*visibility\s*!==\s*["']everyone["']/.test(page));
check("paged scope opens to company only when visibility === 'everyone'", (page.match(/visibility === "everyone"\s*\n?\s*\?\s*callScope\s*:\s*"mine"/g) || []).length >= 2, `${(page.match(/visibility === "everyone"\s*\n?\s*\?\s*callScope\s*:\s*"mine"/g) || []).length} sites`);
check("restricted policy forces callScope back to 'mine'", /visibility\s*!==\s*["']everyone["'][\s\S]{0,80}setCallScope\(\s*["']mine["']\s*\)/.test(page));

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — Day 291 call-visibility fetch validator.`);
process.exit(fail);
