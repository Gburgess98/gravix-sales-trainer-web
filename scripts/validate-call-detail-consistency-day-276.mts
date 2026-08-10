/**
 * Day 276 — regression validator for Call Library ↔ Call detail consistency.
 *
 * A stale-state defect let the call detail page show a PREVIOUS call's score
 * while the current call failed/loaded: the fetch effect set `callMeta` only on
 * success and never reset it when `callId` changed, and 4xx/"invalid id" loads
 * were not treated as "missing". Combined with duplicate invalid-UUID fixture
 * twins in staging, the library score (from `score_overall`) and the detail score
 * could disagree, e.g. a stale score shown next to "no scored rubric".
 *
 * This validator statically asserts the fix so it cannot regress. Runs on Node's
 * native type stripping — no network, no secrets. Usage:
 *   node scripts/validate-call-detail-consistency-day-276.mts
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
let fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) console.log(`OK    ${label}`);
  else { console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`); fail = 1; }
}
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const count = (s: string, re: RegExp) => (s.match(re) || []).length;

console.log("Day 276 — Call Library ↔ detail consistency (no network, no secrets)\n");

const detail = read("src/app/calls/[id]/page.tsx");
const library = read("src/app/call-library/page.tsx");

// ── 1. Detail page resets per-call state on callId change (no stale bleed) ─────
console.log("── detail page never shows a previous call's data ──");
check("detail resets callMeta to null on load/failure (>= 2 sites)", count(detail, /setCallMeta\(\s*null\s*\)/g) >= 2, `${count(detail, /setCallMeta\(\s*null\s*\)/g)} found`);
check("detail resets callMissing + err alongside callMeta", /setCallMeta\(\s*null\s*\)\s*;[\s\S]{0,120}setCallMissing\(\s*false\s*\)/.test(detail) || /setCallMeta\(\s*null\s*\)[\s\S]{0,200}setErr\(/.test(detail));
check("the call fetch effect is keyed on [callId]", /getCallViaProxy\(callId\)[\s\S]*?\}\s*,\s*\[callId\]\s*\)/.test(detail));

// ── 2. Failed / unusable ids show the honest 'missing' state ──────────────────
console.log("\n── unusable ids fail honestly (not a stale render) ──");
check("invalid-UUID ('invalid id') treated as missing", /invalid id/.test(detail) && /setCallMissing\(\s*true\s*\)/.test(detail));
check("403/forbidden treated as missing", /forbidden/.test(detail) || /403/.test(detail));
check("error branch clears callMeta (no stale score on failure)", /catch[\s\S]{0,200}setCallMeta\(\s*null\s*\)/.test(detail));

// ── 3. Library and detail read the SAME score field ───────────────────────────
console.log("\n── library and detail bind to the same score (score_overall) ──");
check("detail header score derives from callMeta.score_overall", /const\s+overall[\s\S]{0,80}callMeta\?\.score_overall/.test(detail));
check("detail displayOverall is derived from overall", /displayOverall\s*=\s*[^;]*overall/.test(detail));
check("library row score uses c.score_overall", /score_overall/.test(library) && /Math\.round\(c\.score_overall\)/.test(library));
check("library links to /calls/<id> by the row's own id", /href=\{`\/calls\/\$\{c\.id\}`\}/.test(library));

// ── 4. No hardcoded placeholder score in the detail header ────────────────────
console.log("\n── no fabricated/placeholder detail score ──");
// The only literal default is the Slack preview href fallback (overall ?? 80),
// which is not the rendered header. The header must come from displayOverall.
check("header ScorePill renders displayOverall (not a literal)", /<ScorePill\s+score=\{displayOverall\}/.test(detail));
check("no stray 2-digit score literal wired into the header pill", !/<ScorePill\s+score=\{\s*\d{2}\s*\}/.test(detail));

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — Day 276 call-detail consistency validator.`);
process.exit(fail);
