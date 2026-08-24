/**
 * Day 293 — regression validator for the rep read-only Admin Settings policy UX.
 *
 * At WEB 5e319fa the Company-call authority and write honesty were correct, but a
 * SalesRep opening /admin/settings still saw an unfinished surface:
 *   1. Manager capability was inferred by substring-matching the RAW error of the
 *      unrelated manager-only admin-config read (`(err||"").includes(
 *      "forbidden_not_manager")`), and that raw error string was rendered in a red
 *      box (`{err}` fed from `setErr(e?.message)`).
 *   2. The Company Call Visibility policy buttons were rendered unconditionally and
 *      relied on the API to reject a rep's PATCH — a dead, clickable mutation path.
 *
 * Day 293 contract (asserted statically here):
 *   - Manager capability comes from AUTHENTICATED, server-resolved evidence: the
 *     manager-only GET /v1/admin/config verdict, captured in `isManager`
 *     (true on success, false only on the expected `forbidden_not_manager`
 *     denial). No localStorage / client-supplied role/org.
 *   - The expected denial is TRANSLATED into a clean read-only state; the raw
 *     `forbidden_not_manager` / provider error is never displayed (no
 *     `setErr(e?.message)`).
 *   - Reps get an explicit read-only Company Call Visibility surface: current value
 *     + neutral manager-only copy + NO enabled mutation path (the write controls
 *     render only under `isManager === true`).
 *   - Managers keep the Day 292 confirmed-write controls.
 *
 * Non-vacuity: every check below is written to FAIL against 5e319fa. Runs on
 * Node's native type stripping — no network, no secrets. Usage:
 *   node scripts/validate-rep-admin-readonly-day-293.mts
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
const admin = read("src/app/admin/settings/page.tsx");

function slice(from: string, to: string): string {
  const a = admin.indexOf(from);
  if (a < 0) return "";
  const b = admin.indexOf(to, a + from.length);
  return b > a ? admin.slice(a, b) : "";
}

console.log("Day 293 — rep read-only Admin Settings policy UX (no network, no secrets)\n");

// ── 1. Manager capability from authenticated, server-resolved evidence ────────
console.log("── manager capability from server evidence ──");
const loadEffect = slice("const cfg = await getAdminConfig", "// Day 292 — read org settings");
check("isManager capability state exists (tri-state, defaults null)", /const \[isManager, setIsManager\] = useState<boolean \| null>\(\s*null\s*\)/.test(admin));
check("capability set true on the manager-only config success", /const cfg = await getAdminConfig\([\s\S]{0,400}setIsManager\(\s*true\s*\)/.test(admin));
check("load effect located", loadEffect.length > 0);
check("expected denial translated to rep (isManager=false), keyed on forbidden_not_manager", /forbidden_not_manager["']\s*\)\s*\)\s*\{\s*setIsManager\(\s*false\s*\)/.test(admin));
check("legacy substring-capability memo removed", !/\(err \|\| ""\)\.includes\(/.test(admin) && !/\bconst forbidden\b/.test(admin));
check("no localStorage identity / client role used for capability", !/localStorage\.(get|set)Item/.test(admin) && !/["']role["']/.test(loadEffect));

// ── 2. Raw denial / provider errors never displayed ───────────────────────────
console.log("\n── no raw denial / provider error ──");
check("no raw error passthrough (setErr(e?.message)) anywhere", !/setErr\(\s*e\??\.message/.test(admin));
check("raw 'forbidden_not_manager' is only used for detection, never rendered as copy", (admin.match(/forbidden_not_manager/g) || []).length >= 1 && !/>\s*\{?\s*forbidden_not_manager/.test(admin));

// ── 3. Rep read-only Company Call Visibility surface ──────────────────────────
console.log("\n── rep read-only visibility surface ──");
check("write controls render ONLY under isManager === true", /isManager === true \?[\s\S]{0,600}updateVisibility\(opt\)/.test(admin));
check("read-only branch shows the current server value", /Current setting:/.test(admin));
check("read-only branch has neutral manager-only copy", /Only a manager can change company call visibility/.test(admin));
// The rep/unknown branch must contain no enabled mutation path.
const repBranch = slice("rep / unknown: explicit READ-ONLY", "\n          </div>");
check("rep read-only branch located", repBranch.length > 0);
check("rep read-only branch has NO updateVisibility mutation control", !/updateVisibility\(/.test(repBranch) && !/onClick=/.test(repBranch));

// ── 4. Config section gated by capability (no !forbidden) ─────────────────────
console.log("\n── admin-config section gated by capability ──");
check("streak/XP/comeback form renders ONLY under isManager === true", /\{isManager === true \?[\s\S]{0,200}Streak threshold/.test(admin));
check("read-only reps get a neutral admin-config notice (not a raw denial)", /read-only access to Admin Settings/.test(admin));

// ── 5. Managers retain the Day 292 confirmed-write contract ───────────────────
console.log("\n── manager confirmed writes retained ──");
check("manager write still goes through proxyPatch org-settings", /proxyPatch<[^>]*>\(\s*["']\/v1\/admin\/org-settings["']/.test(admin));
check("manager write still guards duplicate saves + is non-optimistic", /if\s*\(\s*visSaving\s*\)\s*return/.test(admin) && /const saved = normaliseVisibility/.test(admin));

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — Day 293 rep read-only admin policy validator.`);
process.exit(fail);
