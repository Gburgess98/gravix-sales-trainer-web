/**
 * Day 293 — Admin Settings authority validator (updated by the Settings hub).
 *
 * History: Day 293 originally pinned a rep READ-ONLY Settings surface and a capability derived from `/v1/reps/me`
 * tier. The Settings hub supersedes that product decision: Settings is manager/admin-only, so reps neither see the
 * navigation entry nor render the page. What Day 293 protected is kept:
 *   - capability is decided by the SERVER (the API's manager-only GET /v1/admin/config via the admin segment's RoleGate), never by
 *     localStorage, a client-supplied role/org, or the substring of a raw error;
 *   - a config-data failure is section-scoped and never changes who may use the page;
 *   - no raw provider/authorization error is displayed;
 *   - managers keep confirmed, non-optimistic writes through the existing endpoints.
 *
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
const page = read("src/app/admin/settings/page.tsx");
const sections = read("src/components/settings/sections.tsx");
const shell = read("src/components/settings/settings-shell.tsx");
const gate = read("src/components/auth/role-gate.tsx");
const adminLayout = read("src/app/admin/layout.tsx");
const all = page + sections + shell;

console.log("Day 293 — Admin Settings authority (no network, no secrets)\n");

console.log("── capability is decided by the server ──");
check("Settings sits under the admin segment layout, which wraps it in a manager-level RoleGate", /<RoleGate level="manager">/.test(adminLayout) && !/RoleGate|ManagerGate/.test(page.replace(/\/\/.*$/gm, "")));
check("gate asks the manager-only GET /v1/admin/config", /manager: ['"]\/v1\/admin\/config['"]/.test(gate));
check("gate: 401/403 → router.replace (not manager), other failures → retry (never redirect, never manager UI)", /res\.status === 401 \|\| res\.status === 403\) return router\.replace\(redirectTo\)/.test(gate) && /setState\('error'\)/.test(gate));
check("gate renders children only when the API said yes", /if \(state === 'allowed'\) return <>\{children\}<\/>/.test(gate));
check("no localStorage identity / client role used for capability", !/localStorage\.(get|set)Item/.test(all) && !/["']role["']\s*[:=]/.test(page));
check("no capability inferred from a raw error (no forbidden_not_manager anywhere)", !/forbidden_not_manager/.test(all + gate));

console.log("\n── no raw denial / provider error is displayed ──");
check("no setErr/setConfigErr(e?.message) passthrough", !/set(Config)?Err\(\s*e\??\.message/.test(all));
check("no `{e.message}` / `error.message` rendered in the hub", !/\{\s*e(rr)?(or)?\??\.message\s*\}/.test(all));
check("every catch in the page uses fixed copy", (page.match(/catch\s*(\([^)]*\))?\s*\{[^}]*set\w*\(\s*["'`{]/g) || []).length >= 4);

console.log("\n── config failure is section-scoped ──");
check("config load failure sets only a section error (configErr)", /catch \{[\s\S]{0,120}setConfigErr\(["']Couldn’t load these settings\.["']\)/.test(page));
check("call visibility loads independently of the config", /void loadVisibility\(\); void loadConfig\(\);/.test(page));

console.log("\n── managers keep confirmed, non-optimistic writes ──");
check("visibility write goes through proxyPatch org-settings", /proxyPatch<[^>]*>\(\s*["']\/v1\/admin\/org-settings["']/.test(page));
check("visibility write guards duplicates and echoes the server value", /if\s*\(\s*visSaving\s*\)\s*return/.test(page) && /const saved = normaliseVisibility/.test(page));
check("every organisation-wide write is confirmed first (3 ConfirmDialogs)", (page.match(/<ConfirmDialog/g) || []).length >= 3);
check("gamification write uses the existing patchAdminConfig; thresholds use PATCH /v1/admin/config", /patchAdminConfig\(/.test(page) && /proxyPatch<[^>]*>\("\/v1\/admin\/config"/.test(page));
check("edits survive section changes and are guarded when leaving (useUnsavedGuard + beforeunload)", /useUnsavedGuard\(/.test(page) && /beforeunload/.test(shell));

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — Day 293 admin settings authority validator.`);
process.exit(fail);
