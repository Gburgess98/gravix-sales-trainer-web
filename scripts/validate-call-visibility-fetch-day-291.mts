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

// NOTE (Day 292): the call-library visibility read was superseded by a stronger
// PER-CALLER access probe (org policy alone wrongly disabled assigned managers).
// The Day 291 CONTRACT is unchanged — canonical auth, honest failure, and
// never-broaden — so this validator now tracks the same three guarantees on the
// current mechanism (companyAccess), while validate-company-policy-ui-day-292.mts
// is the authoritative non-vacuity proof for the Day 292 fix.
const page = read("src/app/call-library/page.tsx");

// Isolate the access loader for tighter, non-vacuous checks.
function slice(from: string, to: string): string {
  const a = page.indexOf(from);
  if (a < 0) return "";
  const b = page.indexOf(to, a + from.length);
  return b > a ? page.slice(a, b) : "";
}
const loader = slice("const loadCompanyAccess", "useEffect(() => {\n    void loadCompanyAccess");

// ── 1. Canonical authenticated proxy path (no legacy identity) ────────────────
console.log("── canonical authenticated access read ──");
check("access read uses proxyFetch('/v1/calls/paged?scope=company')", /proxyFetch\(\s*["']\/v1\/calls\/paged\?scope=company[^"']*["']/.test(loader));
check("page imports the proxyFetch helper", /import\s*\{[^}]*\bproxyFetch\b[^}]*\}\s*from\s*["']@\/lib\/api["']/.test(page));
check("NO raw /api/proxy fetch remains in the page", !/\bfetch\(\s*[`'"]\/api\/proxy/.test(page));
check("NO legacy x-user-id header remains", !/["']x-user-id["']/i.test(page));
check("NO legacy localStorage uid identity remains", !/localStorage\.getItem\(\s*["']uid["']\s*\)/.test(page));

// ── 2. Honest failure policy — never silently broadens ────────────────────────
console.log("\n── honest failure policy ──");
check("access state defaults to 'unknown' (not 'allowed')", /useState<[^>]*>\(\s*["']unknown["']\s*\)/.test(page));
check("access is never hard-coded to 'allowed' outside the loader", !/setCompanyAccess\(\s*["']allowed["']\s*\)/.test(page.slice(0, page.indexOf("const loadCompanyAccess"))));
check("loader located", loader.length > 0);
check("loader falls back to 'unknown' on non-verdict / failed read", (loader.match(/setCompanyAccess\(\s*["']unknown["']\s*\)/g) || []).length >= 2, `${(loader.match(/setCompanyAccess\(\s*["']unknown["']\s*\)/g) || []).length} sites`);
check("loader distinguishes disabled vs manager-only denial", /company_calls_disabled/.test(loader) && /manager_only_access/.test(loader));
check("loader grants 'allowed' only on r.ok", /if\s*\(\s*r\.ok\s*\)[\s\S]{0,80}setCompanyAccess\(\s*["']allowed["']\s*\)/.test(loader));

// ── 3. Failure/unknown can never broaden scope ────────────────────────────────
console.log("\n── unknown/failed access cannot broaden scope ──");
check("Company toggle offered only when access === 'allowed'", /disabled:\s*companyAccess\s*!==\s*["']allowed["']/.test(page));
check("paged scope opens to company only when access === 'allowed'", (page.match(/companyAccess === "allowed"\s*\n?\s*\?\s*callScope\s*:\s*"mine"/g) || []).length >= 2, `${(page.match(/companyAccess === "allowed"\s*\n?\s*\?\s*callScope\s*:\s*"mine"/g) || []).length} sites`);
check("non-allowed access forces callScope back to 'mine'", /companyAccess\s*!==\s*["']allowed["'][\s\S]{0,80}setCallScope\(\s*["']mine["']\s*\)/.test(page));

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — Day 291 call-visibility fetch validator.`);
process.exit(fail);
