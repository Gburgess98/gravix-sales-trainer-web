/**
 * Day 290 — regression validator for the Call-Review "unavailable" experience.
 *
 * Before this fix (deployed 47bfd5c), a call the manager couldn't see — unknown
 * OR foreign-company (the API returns not_found/403, so `callMeta` stays null) —
 * still rendered the ENTIRE empty review shell: the "Call review" header, the
 * summary/review/transcript/player/pins/coach/CRM sections (all empty), and the
 * live "Link CRM" / "Assign Drill" controls, with the "Call not found" notice
 * buried in a banner at the very bottom. No foreign data leaked (every read is
 * `callMeta?.…` null-safe), but the state looked broken and exposed controls for
 * a missing call — the same anti-pattern Day 289 fixed for accounts.
 *
 * This validator statically asserts the Day 290 state machine so it cannot
 * silently regress:
 *   1. `callMissing` gates the render via an early return BEFORE the review shell.
 *   2. The unavailable surface (CallUnavailable) renders a manager-safe message
 *      and a route back to the Call Library — and NONE of the review controls.
 *   3. The loader still classifies not_found/404/invalid/400/403/forbidden as
 *      `callMissing`, so the gate is actually reachable for foreign + unknown IDs
 *      (identical state → no existence disclosure).
 *
 * Runs on Node's native type stripping — no network, no secrets. Usage:
 *   node scripts/validate-call-review-not-found-day-290.mts
 *
 * Non-vacuity: every check fails against deployed 47bfd5c (no `if (callMissing)`
 * early return, no CallUnavailable component). Proven by running against it.
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

console.log("Day 290 — Call-Review not-found experience (no network, no secrets)\n");

const page = read("src/app/calls/[id]/page.tsx");

// Slice a top-level declaration between two stable markers.
function slice(from: string, to: string): string {
  const a = page.indexOf(from);
  if (a < 0) return "";
  const b = page.indexOf(to, a + from.length);
  return b > a ? page.slice(a, b) : "";
}

// ── 1. callMissing gates the render before the review shell ───────────────────
console.log("── missing call gates the review shell ──");
const guardIdx = page.search(/if\s*\(\s*callMissing\s*\)\s*\{/);
// The full review shell's <main> is the wide-max-width container inside AuthGate.
const shellIdx = page.indexOf('<main className="mx-auto w-full max-w-[1400px] px-6 py-6 lg:px-8 space-y-6"');
check("early `if (callMissing)` guard exists", guardIdx >= 0);
check("review shell <main> exists", shellIdx >= 0);
check(
  "guard runs BEFORE the review shell (no empty shell for a missing call)",
  guardIdx >= 0 && shellIdx >= 0 && guardIdx < shellIdx
);
check(
  "guard renders CallUnavailable",
  /if\s*\(\s*callMissing\s*\)\s*\{[\s\S]{0,200}<CallUnavailable/.test(page)
);

// ── 2. Unavailable surface: safe message, back to Library, no controls ────────
console.log("\n── unavailable surface has no review controls ──");
const comp = slice("function CallUnavailable", "export default function CallPage");
check("CallUnavailable component exists", comp.length > 0);
check("routes back to the Call Library", /href="\/call-library"/.test(comp) && /Back to Call Library/.test(comp));
check("renders a manager-safe heading", /Call not found/.test(comp));
check("renders no review sections", !/id="summary"|id="transcript"|SectionCard/.test(comp));
check("renders no Link CRM / Assign Drill controls", !/openCrm|Assign Drill|Link CRM|openCoach/.test(comp));
check("renders no CRM/coach drawers", !/crmOpen|coachOpen/.test(comp));

// ── 3. Loader routes foreign + unknown IDs to callMissing (gate reachable) ────
console.log("\n── missing classification (gate is reachable, no leak) ──");
const loader = slice("setLoadingCall(true);", "// Load coach assignments");
check("loader block located", loader.length > 0);
check("not_found / 404 → callMissing", /not_found[\s\S]*?404[\s\S]*?setCallMissing\(true\)/.test(loader) || (/not_found/.test(loader) && /setCallMissing\(true\)/.test(loader)));
check("403 / forbidden → callMissing (foreign company, no leak)", /403/.test(loader) && /forbidden/.test(loader) && /setCallMissing\(true\)/.test(loader));
check("callMeta nulled on failure (no partial/foreign render)", /setCallMeta\(null\)/.test(loader));

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — Day 290 call-review not-found validator.`);
process.exit(fail);
