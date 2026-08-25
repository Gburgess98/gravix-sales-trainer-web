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
 * Day 293 correction (this file): capability at 9c2f02a was COUPLED to whether the
 * unrelated manager-only GET /v1/admin/config query SUCCEEDED — its staging data
 * read failed to coerce a config object, so a genuine manager was misclassified as
 * a rep and locked out of the policy control. Capability must instead come from the
 * authenticated identity's server-resolved `reps.tier`.
 *
 * Day 293 contract (asserted statically here):
 *   - Manager capability comes from the AUTHENTICATED identity endpoint
 *     `/v1/reps/me` (server-resolved `reps.tier`) matched to the canonical
 *     MANAGER_TIERS — NOT from the admin-config query's success/denial, and not
 *     from localStorage / client-supplied role/org.
 *   - The streak/XP config load is gated on positive capability and its failure is
 *     section-scoped — it never sets/clears capability or policy authority.
 *   - No raw provider/authorization error is ever displayed (no setErr(e?.message),
 *     no forbidden_not_manager coupling).
 *   - Reps get an explicit read-only Company Call Visibility surface: current value
 *     + neutral manager-only copy + NO enabled mutation path (the write controls
 *     render only under `isManager === true`).
 *   - Managers keep the Day 292 confirmed-write controls.
 *
 * Non-vacuity: every check below is written to FAIL against 5e319fa AND the
 * capability checks additionally FAIL against 9c2f02a (config-coupled capability).
 * Runs on Node's native type stripping — no network, no secrets. Usage:
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

// ── 1. Manager capability from authenticated identity — DECOUPLED from config ─
console.log("── manager capability from authenticated identity (decoupled) ──");
const capEffect = slice('proxyFetch("/v1/reps/me"', "// Load streak/XP config");
const configEffect = slice("if (isManager !== true) return", "// Day 292 — read org settings");
check("isManager capability state exists (tri-state, defaults null)", /const \[isManager, setIsManager\] = useState<boolean \| null>\(\s*null\s*\)/.test(admin));
check("capability resolved from authenticated identity endpoint /v1/reps/me", /proxyFetch\(\s*["']\/v1\/reps\/me["']/.test(admin));
check("capability effect located", capEffect.length > 0);
check("capability derives from reps.tier matched to canonical MANAGER_TIERS", /MANAGER_TIERS\s*=\s*new Set\(\s*\[[^\]]*"Manager"[^\]]*"Owner"[^\]]*"PartnerAdmin"[^\]]*"SuperAdmin"/.test(admin) && /setIsManager\(\s*MANAGER_TIERS\.has\(\s*tier\s*\)\s*\)/.test(capEffect));
// Decoupling: capability must NOT come from getAdminConfig success/denial.
check("capability is NOT derived from getAdminConfig success (no adjacent setIsManager)", !/getAdminConfig\([\s\S]{0,300}setIsManager/.test(admin));
check("no forbidden_not_manager coupling remains anywhere", !/forbidden_not_manager/.test(admin));
check("config load is gated on positive capability (isManager === true)", /if\s*\(\s*isManager\s*!==\s*true\s*\)\s*return/.test(admin));
check("config effect located", configEffect.length > 0);
check("config-data failure never sets/clears capability", configEffect.length > 0 && !/setIsManager/.test(configEffect));
check("legacy substring-capability memo removed", !/\(err \|\| ""\)\.includes\(/.test(admin) && !/\bconst forbidden\b/.test(admin));
check("no localStorage identity / client role used for capability", !/localStorage\.(get|set)Item/.test(admin) && !/["']role["']/.test(capEffect));

// ── 2. Raw denial / provider errors never displayed ───────────────────────────
console.log("\n── no raw denial / provider error ──");
check("no raw error passthrough (setErr(e?.message)) anywhere", !/setErr\(\s*e\??\.message/.test(admin));
check("no raw configErr passthrough (setConfigErr(e?.message)) anywhere", !/setConfigErr\(\s*e\??\.message/.test(admin));

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
check("streak/XP/comeback form renders ONLY under isManager === true", /\{isManager === true \?[\s\S]{0,1400}Streak threshold/.test(admin));
check("read-only reps get a neutral admin-config notice (not a raw denial)", /read-only access to Admin Settings/.test(admin));

// ── 5. Managers retain the Day 292 confirmed-write contract ───────────────────
console.log("\n── manager confirmed writes retained ──");
check("manager write still goes through proxyPatch org-settings", /proxyPatch<[^>]*>\(\s*["']\/v1\/admin\/org-settings["']/.test(admin));
check("manager write still guards duplicate saves + is non-optimistic", /if\s*\(\s*visSaving\s*\)\s*return/.test(admin) && /const saved = normaliseVisibility/.test(admin));

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — Day 293 rep read-only admin policy validator.`);
process.exit(fail);
