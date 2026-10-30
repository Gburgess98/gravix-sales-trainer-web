/**
 * Day 48 — WEB dependency-safety guard (network-free).
 *
 *   node scripts/validate-web-dependency-safety-day-48.mts
 *
 * Day 47 found 17 npm advisories (7 runtime) on the WEB tree. This guard keeps the repaired
 * versions repaired: it reads package.json, package-lock.json and (when present) the installed
 * node_modules tree and fails if any advisory-affected version comes back, anywhere — including
 * nested copies — or if the app drifts to Next 16 / a different start path.
 * `npm audit` stays the authority for NEW advisories; this is the offline regression pin.
 * Mutation proofs at the end break each contract and require the guard to fail.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
type Pkg = { version?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; overrides?: Record<string, unknown> };
type Lock = { lockfileVersion?: number; packages: Record<string, { version?: string; resolved?: string; integrity?: string; link?: boolean; dependencies?: Record<string, string> }> };
type Installed = { path: string; name: string; version: string }[];

// ── semver (x.y.z only; prerelease tags ignored, none are expected here) ─────────────────────────
const parse = (v: string) => (v.match(/(\d+)\.(\d+)\.(\d+)/) ?? ["", "0", "0", "0"]).slice(1).map(Number) as [number, number, number];
const cmp = (a: string, b: string) => { const x = parse(a), y = parse(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const major = (v: string) => parse(v)[0];

// ── advisory floors from the Day-47/48 audit (package → major line → first fixed version) ───────
// Every copy of the package on that line must be >= the floor. Runtime packages marked rt.
const FLOORS: { name: string; line: number; min: string; rt?: boolean; ghsa: string }[] = [
  { name: "next", line: 15, min: "15.5.28", rt: true, ghsa: "GHSA-2464-fhr4-w9xw / p3m5-59mp-jv5r (<=15.5.27)" },
  { name: "zod", line: 4, min: "4.6.6", rt: true, ghsa: "GHSA-mrhx-c7xc-m3w5" },
  { name: "nanoid", line: 3, min: "3.3.18", rt: true, ghsa: "GHSA-28wg / 2v37 / xwg4" },
  { name: "postcss", line: 8, min: "8.5.23", rt: true, ghsa: "GHSA-qx2v / 6g55 / fxqj / r28c (<=8.5.22)" },
  { name: "sharp", line: 0, min: "0.35.5", rt: true, ghsa: "GHSA-f88m / rgj7 / wq5f" },
  { name: "source-map-js", line: 1, min: "1.2.2", rt: true, ghsa: "GHSA-68fv-2mgg-jv7q" },
  { name: "ws", line: 8, min: "8.21.0", rt: true, ghsa: "GHSA-58qx / 96hv" },
  { name: "@humanfs/node", line: 0, min: "0.16.8", ghsa: "GHSA-p498-v437-472g" },
  { name: "ajv", line: 6, min: "6.14.0", ghsa: "GHSA-2g4f-4pwh-qvx6" },
  { name: "brace-expansion", line: 1, min: "1.1.21", ghsa: "GHSA-f886 … qhr7" },
  { name: "brace-expansion", line: 2, min: "2.1.7", ghsa: "GHSA-f886 … qhr7" },
  { name: "flatted", line: 3, min: "3.4.2", ghsa: "GHSA-25h7 / rf6f" },
  { name: "js-yaml", line: 4, min: "4.3.2", ghsa: "GHSA-mh29 … 2883" },
  { name: "minimatch", line: 3, min: "3.1.4", ghsa: "GHSA-3ppc / 7r86 / 23c5" },
  { name: "minimatch", line: 9, min: "9.0.7", ghsa: "GHSA-3ppc / 7r86 / 23c5" },
  { name: "picomatch", line: 2, min: "2.3.2", ghsa: "GHSA-3v7f / c2c7" },
  { name: "picomatch", line: 4, min: "4.0.4", ghsa: "GHSA-3v7f / c2c7" },
  { name: "tar", line: 7, min: "7.5.21", ghsa: "GHSA-23hp … r292 (<=7.5.20)" },
  { name: "yaml", line: 2, min: "2.8.3", ghsa: "GHSA-48c2-rrv3-qjmp" },
];

type R = { id: string; ok: boolean; detail?: string };

function nameOf(path: string) {
  const i = path.lastIndexOf("node_modules/");
  return i < 0 ? "" : path.slice(i + "node_modules/".length);
}

function sweep(copies: { path: string; name: string; version: string }[]) {
  const bad: string[] = [];
  for (const c of copies) {
    const floors = FLOORS.filter((f) => f.name === c.name);
    if (!floors.length) continue;
    const lineOf = (f: (typeof FLOORS)[number]) => (f.line === 0 ? major(c.version) === 0 : major(c.version) === f.line);
    const own = floors.find(lineOf);
    if (own) { if (cmp(c.version, own.min) < 0) bad.push(`${c.path || c.name}@${c.version} < ${own.min} (${own.ghsa})`); }
    else if (major(c.version) < Math.min(...floors.map((f) => f.line))) bad.push(`${c.path || c.name}@${c.version} is older than every audited line`);
  }
  return bad;
}

function check(pkg: Pkg, lock: Lock, installed: Installed | null): R[] {
  const out: R[] = [];
  const t = (id: string, ok: boolean, detail?: string) => out.push({ id, ok, detail });
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const L = (n: string) => lock.packages[`node_modules/${n}`]?.version ?? "";

  // Next: exact pin, >= fixed floor, stays on 15
  const nextDecl = deps.next ?? "";
  t("D1-next-exact-pin-at-or-above-fix", /^\d+\.\d+\.\d+$/.test(nextDecl) && cmp(nextDecl, "15.5.28") >= 0, `declared ${nextDecl}`);
  t("D2-next-locked-at-or-above-fix", cmp(L("next") || "0.0.0", "15.5.28") >= 0 && L("next") === nextDecl, `locked ${L("next")}`);
  t("D3-next-stays-on-15", major(nextDecl) === 15 && major(L("next") || "0") === 15 && major(deps["eslint-config-next"] ?? "0") === 15);
  t("D4-react-stays-on-19", major(deps.react ?? "0") === 19 && major(deps["react-dom"] ?? "0") === 19 && major(L("react") || "0") === 19);
  // Zod: direct range floor + lock
  const zodMin = (deps.zod ?? "").match(/(\d+\.\d+\.\d+)/)?.[1] ?? "0.0.0";
  t("D5-zod-declared-floor-at-or-above-fix", cmp(zodMin, "4.6.6") >= 0, `declared ${deps.zod}`);
  t("D6-zod-locked-at-or-above-fix", cmp(L("zod") || "0.0.0", "4.6.6") >= 0 && major(L("zod") || "0") === 4, `locked ${L("zod")}`);
  // Nested postcss under next: pinned by override and absent/fixed in the lock
  const ov = (pkg.overrides as { next?: { postcss?: string } } | undefined)?.next?.postcss ?? "";
  t("D7-next-postcss-override-present", /^\d+\.\d+\.\d+$/.test(ov) && cmp(ov, "8.5.23") >= 0, `override ${ov}`);
  t("D8-no-vulnerable-postcss-nested-under-next", !lock.packages["node_modules/next/node_modules/postcss"] || cmp(lock.packages["node_modules/next/node_modules/postcss"].version!, "8.5.23") >= 0);
  // Full lockfile sweep (every copy, including nested)
  const copies = Object.entries(lock.packages).filter(([p]) => p).map(([p, v]) => ({ path: p, name: nameOf(p), version: v.version ?? "0.0.0" }));
  const badLock = sweep(copies);
  t("D9-no-advisory-affected-copy-in-lockfile", badLock.length === 0, badLock.slice(0, 3).join(" | "));
  // Non-vacuity: the sweep must have something to look at
  const present = new Set(copies.map((c) => c.name));
  const rt = FLOORS.filter((f) => f.rt).map((f) => f.name);
  t("D10-sweep-is-not-vacuous", FLOORS.length >= 19 && rt.every((n) => present.has(n)) && copies.length > 300, `${copies.length} lock entries`);
  // Installed tree (after npm ci), when present
  if (installed) {
    const badInst = sweep(installed);
    t("D11-no-advisory-affected-copy-installed", badInst.length === 0, badInst.slice(0, 3).join(" | "));
    t("D12-installed-next-matches-lock", installed.some((c) => c.path === "node_modules/next" && c.version === L("next")));
    t("D13-installed-tree-non-empty", installed.length > 300);
  }
  // Scripts still run the intended Next app
  const s = pkg.scripts ?? {};
  t("D14-dev-build-start-run-next", s.dev === "next dev" && s.build === "next build" && s.start === "next start", `${s.dev} | ${s.build} | ${s.start}`);
  t("D15-release-gate-runs-this-guard", /validate:web-dependency-safety/.test(s["check:release"] ?? "") && /npm run build/.test(s["check:release"] ?? ""));
  // Lockfile integrity
  t("D16-lockfile-v3-with-integrity", lock.lockfileVersion === 3 && Object.entries(lock.packages).every(([p, v]) => !p || v.link || (!!v.resolved && !!v.integrity)));
  return out;
}

// ── load real state ──────────────────────────────────────────────────────────────────────────────
const pkg: Pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock: Lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));

function walkInstalled(): Installed | null {
  const base = join(root, "node_modules");
  if (!existsSync(base)) return null;
  const out: Installed = [];
  const visit = (dir: string, rel: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!(e.isDirectory() || e.isSymbolicLink()) || e.name.startsWith(".")) continue;
      if (e.name.startsWith("@")) { visit(join(dir, e.name), `${rel}/${e.name}`); continue; }
      const p = join(dir, e.name, "package.json");
      const r = `${rel}/${e.name}`;
      if (existsSync(p)) {
        try { const j = JSON.parse(readFileSync(p, "utf8")); if (j.version) out.push({ path: r, name: r.slice(r.lastIndexOf("node_modules/") + 13), version: j.version }); } catch { /* ignore */ }
      }
      const nested = join(dir, e.name, "node_modules");
      if (existsSync(nested)) visit(nested, `${r}/node_modules`);
    }
  };
  visit(base, "node_modules");
  return out;
}
const installed = walkInstalled();

