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

// ── 5b. Authenticated bootstrap (Day 281 correction) ─────────────────────────
// The account-detail mount must load through the authenticated proxy helper so
// the Supabase session identity (Bearer + x-user-id) reaches the proxy. A raw
// fetch('/api/proxy/...', {credentials:'include'}) sends only cookies → the proxy
// returns `missing_user`, the account never loads, and the two action controls
// never render. This section fails on deployed 52f2fcc (raw fetch bootstrap).
console.log("\n── authenticated account-detail bootstrap ──");
check("page imports the authenticated proxyFetch helper", /import\s*\{[\s\S]*?\bproxyFetch\b[\s\S]*?\}\s*from\s*'@\/lib\/api'/.test(page));
// Isolate the mount loader (the useEffect keyed on [id]) so the negative checks
// don't trip on the page's unrelated user-triggered action handlers.
const loStart = page.indexOf("useEffect(() => {");
const loEnd = page.indexOf("}, [id]);", loStart);
const loader = loStart >= 0 && loEnd > loStart ? page.slice(loStart, loEnd) : "";
check("mount loader located", loader.length > 0);
check("account read uses proxyFetch (not raw fetch)", /proxyFetch\(`\/v1\/accounts\/\$\{id\}`/.test(loader));
check("coaching-actions refresh read uses proxyFetch", /proxyFetch\(\s*`\/v1\/accounts\/\$\{id\}\/coaching-actions`/.test(loader));
check("intelligence-timeline read uses proxyFetch", /proxyFetch\(\s*`\/v1\/accounts\/\$\{id\}\/intelligence-timeline`/.test(loader));
check("tasks read uses proxyFetch", /proxyFetch\(\s*`\/v1\/accounts\/\$\{id\}\/tasks`/.test(loader));
check("summary read uses proxyFetch", /proxyFetch\(\s*`\/v1\/accounts\/\$\{id\}\/summary`/.test(loader));
// Non-vacuity: planting ANY raw /api/proxy fetch back into the loader flips these.
check("mount loader has NO raw /api/proxy fetch (the missing_user regression)", !/fetch\(\s*[`'"]\/api\/proxy/.test(loader));
check("no raw account GET bootstrap remains (fetch(`/api/proxy/v1/accounts/${id}`))", !/fetch\(`\/api\/proxy\/v1\/accounts\/\$\{id\}`/.test(loader));

// ── 6. Persisted refresh behaviour ────────────────────────────────────────────
console.log("\n── persisted results survive refresh ──");
check("escalations loaded on mount via helper", /await listAccountEscalations\(id\)/.test(page));
check("created escalation prepended into state", /setEscalations\(\(prev\) => \[escalation, \.\.\.prev\]\)/.test(page));
check("created coaching action prepended into state", /setCoachingActions\(\(prev\) => \[action, \.\.\.prev\]\)/.test(page));
check("escalations rendered in a list (persisted view)", /escalations\.map\(\(esc\)/.test(page));

// ── 7. Day 282 — full authenticated-request sweep ─────────────────────────────
// Day 281 fixed only the five mount reads. Every remaining interactive handler
// (ownership assign/unassign, summary save, task generate/complete, preset
// replay/sparring, add/link/unlink contact) also used a raw
// fetch('/api/proxy/...', {credentials:'include'}) that omits the Bearer/x-user-id,
// so it 'missing_user'-fails for auth-first identities. The whole account-detail
// page must now be proxy-helper-only. Non-vacuous: planting ANY raw /api/proxy
// fetch anywhere in the page flips the sweep gate (it fails on pre-Day-282 code).
console.log("\n── authenticated interactive handlers (Day 282 sweep) ──");
check("NO raw /api/proxy fetch anywhere in the account-detail page", !/fetch\(\s*[`'"]\/api\/proxy/.test(page));
check("owner assign (PATCH) routed through proxyFetch", /proxyFetch\(`\/v1\/accounts\/\$\{id\}\/owner`,\s*\{\s*method: 'PATCH'/.test(page));
check("owner unassign (DELETE) routed through proxyFetch", /proxyFetch\(`\/v1\/accounts\/\$\{id\}\/owner`,\s*\{\s*method: 'DELETE'/.test(page));
check("account summary save routed through proxyFetch", /proxyFetch\(`\/v1\/accounts\/\$\{id\}\/summary`/.test(page));
check("task generate routed through proxyFetch", /proxyFetch\(`\/v1\/accounts\/\$\{id\}\/tasks\/generate`/.test(page));
check("task complete (PATCH) routed through proxyFetch", /proxyFetch\(`\/v1\/accounts\/tasks\/\$\{taskId\}`/.test(page));
check("preset coaching (replay/sparring) routed through proxyFetch", (page.match(/proxyFetch\(`\/v1\/accounts\/\$\{id\}\/coaching-action`/g) || []).length >= 2);
check("add contact routed through proxyFetch", /proxyFetch\('\/v1\/crm\/contacts'/.test(page));
check("link/unlink contact routed through proxyFetch", /proxyFetch\(\s*`\/v1\/crm\/contacts\/[^`]*\/link-account`/.test(page) && /proxyFetch\(\s*`\/v1\/crm\/contacts\/\$\{contactId\}\/unlink-account`/.test(page));
// Every proxy call in the page (bootstrap reads + interactive writes) goes via the helper.
check("proxyFetch used across the whole page (>=16 sites)", (page.match(/proxyFetch\(/g) || []).length >= 16, `${(page.match(/proxyFetch\(/g) || []).length} sites`);

// ── 8. Day 288 — assigned-owner bootstrap has no undeclared setter ────────────
// Regression: deployed aab3e78 called setOwnerInput(j.account.owner.id) in the
// mount loader, but no `ownerInput` state/setter is declared anywhere. The line
// only ran when an owner existed, so unassigned accounts (and proxy-only proof)
// never hit it — an assigned-owner account throws `setOwnerInput is not defined`
// on load/refresh and the whole workspace stops rendering. Guard it two ways.
console.log("\n── assigned-owner bootstrap (Day 288 correction) ──");

// (a) General, non-vacuous: every state setter CALLED in the mount loader must
// be DECLARED via useState on the page. Planting any undeclared setOwnerInput
// (or any typo'd setter) back into the loader flips this. Fails on aab3e78.
const declaredSetters = new Set(
  [...page.matchAll(/const\s*\[\s*\w+\s*,\s*(set[A-Z]\w*)\s*\]\s*=\s*useState/g)].map((m) => m[1])
);
const loaderSetterCalls = [...loader.matchAll(/\b(set[A-Z]\w*)\s*\(/g)].map((m) => m[1]);
const undeclaredInLoader = [...new Set(loaderSetterCalls)].filter((s) => !declaredSetters.has(s));
check(
  "every state setter called in the mount loader is declared via useState",
  undeclaredInLoader.length === 0,
  undeclaredInLoader.length ? `undeclared: ${undeclaredInLoader.join(", ")}` : undefined
);

// (b) Owner-specific: the phantom setter is gone entirely, no `ownerInput` state
// was invented to silence it, and the persisted owner still renders from the
// account payload (single source of truth) — the Day 284 contract.
check("no phantom setOwnerInput/ownerInput anywhere in the page", !/ownerInput/i.test(page));
check("mount loader seeds account from the payload", /setAccount\(j\.account/.test(loader));
check(
  "persisted owner renders from account.owner (not a separate input state)",
  /account\?\.owner\?\.full_name/.test(page) && /account\?\.owner\?\.email/.test(page)
);
check(
  "owner picker still uses the dedicated ownerSelection state (Day 284 preserved)",
  /const \[ownerSelection, setOwnerSelection\] = useState/.test(page) &&
    /value=\{ownerSelection\}/.test(page)
);

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — Day 281/282/288 account-actions validator.`);
process.exit(fail);
