/**
 * Day 289 — regression validator for the Account-Detail "unavailable" experience.
 *
 * Deployed 70aab69 rendered a raw `account_not_found` code in the header beside a
 * fully-mounted-but-empty workspace: WorkspaceTabs, a zeroed KPI strip and an
 * ACTIVE ownership control, all rendered unconditionally because nothing gated
 * them behind a loaded account. No foreign data leaked, but the state looked
 * broken and exposed interactive controls for a missing account.
 *
 * This validator statically asserts the Day 289 state machine so it cannot
 * silently regress:
 *   1. The workspace shell (tabs/KPIs/ownership/actions) is gated behind a loaded
 *      `account` via an early `if (!account)` return placed BEFORE <WorkspaceTabs>.
 *   2. The unavailable surface (AccountUnavailable) renders a manager-safe message
 *      and a route back to Accounts — and NONE of the account controls.
 *   3. The raw API error code is never rendered as the failure UI.
 *   4. Unknown and foreign IDs map to the SAME copy (no existence disclosure),
 *      while other failures keep honest, retryable guidance (not a false 404).
 *
 * Runs on Node's native type stripping — no network, no secrets. Usage:
 *   node scripts/validate-account-not-found-day-289.mts
 *
 * Non-vacuity: every check below fails against deployed 70aab69 (which has no
 * `if (!account)` guard, no AccountUnavailable component, and renders {error}
 * raw in the header). Proven by running this script against that revision.
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

console.log("Day 289 — Account-detail not-found experience (no network, no secrets)\n");

const page = read("src/app/crm/accounts/[id]/page.tsx");

// ── Helper: slice a top-level declaration between two stable markers ──────────
// (Brace-matching is unreliable here because destructured params and inline
// return-type object annotations both start with `{`.)
function slice(from: string, to: string): string {
  const a = page.indexOf(from);
  if (a < 0) return "";
  const b = page.indexOf(to, a + from.length);
  return b > a ? page.slice(a, b) : "";
}

// ── 1. Workspace shell is gated behind a loaded account ───────────────────────
console.log("── shell gated behind a loaded account ──");
const guardIdx = page.search(/if\s*\(\s*!account\s*\)/);
const tabsIdx = page.indexOf("<WorkspaceTabs");
const mainReturnIdx = page.lastIndexOf("return (\n    <div className=\"p-6\">");
check("early `if (!account)` guard exists", guardIdx >= 0);
check("<WorkspaceTabs> shell exists", tabsIdx >= 0);
check(
  "guard runs BEFORE the workspace shell (tabs never render for a missing account)",
  guardIdx >= 0 && tabsIdx >= 0 && guardIdx < tabsIdx
);
check(
  "guard runs BEFORE the main workspace return",
  guardIdx >= 0 && mainReturnIdx >= 0 && guardIdx < mainReturnIdx
);
// The guard renders the unavailable surface (or loading), not the shell.
check("guard renders AccountUnavailable on failure", /if\s*\(\s*!account\s*\)[\s\S]{0,600}<AccountUnavailable/.test(page));

// ── 2. Unavailable surface renders no account controls ────────────────────────
console.log("\n── unavailable surface has no account controls ──");
const unavailable = slice("function AccountUnavailable", "type AccountTab =");
check("AccountUnavailable component exists", unavailable.length > 0);
check("shows a manager-safe route back to Accounts", /Back to Accounts/.test(unavailable) && /href="\/crm\/accounts"/.test(unavailable));
check("renders no WorkspaceTabs", !/WorkspaceTabs/.test(unavailable));
check("renders no ownership / EntitySearch control", !/EntitySearch/.test(unavailable) && !/assignOwner|unassignOwner/.test(unavailable));
check("renders no escalate/coaching actions", !/openActionModal/.test(unavailable));
check("renders no KPI strip", !/Avg Score|Account Health/.test(unavailable));
// The surface renders passed-in copy props, never the raw error code.
check("renders the title/detail props (not a raw code)", /\{title\}/.test(unavailable) && /\{detail\}/.test(unavailable));
check("never renders a raw {error} code", !/\{error\}/.test(unavailable));

// ── 3. Classifier: no existence disclosure, honest other-error handling ───────
console.log("\n── error classification (no leak, honest retry) ──");
const classify = slice("function classifyAccountLoadError", "function AccountUnavailable");
check("classifyAccountLoadError exists", classify.length > 0);
check("account_not_found maps to a plain 'not found' title", /account_not_found[\s\S]*?title:\s*'Account not found'/.test(classify) || /account_not_found/.test(classify) && /'Account not found'/.test(classify));
check("invalid/unknown/foreign 404 share the not-found branch", /account_not_found\|invalid_account_id\|not_found\|request_failed_404/.test(classify));
check("forbidden does NOT confirm existence (maps to not-found copy)", /request_failed_403\|forbidden[\s\S]*?title:\s*'Account not found'/.test(classify));
check("a non-404 failure keeps a retryable branch (not a false 404)", /showRetry:\s*true/.test(classify));
check("retry control is wired for retryable failures", /showRetry\s*&&\s*onRetry/.test(page) && /Try again/.test(page));

// ── 4. Raw error code no longer the failure UI ────────────────────────────────
console.log("\n── raw code is not the failure surface ──");
// With the early return, {error} in the header is only reachable when account is
// truthy (a streaming/partial state), never as the not-found surface. Assert the
// unavailable path renders literal copy, not the raw code.
check("classifier returns human copy, never echoes the raw code prop", !/detail:\s*error/.test(classify) && !/title:\s*error/.test(classify));

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — Day 289 account not-found validator.`);
process.exit(fail);
