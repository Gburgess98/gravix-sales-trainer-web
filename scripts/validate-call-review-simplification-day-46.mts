/**
 * Day 46 — call-review simplification guard (network-free, no secrets).
 *
 *   node scripts/validate-call-review-simplification-day-46.mts
 *   node scripts/validate-call-review-simplification-day-46.mts --emit <page.tsx>   # print request fixture
 *
 * The call-review page (/calls/[id]) was re-ordered and de-duplicated, never re-wired.
 * This guard pins the things a simplification must not move:
 *   R  every request URL / method / body is the one in d8fe745 (frozen fixture + git cross-check)
 *   U  the secure unavailable branch still runs before the workspace and exposes no controls
 *   N  all six destinations stay reachable
 *   M  the header-action decision model (pure, run over its full input grid)
 *   G  manager-only actions stay gated
 *   D  CRM / Coach drawers, URL state, shortcuts
 *   T  transcript, player, pins, processing states
 *   P  one primary action and progressive disclosure
 * Section "mutation proofs" then breaks each high-risk contract and requires the guard to fail.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "src/app/calls/[id]/page.tsx";
const MODEL = "src/lib/call-review-model.ts";
const FIXTURE = "scripts/fixtures/call-review-requests-day-46.json";
const BASELINE_SHA = "d8fe7458293a9b8b4db361cd114fe1cf206e6ab5";
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

// ── request extraction ───────────────────────────────────────────────────────
const CALLEES = ["proxyFetch", "fetchJsonWithRetry", "getCallViaProxy", "listPins", "createPin", "deletePin", "getScoreHistory", "getAdminConfig"];
const norm = (t: string) => t.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").replace(/,\s*\)/g, ")").trim();

function balancedCall(src: string, open: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return src.slice(open, i + 1);
  }
  return "";
}

function extractRequests(src: string) {
  const calls: string[] = [];
  for (const name of CALLEES) {
    const re = new RegExp(`(?<![\\w.])${name}(?:<[^>(]*>)?\\(`, "g");
    for (const m of src.matchAll(re)) {
      // skip import / declaration lines
      const lineStart = src.lastIndexOf("\n", m.index) + 1;
      const line = src.slice(lineStart, src.indexOf("\n", m.index));
      if (/^\s*(import\b|async function|function|export)/.test(line) && !line.includes("await")) continue;
      const open = m.index! + m[0].length - 1;
      calls.push(`${name}${norm(balancedCall(src, open))}`);
    }
  }
  // Every /v1/... or /api/proxy/... path written anywhere in code (comments excluded).
  const literals = src
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .flatMap((l) => [...l.matchAll(/(?:\/api\/proxy)?\/v1\/[^\s"'`<>]*/g)].map((m) => m[0]))
    .sort();
  const methods = calls.map((c) => {
    const url = c.match(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/)?.[2] ?? "";
    const method = c.match(/method:\s*["'](\w+)["']/)?.[1] ?? "GET";
    return `${method} ${url}`;
  });
  return { calls: calls.sort(), literals, methods: [...new Set(methods)].sort() };
}

if (process.argv[2] === "--emit") {
  console.log(JSON.stringify(extractRequests(readFileSync(process.argv[3], "utf8")), null, 2));
  process.exit(0);
}

// ── the contract checks, parameterised so mutation proofs can break them ─────
type Model = typeof import("../src/lib/call-review-model.ts");
type Result = { id: string; ok: boolean; detail?: string };

function between(src: string, from: string, to: string): string {
  const a = src.indexOf(from);
  if (a < 0) return "";
  const b = src.indexOf(to, a + from.length);
  return b > a ? src.slice(a, b) : "";
}
const gatedBefore = (src: string, anchor: string, win = 220) => {
  const i = src.indexOf(anchor);
  return i >= 0 && src.slice(Math.max(0, i - win), i).includes("managerCheckDone && isManager");
};
const count = (src: string, needle: string | RegExp) =>
  typeof needle === "string" ? src.split(needle).length - 1 : (src.match(new RegExp(needle, "g")) ?? []).length;

function runChecks(page: string, model: Model, disclosureSrc: string, fixture: ReturnType<typeof extractRequests>): Result[] {
  const out: Result[] = [];
  const t = (id: string, ok: boolean, detail?: string) => out.push({ id, ok, detail });

  const mainOpen = page.indexOf('<main className="mx-auto w-full max-w-[1400px] px-6 py-6 lg:px-8 space-y-6"');
  const mainClose = page.indexOf("</main>", mainOpen);
  const main = mainOpen >= 0 && mainClose > mainOpen ? page.slice(mainOpen, mainClose) : "";
  const unavailable = between(page, "function CallUnavailable", "export default function CallPage");
  const guard = page.search(/if\s*\(\s*callMissing\s*\)\s*\{/);
  const render = between(page, "const renderReviewAction", "const transcriptText");
  const drawers = page.slice(page.indexOf("{/* === CRM DRAWER === */}"));

  // R — requests
  const now = extractRequests(page);
  const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);
  const diff = (a: string[], b: string[]) => [...a.filter((x) => !b.includes(x)), ...b.filter((x) => !a.includes(x))].slice(0, 2).join(" | ");
  t("R1-request-call-sites-identical-to-d8fe745", same(now.calls, fixture.calls), diff(now.calls, fixture.calls));
  t("R2-request-url-literals-identical", same(now.literals, fixture.literals), diff(now.literals, fixture.literals));
  t("R3-method-url-set-identical", same(now.methods, fixture.methods), diff(now.methods, fixture.methods));
  t("R4-request-surface-non-empty", now.calls.length >= 20 && now.methods.some((m) => m.startsWith("DELETE ")) && now.methods.some((m) => m.startsWith("POST ")));

  // U — secure unavailable branch
  t("U1-callMissing-guard-before-workspace", guard >= 0 && mainOpen > guard, `guard=${guard} main=${mainOpen}`);
  t("U2-guard-renders-only-CallUnavailable", /if\s*\(\s*callMissing\s*\)\s*\{\s*return\s*\(\s*<AuthGate>\s*<CallUnavailable\s*\/>\s*<\/AuthGate>\s*\)/.test(page));
  t("U3-unavailable-surface-has-no-controls", unavailable.length > 0 && !/id="summary"|SectionCard|Disclosure|<nav|renderReviewAction|planReviewActions|openCrm|openCoach|Assign|Link CRM|<audio|transcript/i.test(unavailable));
  t("U4-unavailable-routes-back-to-library", /href="\/call-library"/.test(unavailable) && /Back to Call Library/.test(unavailable) && /Call not found/.test(unavailable));
  const firstLoad = between(page, "// Treat not-found AND unusable ids", "setErr(\"Call not found or no longer available.\")");
  t("U5-first-load-classifies-missing-forbidden-invalid", ["not_found", "404", "invalid id", "400", "403", "forbidden"].every((k) => firstLoad.includes(`msg.includes("${k}")`)) && /setCallMissing\(true\)/.test(firstLoad));
  t("U7-poll-loop-classifies-not-found", /const isNotFound = msg\.includes\("not_found"\) \|\| msg\.includes\("404"\);\s*if \(isNotFound\) \{\s*if \(!cancelled\) \{\s*setCallMissing\(true\)/.test(page));
  t("U6-workspace-header-only-after-guard", page.indexOf("<header className=\"glass space-y-3 rounded-2xl px-5 py-4\">") > guard && guard > 0);

  // N — destinations
  const navIds = [...between(main, '<nav\n          aria-label="Call review sections"', "</nav>").matchAll(/\{ id: "(\w+)", label: "(\w+)" \}/g)].map((m) => m[1]);
  t("N1-six-destinations-in-nav", navIds.join(",") === "summary,review,transcript,player,crm,coach", navIds.join(","));
  t("N2-every-destination-has-an-anchor", ["summary", "review", "transcript", "player", "crm", "coach"].every((id) => main.includes(`id="${id}"`)));
  t("N3-pins-and-whisperer-anchors-kept", main.includes('id="pins"') && main.includes('id="whisperer-moments"'));
  t("N4-nav-is-labelled-with-aria-current", /aria-label="Call review sections"/.test(main) && /aria-current=\{activeSection === item\.id/.test(main));
  t("N5-scroll-spy-ids-kept", page.includes("['summary', 'review', 'transcript', 'player', 'crm', 'coach']"));
  t("N7-scroll-spy-waits-for-sections-to-mount", /tries\+\+ < 20/.test(page) && /setTimeout\(attach, 250\)/.test(page) && /setActiveSection\(id\)/.test(page));
  t("N6-nav-scrolls-sections-into-view", /scrollIntoView\(\{ behavior: "smooth" \}\)/.test(between(main, "<nav", "</nav>")));

  // M — decision model over its full input grid
  const statuses = [null, undefined, "queued", "processing", "processed", "scoring", "failed", "scored", "weird"];
  const MGR = new Set(["mark-reviewed", "assign-coaching", "assign-drill"]);
  let m1 = true, m2 = true, m3 = true, m4 = true, m5 = true, m6 = true, m8 = true, n = 0;
  for (const status of statuses) for (const isManager of [false, true]) for (const reviewed of [false, true]) for (const coachingAssigned of [false, true]) for (const practiseStage of [null, "Close"]) {
    n++;
    const p = model.planReviewActions({ status, isManager, reviewed, coachingAssigned, practiseStage });
    const all = [...(p.primary ? [p.primary] : []), ...p.secondary];
    if (new Set(all).size !== all.length || p.secondary.includes(p.primary as never)) m1 = false;
    if (!isManager && all.some((a) => MGR.has(a))) m2 = false;
    const scored = status === "scored";
    if (isManager && (!all.includes("assign-drill") || (scored && !reviewed && !all.includes("mark-reviewed")) || (scored && !coachingAssigned && !all.includes("assign-coaching")))) m3 = false;
    if (!scored && p.primary !== null) m4 = false;
    if (!isManager) { if (p.primary !== (scored && practiseStage ? "practise" : null)) m5 = false; }
    else if (scored) {
      const want = !reviewed ? "mark-reviewed" : !coachingAssigned ? "assign-coaching" : null;
      if (p.primary !== want) m5 = false;
    }
    if (!all.includes("link-crm")) m6 = false;
    if (!scored && all.some((a) => a === "mark-reviewed" || a === "assign-coaching" || a === "practise")) m8 = false;
  }
  t("M1-at-most-one-primary-no-duplicates", m1, `${n} states`);
  t("M2-non-manager-never-offered-manager-actions", m2);
  t("M3-manager-keeps-every-action-reachable", m3);
  t("M4-no-primary-while-processing-failed-or-unknown", m4);
  t("M5-primary-is-the-roles-main-job", m5);
  t("M6-link-crm-always-reachable", m6);
  t("M8-workflow-actions-only-after-scoring", m8);
  t("M7-model-exports-manager-only-list", [...model.MANAGER_ONLY_ACTIONS].sort().join() === [...MGR].sort().join());

  // G — gating in the page source
  t("G1-header-plan-uses-existing-manager-gate", /isManager:\s*managerCheckDone && isManager,/.test(page));
  t("G2-manager-handlers-only-in-gated-renderer", count(page, "onClick={markCallReviewed}") === 1 && count(page, "onClick={assignCoachingFromCall}") === 1 && render.includes("onClick={markCallReviewed}") && render.includes("onClick={assignCoachingFromCall}"));
  t("G3-stage-row-assign-drill-gated", gatedBefore(page, "<Button onClick={() => openCoach(true)}>Assign drill</Button>"));
  t("G4-quick-assign-form-gated", gatedBefore(page, "{/* Quick-assign actionable form */}", 40) || /Quick-assign actionable form \*\/\}\s*\{managerCheckDone && isManager && \(/.test(page));
  t("G5-coach-drawer-assign-form-gated", gatedBefore(page, '<div id="assign-form"'));
  t("G6-reviewed-chips-manager-gated", gatedBefore(main, '(managerReviewed || coachingAssigned) && (', 120) || /managerCheckDone && isManager && callMeta\?\.status === "scored" && \(managerReviewed \|\| coachingAssigned\)/.test(main));
  t("G7-mark-reviewed-request-unchanged", /manager-review`,\s*\{\s*method: "POST"/.test(page));

  // D — drawers, URL state, shortcuts
  t("D1-both-drawers-present", drawers.includes("{/* === COACH DRAWER === */}") && page.includes("{/* === /CRM DRAWER === */}"));
  t("D2-c-and-a-shortcuts", /e\.key\.toLowerCase\(\) === "c"[\s\S]{0,40}openCrm\(\)/.test(page) && /e\.key\.toLowerCase\(\) === "a"[\s\S]{0,40}openCoach\(true\)/.test(page));
  t("D3-shortcuts-ignore-typing-and-modifiers", /tag === "INPUT" \|\| tag === "TEXTAREA" \|\| e\.metaKey \|\| e\.ctrlKey \|\| e\.altKey/.test(page));
  t("D4-panel-url-state-drives-drawers", /searchParams\?\.get\("panel"\)/.test(page) && /setCrmOpen\(p === "crm"/.test(page) && /setCoachOpen\(p === "coach"\)/.test(page) && /setAssignOpen\(p === "coach" && isAssign\)/.test(page));
  t("D5-open-close-write-url-with-router-replace", count(page, "router.replace(`${pathname}?${url.searchParams.toString()}`)") === 4 && /searchParams\.set\("panel", "crm"\)/.test(page) && /searchParams\.set\("panel", "coach"\)/.test(page));
  t("D6-crm-1-deep-link-kept", /crmRequested/.test(page) && /setCrmAutoOpened\(true\)/.test(page));
  t("D7-escape-closes-open-drawer", /e\.key !== "Escape"/.test(page) && /if \(coachOpen\) closeCoach\(\);\s*else closeCrm\(\);/.test(page));
  t("D8-drawers-are-dialogs-hidden-when-closed", count(drawers, 'role="dialog"') === 2 && count(drawers, 'aria-modal="true"') === 2 && count(drawers, '"visible pointer-events-auto" : "invisible pointer-events-none"') === 2);
  t("D9-drawers-scroll-on-short-screens", count(drawers, "overflow-y-auto") >= 2 && count(drawers, "w-full max-w-md") === 2);
  t("D10-drawer-actions-kept", drawers.includes("onLinkByEmail") && drawers.includes("linkContactId(c.id)") && drawers.includes("linkAccountId(a.id)") && drawers.includes("onSaveAssign") && drawers.includes("/api/proxy/v1/coach/notes"));

  // T — transcript, player, processing
  for (const [label, re] of [["queued", /Transcribing call…/], ["processing", /Processing transcript…/], ["processed", /Transcript ready\. Scoring…/], ["scoring", /Scoring call…/], ["failed", /Processing failed\. Please retry\./], ["fallback", /<span>Processing…<\/span>/]] as const)
    t(`T1-processing-state-${label}`, re.test(main));
  t("T2-processing-banner-announced", /role="status" aria-live="polite"[^>]*>\s*\{callMeta\.status !== "failed"/.test(main) && main.includes("callMeta && callMeta.status !== 'scored'"));
  t("T3-player-and-signed-audio", main.includes("<audio ref={audioRef}") && main.includes('title="Call recording"') && page.includes("signedAudioUrl") && page.includes("/signed-audio"));
  t("T4-pins-create-seek-delete", main.includes("onClick={onCreatePin}") && main.includes("onClick={() => onDelete(p.id)}") && main.includes("onClick={() => seek(p.t)}"));
  t("T5-transcript-segments-text-and-empty", main.includes("transcript-seg-") && main.includes("{transcriptText}") && main.includes("No transcript has been generated for this call yet."));
  t("T6-key-moments-kept", main.includes("analysisMoments.map") && main.includes("Key moments"));
  t("T7-score-trend-and-history-kept", main.includes("<ScoreSparkline") && page.includes("getScoreHistory(callId, 8)"));
  t("T8-whisperer-outcomes-kept", ["used", "ignored", "not_relevant"].every((v) => main.includes(`value: "${v}"`)) && main.includes("markMomentOutcome"));
  t("T9-loading-skeleton-kept", /loadingCall \? \(\s*<span className="inline-block h-6 w-48/.test(main));
  t("T10-empty-review-and-score-states-kept", main.includes("No scored rubric for this call yet.") && main.includes("This call has an overall score but no stage breakdown"));

  // P — one primary action, progressive disclosure
  t("P1-no-second-primary-in-workspace", !/variant="primary"|bg-indigo-600|buttonClasses\("primary"/.test(main), "primary literal found in main");
  t("P2-single-dynamic-primary-site", count(page, '"primary" : "ghost"') === 1 && /reviewActionPlan\.primary === id \? "primary" : "ghost"/.test(render));
  t("P3-header-renders-primary-then-secondary", /reviewActionPlan\.primary && renderReviewAction\(reviewActionPlan\.primary\)\}\s*\{reviewActionPlan\.secondary\.map/.test(main));
  t("P4-renderer-covers-every-action", ["mark-reviewed", "assign-coaching", "assign-drill", "practise", "link-crm"].every((id) => render.includes(`case "${id}"`)) && render.includes("openCoach(true)") && render.includes("onClick={openCrm}") && render.includes("/sparring/default?focus="));
  t("P5-duplicate-action-rows-removed", !main.includes("Review CRM link") && !main.includes(">Next actions<") && count(main, "Mark Reviewed") === 0);
  t("P6-scoring-transparency-collapsed", /<Disclosure title="Scoring transparency"(?![^>]*defaultOpen)/.test(main));
  t("P7-voice-detail-collapsed", /<Disclosure\s+title="Voice Personality Score"(?![^>]*defaultOpen)/.test(main));
  t("P8-disclosure-defaults-closed-and-native", /defaultOpen = false/.test(disclosureSrc) && /<details/.test(disclosureSrc) && /<summary/.test(disclosureSrc));
  t("P9-action-group-labelled", /role="group" aria-label="Call actions"/.test(main));
  t("P10-practise-demoted", /className=\{buttonClasses\("secondary", "md"\)\}\s*onClick=\{\(\) => \{/.test(main) && main.includes("Practise this next"));

  // Responsive contract
  t("S1-header-wraps-actions-as-a-unit", /flex flex-wrap items-start justify-between gap-x-6 gap-y-3/.test(main) && /min-w-0 flex-1 basis-\[28rem\]/.test(main) && /role="group" aria-label="Call actions" className="flex flex-wrap items-center gap-2"/.test(main));
  t("S2-nav-scrolls-horizontally-not-the-page", /overflow-x-auto/.test(between(main, "<nav", "</nav>")));
  t("S3-keyboard-hint-hidden-on-small", /hidden items-center[^"]*md:flex/.test(between(main, "<nav", "</nav>")));
  t("S4-motion-safe-drawers", count(drawers, "motion-reduce:transition-none") === 2);
  return out;
}

// ── run ──────────────────────────────────────────────────────────────────────
const page = read(PAGE);
const modelSrc = read(MODEL);
const disclosureSrc = read("src/components/ui/disclosure.tsx");
const fixture = JSON.parse(read(FIXTURE)) as ReturnType<typeof extractRequests>;
const tmp = mkdtempSync(join(tmpdir(), "d46-model-"));
let seq = 0;
async function loadModel(src: string): Promise<Model> {
  const f = join(tmp, `model-${seq++}.ts`);
  writeFileSync(f, src);
  return (await import(pathToFileURL(f).href)) as Model;
}
const model = await loadModel(modelSrc);

let failed = 0;
console.log("Day 46 — call-review simplification guard\n");

// Fixture integrity: it must equal what d8fe745 actually contained, when git can show it.
let baselineChecked = false;
try {
  const base = execFileSync("git", ["show", `${BASELINE_SHA}:${PAGE}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const e = extractRequests(base);
  const ok = JSON.stringify(e) === JSON.stringify(fixture);
  baselineChecked = true;
  console.log(`${ok ? "OK  " : "FAIL"}  fixture equals the requests in ${BASELINE_SHA.slice(0, 8)} (git)`);
  if (!ok) failed++;
} catch {
  console.log(`SKIP  git object ${BASELINE_SHA.slice(0, 8)} not available here — frozen fixture used as-is`);
}

const results = runChecks(page, model, disclosureSrc, fixture);
for (const r of results) {
  console.log(`${r.ok ? "OK  " : "FAIL"}  ${r.id}${r.ok || !r.detail ? "" : ` — ${r.detail}`}`);
  if (!r.ok) failed++;
}
console.log(`\n${results.length} checks${baselineChecked ? " + fixture cross-check" : ""}`);

// ── mutation proofs ──────────────────────────────────────────────────────────
console.log("\n── mutation proofs: each broken contract must fail the guard ──");
const swap = (src: string, from: string | RegExp, to: string) => {
  const next = src.replace(from, to);
  if (next === src) throw new Error(`mutation did not apply: ${String(from).slice(0, 60)}`);
  return next;
};
type Mutation = { name: string; expect: string[]; page?: (p: string) => string; model?: (m: string) => string; disclosure?: (d: string) => string };
const mutations: Mutation[] = [
  { name: "disable-secure-guard", expect: ["U1", "U2"], page: (p) => swap(p, /if\s*\(\s*callMissing\s*\)\s*\{/, "if (false) {") },
  { name: "unavailable-surface-gains-a-control", expect: ["U3"], page: (p) => swap(p, 'Back to Call Library', 'Back to Call Library</Link><button onClick={openCrm}>Link CRM</button><Link href="/call-library">') },
  { name: "poll-loop-stops-classifying-404", expect: ["U7"], page: (p) => swap(p, 'msg.includes("not_found") || msg.includes("404");', 'msg.includes("not_found");') },
  { name: "first-load-stops-classifying-forbidden", expect: ["U5"], page: (p) => swap(p, 'msg.includes("403") ||\n          msg.includes("forbidden")', 'msg.includes("forbidden")') },
  { name: "request-method-changed", expect: ["R1", "R3"], page: (p) => swap(p, '{ method: "DELETE" }', '{ method: "POST" }') },
  { name: "request-added", expect: ["R1", "R2", "R3"], page: (p) => swap(p, "const [assignments, setAssignments]", 'void proxyFetch("/v1/calls/extra", { method: "POST" });\n  const [assignments, setAssignments]') },
  { name: "request-body-changed", expect: ["R1"], page: (p) => swap(p, "JSON.stringify({ callId, notes: coachNotes })", "JSON.stringify({ callId, notes: coachNotes, extra: 1 })") },
  { name: "request-url-changed", expect: ["R1", "R2", "R3"], page: (p) => swap(p, "/api/proxy/v1/coach/notes?callId=", "/api/proxy/v1/coach/notez?callId=") },
  { name: "header-gate-removed", expect: ["G1"], page: (p) => swap(p, "isManager: managerCheckDone && isManager,", "isManager: true,") },
  { name: "quick-assign-form-ungated", expect: ["G4"], page: (p) => swap(p, /Quick-assign actionable form \*\/\}\s*\{managerCheckDone && isManager && \(/, "Quick-assign actionable form */}\n            {(") },
  { name: "stage-row-assign-drill-ungated", expect: ["G3"], page: (p) => swap(p, /\{managerCheckDone && isManager && \(\s*<Button onClick=\{\(\) => openCoach\(true\)\}>Assign drill/, "{true && (\n<Button onClick={() => openCoach(true)}>Assign drill") },
  { name: "mark-reviewed-handler-duplicated-ungated", expect: ["G2"], page: (p) => swap(p, "No Whisperer moments linked to this call yet.", "No Whisperer moments linked to this call yet.<button onClick={markCallReviewed}>x</button>") },
  { name: "second-primary-added", expect: ["P1"], page: (p) => swap(p, "<Button onClick={openCrm}>\n                Open CRM panel", '<Button variant="primary" onClick={openCrm}>\n                Open CRM panel') },
  { name: "old-indigo-primary-restored", expect: ["P1", "P10"], page: (p) => swap(p, 'className={buttonClasses("secondary", "md")}\n                    onClick={() => {', 'className="rounded-lg bg-indigo-600 px-4 py-2"\n                    onClick={() => {') },
  { name: "duplicate-next-actions-row-restored", expect: ["P5"], page: (p) => swap(p, "No Whisperer moments linked to this call yet.", "No Whisperer moments linked to this call yet.<Button onClick={openCrm}>Review CRM link</Button>") },
  { name: "shortcut-c-removed", expect: ["D2"], page: (p) => swap(p, 'if (e.key.toLowerCase() === "c") {\n        openCrm();', 'if (e.key.toLowerCase() === "x") {\n        openCrm();') },
  { name: "escape-handler-removed", expect: ["D7"], page: (p) => swap(p, 'if (e.key !== "Escape") return;', "if (false) return;") },
  { name: "panel-url-state-dropped", expect: ["D4"], page: (p) => swap(p, 'setCoachOpen(p === "coach");', "setCoachOpen(false);") },
  { name: "closed-drawer-stays-focusable", expect: ["D8"], page: (p) => swap(p, '${crmOpen ? "visible pointer-events-auto" : "invisible pointer-events-none"}', '${crmOpen ? "pointer-events-auto" : "pointer-events-none"}') },
  { name: "scroll-spy-stops-retrying", expect: ["N7"], page: (p) => swap(p, "tries++ < 20", "false") },
  { name: "destination-anchor-deleted", expect: ["N2"], page: (p) => swap(p, '<section id="player">', "<section>") },
  { name: "destination-removed-from-nav", expect: ["N1"], page: (p) => swap(p, '              { id: "transcript", label: "Transcript" },\n', "") },
  { name: "processing-state-dropped", expect: ["T1"], page: (p) => swap(p, "<span>Scoring call…</span>", "<span></span>") },
  { name: "player-removed", expect: ["T3"], page: (p) => swap(p, "<audio ref={audioRef}", "<div ref={audioRef as never}") },
  { name: "disclosure-opens-by-default", expect: ["P6"], page: (p) => swap(p, '<Disclosure title="Scoring transparency"', '<Disclosure defaultOpen title="Scoring transparency"') },
  { name: "disclosure-component-defaults-open", expect: ["P8"], disclosure: (d) => swap(d, "defaultOpen = false", "defaultOpen = true") },
  { name: "model-rep-offered-mark-reviewed", expect: ["M2", "M5"], model: (m) => swap(m, "} else if (scored && input.practiseStage) {\n    available.add('practise')\n  }", "}\n  if (!input.isManager) available.add('mark-reviewed')\n  if (!input.isManager && scored && input.practiseStage) available.add('practise')") },
  { name: "model-two-primaries", expect: ["M1"], model: (m) => swap(m, "secondary: ORDER.filter((id) => available.has(id) && id !== primary),", "secondary: ORDER.filter((id) => available.has(id)),") },
  { name: "model-actions-offered-before-scored", expect: ["M8"], model: (m) => swap(m, "if (scored && !input.reviewed)", "if (!input.reviewed)") },
  { name: "model-primary-while-processing", expect: ["M4", "M8"], model: (m) => swap(swap(m, "if (scored) {\n    primary", "if (true) {\n    primary"), "if (scored && !input.reviewed)", "if (!input.reviewed)") },
  { name: "model-manager-actions-for-everyone", expect: ["M2"], model: (m) => swap(m, "if (input.isManager) {", "if (true) {") },
  { name: "model-drops-link-crm", expect: ["M6"], model: (m) => swap(m, "new Set<ReviewActionId>(['link-crm'])", "new Set<ReviewActionId>()") },
];

let mutationFails = 0;
// Control: the unmutated tree passes, so a mutation failure is caused by the mutation.
const control = results.filter((r) => !r.ok).length === 0;
console.log(`${control ? "OK  " : "FAIL"}  control: unmutated source passes every check`);
if (!control) mutationFails++;
for (const mu of mutations) {
  try {
    const mp = mu.page ? mu.page(page) : page;
    const mm = mu.model ? await loadModel(mu.model(modelSrc)) : model;
    const md = mu.disclosure ? mu.disclosure(disclosureSrc) : disclosureSrc;
    const failedIds = runChecks(mp, mm, md, fixture).filter((r) => !r.ok).map((r) => r.id);
    const hit = mu.expect.every((e) => failedIds.some((f) => f.startsWith(e + "-")));
    console.log(`${hit ? "OK  " : "FAIL"}  ${mu.name} → fails ${failedIds.map((f) => f.split("-")[0]).join(",") || "nothing"}${hit ? "" : ` (expected ${mu.expect.join(",")})`}`);
    if (!hit) mutationFails++;
  } catch (e) {
    console.log(`FAIL  ${mu.name} — ${(e as Error).message}`);
    mutationFails++;
  }
}
rmSync(tmp, { recursive: true, force: true });
console.log(`\n${mutations.length} mutation proofs`);

if (failed || mutationFails) {
  console.log(`\nDay 46 call-review guard FAILED (${failed} checks, ${mutationFails} mutation problems)`);
  process.exit(1);
}
console.log("\nDay 46 call-review guard PASSED");