console.log("Day 48 — WEB dependency-safety guard\n");
let failed = 0;
const results = check(pkg, lock, installed);
for (const r of results) { console.log(`${r.ok ? "OK  " : "FAIL"}  ${r.id}${r.ok || !r.detail ? "" : ` — ${r.detail}`}`); if (!r.ok) failed++; }
console.log(`\n${results.length} checks (${installed ? `installed tree of ${installed.length} packages scanned` : "installed tree absent — lockfile only"})`);

// ── mutation proofs ──────────────────────────────────────────────────────────────────────────────
console.log("\n── mutation proofs: each regression must fail the guard ──");
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const setLock = (l: Lock, path: string, version: string) => { l.packages[path] = { ...(l.packages[path] ?? { resolved: "x", integrity: "x" }), version }; };
type Mut = { name: string; expect: string[]; run: (p: Pkg, l: Lock, i: Installed | null) => void };
const muts: Mut[] = [
  { name: "restore-vulnerable-next", expect: ["D1", "D2"], run: (p, l) => { p.dependencies!.next = "15.5.21"; setLock(l, "node_modules/next", "15.5.21"); } },
  { name: "restore-vulnerable-zod", expect: ["D5", "D6"], run: (p, l) => { p.dependencies!.zod = "^4.1.11"; setLock(l, "node_modules/zod", "4.1.11"); } },
  { name: "vulnerable-nested-postcss-under-next", expect: ["D8", "D9"], run: (_p, l) => setLock(l, "node_modules/next/node_modules/postcss", "8.4.31") },
  { name: "allow-next-16", expect: ["D3"], run: (p, l) => { p.dependencies!.next = "16.4.3"; setLock(l, "node_modules/next", "16.4.3"); } },
  { name: "caret-range-instead-of-exact-next-pin", expect: ["D1"], run: (p) => { p.dependencies!.next = "^15.5.28"; } },
  { name: "vulnerable-sharp", expect: ["D9"], run: (_p, l) => setLock(l, "node_modules/sharp", "0.34.4") },
  { name: "vulnerable-nested-minimatch", expect: ["D9"], run: (_p, l) => setLock(l, "node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch", "9.0.5") },
  { name: "vulnerable-tar", expect: ["D9"], run: (_p, l) => setLock(l, "node_modules/tar", "7.5.1") },
  { name: "vulnerable-ws", expect: ["D9"], run: (_p, l) => setLock(l, "node_modules/ws", "8.19.0") },
  { name: "override-removed", expect: ["D7"], run: (p) => { delete p.overrides; } },
  { name: "build-script-no-longer-next", expect: ["D14"], run: (p) => { p.scripts!.build = "echo skip"; } },
  { name: "start-script-changed", expect: ["D14"], run: (p) => { p.scripts!.start = "node server.js"; } },
  { name: "guard-dropped-from-release-gate", expect: ["D15"], run: (p) => { p.scripts!["check:release"] = "npm run build"; } },
  { name: "lock-integrity-removed", expect: ["D16"], run: (_p, l) => { delete l.packages["node_modules/zod"].integrity; } },
  { name: "react-major-changed", expect: ["D4"], run: (p) => { p.dependencies!.react = "20.0.0"; } },
  { name: "vulnerable-copy-only-in-installed-tree", expect: ["D11"], run: (_p, _l, i) => { i?.push({ path: "node_modules/next/node_modules/postcss", name: "postcss", version: "8.4.31" }); } },
];
let mutBad = 0;
console.log(`${failed === 0 ? "OK  " : "FAIL"}  control: unmutated state passes every check`);
if (failed) mutBad++;
for (const m of muts) {
  const p = clone(pkg), l = clone(lock), i = installed ? clone(installed) : null;
  m.run(p, l, i);
  // installed-tree mutation is only meaningful when the tree exists
  if (m.name.includes("installed") && !installed) { console.log(`SKIP  ${m.name} (no node_modules)`); continue; }
  const failedIds = check(p, l, i).filter((r) => !r.ok).map((r) => r.id.split("-")[0]);
  const hit = m.expect.every((e) => failedIds.includes(e));
  console.log(`${hit ? "OK  " : "FAIL"}  ${m.name} → fails ${failedIds.join(",") || "nothing"}${hit ? "" : ` (expected ${m.expect.join(",")})`}`);
  if (!hit) mutBad++;
}
console.log(`\n${muts.length} mutation proofs`);
if (failed || mutBad) { console.log(`\nDay 48 dependency guard FAILED (${failed} checks, ${mutBad} mutation problems)`); process.exit(1); }
console.log("\nDay 48 dependency guard PASSED");
