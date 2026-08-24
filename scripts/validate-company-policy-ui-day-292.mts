/**
 * Day 292 — regression validator for the Company-calls policy UI authority.
 *
 * Two WEB authority/UI defects existed at 85a3cf0:
 *
 *   Defect 1 (src/app/call-library/page.tsx): the Company-calls toggle was gated
 *     on the ORG POLICY alone — `disabled: visibility !== "everyone"` — and the
 *     force-back effect forced company scope to "mine" on the same condition.
 *     Under the `managers` policy this disabled an ASSIGNED MANAGER even though
 *     the API (/v1/calls/paged?scope=company) serves that manager. Correct rule:
 *     resolve access PER CALLER from the server's own enforcement, non-spoofable,
 *     never re-derived from client-supplied role/org. A rep under `managers` must
 *     not be offered working Company calls; an assigned manager must retain it;
 *     disabled + unknown/error stay fail-closed.
 *
 *   Defect 2 (src/app/admin/settings/page.tsx): both org-settings GET and PATCH
 *     used a raw `fetch("/api/proxy/...")` with a legacy localStorage `x-user-id`
 *     header, and the PATCH optimistically flipped the UI BEFORE (and regardless
 *     of) the server response. Correct: canonical authenticated proxy helper,
 *     manager-only PATCH, UI moves only after a validated success, previous value
 *     retained/reloaded on denial/5xx/transport, a saving guard against duplicate
 *     writes, and no client org/company override.
 *
 * This validator statically asserts the Day 292 contract. Non-vacuity: every
 * check below is written to FAIL against 85a3cf0 (org-policy gate + raw fetch +
 * legacy identity + optimistic write). Runs on Node's native type stripping — no
 * network, no secrets. Usage:
 *   node scripts/validate-company-policy-ui-day-292.mts
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

console.log("Day 292 — Company-calls policy UI authority (no network, no secrets)\n");

const lib = read("src/app/call-library/page.tsx");
const admin = read("src/app/admin/settings/page.tsx");

function slice(src: string, from: string, to: string): string {
  const a = src.indexOf(from);
  if (a < 0) return "";
  const b = src.indexOf(to, a + from.length);
  return b > a ? src.slice(a, b) : "";
}

// ══════════════════════════════════════════════════════════════════════════
// Defect 1 — Call Library gates on a PER-CALLER server verdict, not org policy
// ══════════════════════════════════════════════════════════════════════════
console.log("── Defect 1: call-library authoritative, non-spoofable gate ──");

const accessLoader = slice(lib, "const loadCompanyAccess", "useEffect(() => {\n    void loadCompanyAccess");

// The buggy org-policy-only gate must be GONE.
check(
  "gate is NOT the org-policy-only rule (visibility !== 'everyone')",
  !/disabled:\s*visibility\s*!==\s*["']everyone["']/.test(lib)
);
check(
  "no `visibility === \"everyone\" ? callScope : \"mine\"` scope rule remains",
  !/visibility === "everyone"\s*\n?\s*\?\s*callScope\s*:\s*"mine"/.test(lib)
);

// The access verdict comes from the server's OWN enforced company-scope path.
check(
  "access is probed via proxyFetch('/v1/calls/paged?scope=company')",
  /proxyFetch\(\s*["']\/v1\/calls\/paged\?scope=company[^"']*["']/.test(accessLoader),
  "loader must probe the enforced company-scope endpoint"
);
check("access loader located", accessLoader.length > 0);
check(
  "loader distinguishes assigned-manager (manager_only_access) from disabled (company_calls_disabled)",
  /manager_only_access/.test(accessLoader) && /company_calls_disabled/.test(accessLoader)
);
check(
  "access is granted ONLY on a positive server response (r.ok)",
  /if\s*\(\s*r\.ok\s*\)[\s\S]{0,80}setCompanyAccess\(\s*["']allowed["']\s*\)/.test(accessLoader)
);
check(
  "no client-supplied role/org is used to infer manager authority",
  !/localStorage|x-user-id|["']role["']|isManager/i.test(accessLoader)
);

// Fail-closed default + never-broaden.
check(
  "companyAccess state defaults to 'unknown' (never optimistic 'allowed')",
  /useState<[^>]*>\(\s*["']unknown["']\s*\)/.test(lib) &&
    !/setCompanyAccess\(\s*["']allowed["']\s*\)/.test(
      lib.slice(0, lib.indexOf("const loadCompanyAccess"))
    )
);
check(
  "Company toggle offered ONLY when access === 'allowed'",
  /disabled:\s*companyAccess\s*!==\s*["']allowed["']/.test(lib)
);
check(
  "paged scope opens to company ONLY when access === 'allowed' (both load sites)",
  (lib.match(/companyAccess === "allowed"\s*\n?\s*\?\s*callScope\s*:\s*"mine"/g) || []).length >= 2,
  `${(lib.match(/companyAccess === "allowed"\s*\n?\s*\?\s*callScope\s*:\s*"mine"/g) || []).length} sites`
);
check(
  "non-allowed access forces callScope back to 'mine'",
  /companyAccess\s*!==\s*["']allowed["'][\s\S]{0,80}setCallScope\(\s*["']mine["']\s*\)/.test(lib)
);

// Canonical auth — no legacy identity anywhere in the page.
check("call-library: NO raw /api/proxy fetch", !/\bfetch\(\s*[`'"]\/api\/proxy/.test(lib));
check("call-library: NO legacy x-user-id header", !/["']x-user-id["']/i.test(lib));
check(
  "call-library: NO legacy localStorage uid identity",
  !/localStorage\.getItem\(\s*["']uid["']\s*\)/.test(lib)
);

// ══════════════════════════════════════════════════════════════════════════
// Defect 2 — Admin Settings uses canonical proxy helper + honest write
// ══════════════════════════════════════════════════════════════════════════
console.log("\n── Defect 2: admin settings canonical proxy + honest write ──");

// updateVisibility is defined after loadVisibility and before the JSX `return (`.
const updaterBody = slice(admin, "const updateVisibility", "return (");

check("admin: NO raw /api/proxy fetch remains", !/\bfetch\(\s*[`'"]\/api\/proxy/.test(admin));
check("admin: NO legacy x-user-id header remains", !/["']x-user-id["']/i.test(admin));
check(
  "admin: NO legacy localStorage uid identity remains",
  !/localStorage\.getItem\(\s*["']uid["']\s*\)/.test(admin)
);
check(
  "admin: org-settings read uses proxyGet",
  /proxyGet<[^>]*>\(\s*["']\/v1\/admin\/org-settings["']/.test(admin)
);
check(
  "admin: org-settings write uses proxyPatch",
  /proxyPatch<[^>]*>\(\s*["']\/v1\/admin\/org-settings["']/.test(admin)
);
check("admin: updateVisibility located", updaterBody.length > 0);
check(
  "admin: write has a saving guard against rapid duplicate writes",
  /if\s*\(\s*visSaving\s*\)\s*return/.test(updaterBody) && /setVisSaving\(\s*true\s*\)/.test(updaterBody)
);
check(
  "admin: UI is NOT optimistically flipped before the await (no setVisibility(val) preceding proxyPatch)",
  !/setVisibility\(\s*val\s*\)[\s\S]*proxyPatch/.test(updaterBody)
);
check(
  "admin: previous value retained + truth reloaded on failure",
  /const prev = visibility/.test(updaterBody) &&
    /catch[\s\S]{0,160}setVisibility\(\s*prev\s*\)/.test(updaterBody) &&
    /catch[\s\S]{0,220}loadVisibility\(\)/.test(updaterBody)
);
check(
  "admin: a clean error is surfaced on denial/5xx/transport",
  /catch[\s\S]{0,200}setVisErr\(/.test(updaterBody)
);
check(
  "admin: selected state moves only after a validated success (server-echoed value)",
  /const saved = normaliseVisibility\(\s*d\?\.settings\?\.call_visibility\s*\)/.test(updaterBody) &&
    /setVisibility\(\s*saved\s*\?\?\s*val\s*\)/.test(updaterBody)
);
check(
  "admin: visibility never optimistically defaults to 'everyone'",
  /useState<CallVisibility \| "unknown">\(\s*["']unknown["']\s*\)/.test(admin)
);

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — Day 292 company-policy UI validator.`);
process.exit(fail);
