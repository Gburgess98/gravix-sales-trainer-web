/**
 * Release hygiene — raw backend/runtime error text must not reach the UI.
 * Fails when a UI error/notice/toast setter is fed `e.message`, `err.message`, or an API `.error` code directly
 * (use friendlyError from src/lib/friendly-error.ts instead), or when `{String(err)}` / a tooltip of a raw error is rendered.
 * Exempt: src/app/login/page.tsx (Supabase auth messages such as "Invalid login credentials" are intended for the user).
 *
 * Non-vacuous: the detector is first proven against planted violations (it must flag every one) and against the
 * clean forms (it must flag none), then run over src/.
 *   node scripts/validate-no-raw-errors.mts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SETTER = String.raw`set\w*(?:Err|Error|Msg|Message|Notice|Toast|Reason)\w*`;
const RULES: Array<[string, RegExp]> = [
  ["setter fed e.message", new RegExp(String.raw`\b${SETTER}\(\s*(?:String\(\s*)?(?:e|err|error)\??\.message`)],
  ["setter fed an API .error code", new RegExp(String.raw`\b${SETTER}\(\s*(?:String\(\s*)?(?:data|json|j|d|res|r)\??\.error\b(?!\s*,)`)],
  ["raw error rendered via {String(err)}", /\{\s*String\(\s*(?:err|error|e)\s*\)\s*\}/],
  ["raw error in a title/tooltip", /title=\{\s*[\w.?]*(?:err|error)\w*\s*\}/],
  ["message interpolated into UI text", /`[^`]*\$\{\s*(?:e|err|error)\??\.message\s*\}[^`]*`/],
];

export function findRawErrors(src: string): string[] {
  const hits: string[] = [];
  src.split("\n").forEach((line, i) => {
    if (/^\s*\/\//.test(line)) return;
    for (const [name, re] of RULES) if (re.test(line)) hits.push(`${i + 1}: ${name}: ${line.trim().slice(0, 90)}`);
  });
  return hits;
}

let fail = 0;
const check = (label: string, ok: boolean, detail = "") => { console.log(`${ok ? "OK   " : "FAIL "} ${label}${ok ? "" : ` — ${detail}`}`); if (!ok) fail = 1; };

// ── non-vacuity ──
const planted = [
  `setErr(e?.message || "x")`, `setError(String(e?.message ?? "x"))`, `setToast(err.message)`, `setLoadError(json?.error ?? "x")`,
  `<div>Failed — {String(err)}</div>`, `<div title={apiError.error}>x</div>`, "setMsg(`Auth failed: ${error.message}`)", `setReviewQueueError(data?.error || 'x')`,
];
for (const p of planted) check(`detector flags: ${p}`, findRawErrors(p).length > 0);
const clean = [`setErr(friendlyError(e, "x"))`, `setError(friendlyError(data?.error, 'x'))`, `setCreateErr("Name is required")`, `console.error(e?.message)`, `// setErr(e?.message)`];
for (const c of clean) check(`detector allows: ${c}`, findRawErrors(c).length === 0);

// ── scan ──
const files: string[] = [];
(function walk(d: string) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|mts)$/.test(f)) files.push(p);
  }
})(join(root, "src"));
const offenders: string[] = [];
for (const f of files) {
  const rel = relative(root, f);
  if (rel === "src/app/login/page.tsx" || rel === "src/lib/friendly-error.ts") continue;
  for (const h of findRawErrors(readFileSync(f, "utf8"))) offenders.push(`${rel}:${h}`);
}
check(`no raw error text reaches the UI (${files.length} files scanned)`, offenders.length === 0, `\n  ${offenders.slice(0, 25).join("\n  ")}${offenders.length > 25 ? `\n  …and ${offenders.length - 25} more` : ""}`);
console.log(fail ? "\nFAIL — raw errors validator." : "\nPASS — raw errors validator.");
process.exit(fail);
