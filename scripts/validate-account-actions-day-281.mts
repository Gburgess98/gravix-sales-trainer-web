/**
 * Day 281 — regression validator for the Account Actions UI (escalate +
 * coaching action) integration.
 *
 * The two account write paths repaired on Day 280 (API) are now exposed through
 * the Accounts detail UI. This validator statically asserts the WEB contract so
 * it cannot silently regress:
 *   1. Proxy-only — the action helpers go through proxyPost/proxyGet (no raw
 *      host / absolute URL / raw fetch), and the client never sends company_id
 *      or org_id (server stamps company scope).
 *   2. Correct endpoints — escalate → /escalate, coaching → /coaching-action,
 *      reads → /coaching-actions and the company-scoped /accounts/escalations.
 *   3. Submission state — the modal disables submit while saving (no duplicate
 *      submit) and re-entrancy is guarded.
 *   4. Honest errors — a mapper translates known API codes and collapses
 *      unknown/5xx to a generic line (raw error is never rendered).
 *   5. Persisted refresh — escalations load on mount and both created rows are
 *      prepended into the rendered lists.
 *
 * Runs on Node's native type stripping — no network, no secrets. Usage:
 *   node scripts/validate-account-actions-day-281.mts
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
const count = (s: string, re: RegExp) => (s.match(re) || []).length;

console.log("Day 281 — Account Actions UI integration (no network, no secrets)\n");

const api = read("src/lib/api.ts");
const page = read("src/app/crm/accounts/[id]/page.tsx");

// Isolate the Day 281 helper block in lib/api.ts for tighter, non-vacuous checks.
const blockStart = api.indexOf("Day 281 — Account manager actions");
const blockEnd = api.indexOf("// Pins", blockStart);
const apiBlock = blockStart >= 0 && blockEnd > blockStart ? api.slice(blockStart, blockEnd) : "";

// ── 1. Proxy-only helpers ─────────────────────────────────────────────────────
console.log("── proxy-only account-action helpers ──");
check("Day 281 helper block present in lib/api.ts", apiBlock.length > 0);
check("escalateAccount posts via proxyPost", /export async function escalateAccount[\s\S]*?proxyPost</.test(apiBlock));
check("createAccountCoachingAction posts via proxyPost", /export async function createAccountCoachingAction[\s\S]*?proxyPost</.test(apiBlock));
check("listAccountEscalations reads via proxyGet", /export async function listAccountEscalations[\s\S]*?proxyGet</.test(apiBlock));
check("listAccountCoachingActions reads via proxyGet", /export async function listAccountCoachingActions[\s\S]*?proxyGet</.test(apiBlock));
check("no raw fetch() in the helper block", !/\bfetch\s*\(/.test(apiBlock));
check("no absolute URL / API host in the helper block", !/https?:\/\//.test(apiBlock));
// Match payload KEYS (company_id: / org_id:) — prose mentioning the columns is fine.
check("client never sends a company_id payload key", !/company_id\s*:/.test(apiBlock));
check("client never sends an org_id payload key", !/org_id\s*:/.test(apiBlock));

// ── 2. Correct, existing endpoints (no invented routes) ───────────────────────
console.log("\n── correct account endpoints ──");
check("escalate targets /v1/accounts/:id/escalate", /\/v1\/accounts\/\$\{encodeURIComponent\(accountId\)\}\/escalate`/.test(apiBlock));
check("coaching targets /v1/accounts/:id/coaching-action", /\/v1\/accounts\/\$\{encodeURIComponent\(accountId\)\}\/coaching-action`/.test(apiBlock));
check("coaching read targets /v1/accounts/:id/coaching-actions", /\/coaching-actions`/.test(apiBlock));
check("escalations read targets company-scoped /v1/accounts/escalations", /`\/v1\/accounts\/escalations`/.test(apiBlock));
check("escalations list is filtered to this account (company isolation preserved server-side)", /\.filter\(\s*\(e\)\s*=>\s*String\(e\?\.account_id/.test(apiBlock));

// ── 3. Page wires the helpers (proxy-only from the UI) ────────────────────────
console.log("\n── Accounts detail page uses the helpers ──");
check("page imports escalateAccount", /import\s*\{[\s\S]*?\bescalateAccount\b[\s\S]*?\}\s*from\s*'@\/lib\/api'/.test(page));
check("page imports createAccountCoachingAction", /createAccountCoachingAction/.test(page));
check("page imports listAccountEscalations", /listAccountEscalations/.test(page));
check("page does NOT POST escalate via raw proxy fetch", !/fetch\(`?\/api\/proxy[^`)]*\/escalate/.test(page));
check("escalation create called from a submit handler", /submitEscalation[\s\S]*?await escalateAccount\(id/.test(page));
check("coaching create called from a submit handler", /submitCoachingAction[\s\S]*?await createAccountCoachingAction\(id/.test(page));

// ── 4. Submission state — no duplicate submit ─────────────────────────────────
console.log("\n── duplicate-submit protection ──");
check("actionSaving state exists", /const \[actionSaving, setActionSaving\] = useState/.test(page));
check("submit handlers early-return while saving", count(page, /if \(actionSaving\) return;/g) >= 2, `${count(page, /if \(actionSaving\) return;/g)} guards`);
check("submit buttons disabled while saving", count(page, /type="submit"[\s\S]{0,120}disabled=\{actionSaving\}/g) >= 2, `${count(page, /type="submit"[\s\S]{0,120}disabled=\{actionSaving\}/g)} disabled submits`);
check("saving flips true then false in finally", /setActionSaving\(true\)[\s\S]*?finally\s*\{[\s\S]*?setActionSaving\(false\)/.test(page));

// ── 5. Honest errors — no raw leak ────────────────────────────────────────────
console.log("\n── honest, non-leaking error text ──");
check("friendlyActionError mapper exists", /function friendlyActionError\(/.test(page));
check("mapper handles account_not_found", /account_not_found/.test(page));
check("mapper has a generic fallback (unknown/5xx not surfaced raw)", /Couldn’t create the \$\{kind\}\. Please try again\./.test(page));
check("submit catch routes through the mapper (raw err not shown)", count(page, /setActionError\(friendlyActionError\(err/g) >= 2, `${count(page, /setActionError\(friendlyActionError\(err/g)} sites`);
check("modal renders actionError, not a raw catch string", /\{actionError &&/.test(page));

// ── 6. Persisted refresh behaviour ────────────────────────────────────────────
console.log("\n── persisted results survive refresh ──");
check("escalations loaded on mount via helper", /await listAccountEscalations\(id\)/.test(page));
check("created escalation prepended into state", /setEscalations\(\(prev\) => \[escalation, \.\.\.prev\]\)/.test(page));
check("created coaching action prepended into state", /setCoachingActions\(\(prev\) => \[action, \.\.\.prev\]\)/.test(page));
check("escalations rendered in a list (persisted view)", /escalations\.map\(\(esc\)/.test(page));

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — Day 281 account-actions validator.`);
process.exit(fail);
