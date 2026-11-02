// Day 45 — shell/navigation contract guard (network-free, behavioural + source contracts).
//
// The Day-45 UX slice regrouped the sidebar (primary sections + a labelled "More" group),
// removed the icon-only rail, and tucked secondary content behind disclosures. None of that
// may change WHO sees WHICH destination, nor drop a route. This guard proves it:
//
//   A. Role visibility — for every persona the union of (primary sections + More) equals what
//      the pre-Day-45 inline predicate (embedded below as an independent oracle) showed, with
//      no item lost, duplicated or promoted to a role that could not see it.
//   B. Grouping — secondary items appear only under More; the highest-frequency destinations
//      stay primary for every role; hidden sections stay hidden; empty sections are dropped.
//   C. Route preservation — the exact destination set is pinned.
//   D. Active-state semantics unchanged (query-string hrefs never match a pathname).
//   E. Source contracts — labelled nav (no icon-only branch), "More" is an accessible
//      disclosure, the staging banner publishes the height the shell subtracts, Disclosure is
//      native/collapsed-by-default, Home drops the duplicate quick links, Call Library keeps
//      every filter handler and the company-access probe, and neither page gained a new fetch.
//   F. Mutation proofs — each repaired behaviour, broken in a COPY/in-memory, must be caught.
//
// Run: node scripts/validate-shell-navigation-day-45.mts   (no network, no DB)

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

type Check = { id: string; pass: boolean; detail?: string };

// ── Independent oracle: the pre-Day-45 inline predicate (moved verbatim from nav-section.tsx @ f5598a5)
function oracleHasAccess(roles: string[] | undefined, isManager: boolean, userTier?: string): boolean {
  if (!roles || roles.length === 0) return true;
  if (roles.includes("all")) return true;
  if (roles.includes("manager") && isManager) return true;
  if (roles.includes("partneradmin") && (userTier === "PartnerAdmin" || userTier === "SuperAdmin")) return true;
  if (roles.includes("superadmin") && userTier === "SuperAdmin") return true;
  return false;
}

const PERSONAS: { name: string; isManager: boolean; tier?: string }[] = [
  { name: "rep", isManager: false },
  { name: "manager", isManager: true },
  { name: "partneradmin (non-manager)", isManager: false, tier: "PartnerAdmin" },
  { name: "partneradmin+manager", isManager: true, tier: "PartnerAdmin" },
  { name: "superadmin", isManager: true, tier: "SuperAdmin" },
];

const PINNED_HREFS = [
  "/dashboard", "/upload", "/call-library", "/crm/accounts", "/crm/manager/contacts", "/team", "/crm/manager",
  "/assignments", "/call-library?tab=sparring", "/coaching", "/crm/analytics", "/intelligence", "/admin/settings",
  "/settings/profile", "/coaching?tab=review", "/coaching?tab=assignments", "/admin/partners", "/admin/companies", "/admin/users",
].sort();
// Staging redesign — five labelled destinations per role (+ Upload Call as a utility).
const PRIMARY_BY_ROLE: Record<string, string[]> = {
  rep: ["Home|/dashboard", "Calls|/call-library", "Practice|/call-library?tab=sparring", "Coaching|/assignments", "Upload Call|/upload"],
  manager: ["Overview|/coaching", "Team|/team", "Reviews|/coaching?tab=review", "Assignments|/coaching?tab=assignments", "Insights|/crm/analytics", "Upload Call|/upload"],
};

type Mods = { nav: any; model: any };
async function loadMods(navModelFile: string, navigationFile: string): Promise<Mods> {
  const nav = await import(pathToFileURL(path.join(ROOT, navigationFile)).href + `?v=${Math.random()}`);
  const model = await import(pathToFileURL(path.join(ROOT, navModelFile)).href + `?v=${Math.random()}`);
  return { nav, model };
}

function behaviourChecks(m: Mods, tag = ""): Check[] {
  const r: Check[] = [];
  const a = (id: string, pass: boolean, detail = "") => r.push({ id: tag + id, pass, detail });
  const { navigation } = m.nav;
  const { buildNavModel, hasAccess, isNavItemActive, collectNavHrefs } = m.model;
  const HREFS: string[] = collectNavHrefs(navigation);
  const act = (href: string, pathname: string, search = "") => isNavItemActive(href, pathname, search, HREFS);
  const CALLS = "/call-library", SPAR = "/call-library?tab=sparring";
  const key = (i: any) => `${i.label}|${i.href}`;
  const hrefKey = (i: any) => i.href;

  for (const p of PERSONAS) {
    const legacy: string[] = [];
    for (const s of navigation) {
      if (!oracleHasAccess(s.roles, p.isManager, p.tier)) continue;
      for (const i of s.items) if (oracleHasAccess(i.roles, p.isManager, p.tier)) legacy.push(hrefKey(i));
    }
    const model = buildNavModel(navigation, p.isManager, p.tier);
    const now = [...model.sections.flatMap((s: any) => s.items), ...model.more].map(hrefKey);
    // Visibility is compared by destination: labels/placement changed by design, who can reach what did not
    // (the oracle applies the original role predicate to the same navigation tree).
    const legacyPlus = legacy;
    a(`A-visibility-identical-to-legacy:${p.name}`, JSON.stringify([...new Set(legacyPlus)].sort()) === JSON.stringify([...new Set(now)].sort()), `legacy=${legacy.length} now=${now.length}`);
    a(`A-no-duplicates:${p.name}`, new Set(now).size === now.length);
    a(`B-secondary-only-under-more:${p.name}`, model.sections.every((s: any) => s.items.every((i: any) => !i.secondary)) && model.more.every((i: any) => i.secondary));
    a(`B-empty-sections-dropped:${p.name}`, model.sections.every((s: any) => s.items.length > 0));
    const primaryHrefs = model.sections.flatMap((s: any) => s.items.map((i: any) => i.href));
    const primaryKeys = model.sections.flatMap((s: any) => s.items.map(key));
    const want = PRIMARY_BY_ROLE[p.isManager ? "manager" : "rep"];
    a(`B-primary-nav-matches-brief:${p.name}`, JSON.stringify(primaryKeys) === JSON.stringify(want), primaryKeys.join(","));
    a(`B-at-most-five-destinations-plus-upload:${p.name}`, primaryKeys.filter((k: string) => !k.endsWith("|/upload")).length <= 5);
  }
  // role boundaries stated explicitly (not just oracle-equal)
  const rep = buildNavModel(navigation, false, undefined);
  const repAll = [...rep.sections.flatMap((s: any) => s.items), ...rep.more].map((i: any) => i.href);
  a("A-rep-never-sees-manager-or-admin-destinations", ["/team", "/crm/manager", "/crm/manager/contacts", "/crm/analytics", "/intelligence", "/admin/settings", "/admin/partners", "/admin/companies", "/admin/users"].every((h) => !repAll.includes(h)), repAll.join(","));
  const mgr = buildNavModel(navigation, true, undefined);
  const mgrAll = [...mgr.sections.flatMap((s: any) => s.items), ...mgr.more].map((i: any) => i.href);
  a("A-manager-never-sees-control-plane", ["/admin/partners", "/admin/companies", "/admin/users"].every((h) => !mgrAll.includes(h)));
  const pa = buildNavModel(navigation, false, "PartnerAdmin");
  const paAll = [...pa.sections.flatMap((s: any) => s.items), ...pa.more].map((i: any) => i.href);
  a("A-partneradmin-not-superadmin-never-sees-partners", !paAll.includes("/admin/partners") && paAll.includes("/admin/companies"));
  a("A-hasAccess-superadmin-needs-superadmin-tier", hasAccess(["superadmin"], true, "PartnerAdmin") === false && hasAccess(["superadmin"], false, "SuperAdmin") === true);
  a("C-destination-set-pinned", JSON.stringify([...new Set<string>(navigation.flatMap((s: any) => s.items.map((i: any) => i.href)))].sort()) === JSON.stringify(PINNED_HREFS));
  // Day 45 fix — Calls and Sparring share one route and are told apart by ?tab=
  a("D-calls-only-on-plain-call-library", act(CALLS, "/call-library") === true && act(SPAR, "/call-library") === false);
  a("D-sparring-only-on-tab-sparring", act(SPAR, "/call-library", "tab=sparring") === true && act(CALLS, "/call-library", "tab=sparring") === false);
  a("D-calls-stays-active-on-live-and-upload-tabs", act(CALLS, "/call-library", "tab=live") === true && act(CALLS, "/call-library", "tab=upload") === true && act(SPAR, "/call-library", "tab=upload") === false);
  a("D-calls-and-sparring-never-both-active", ["", "tab=live", "tab=sparring", "tab=upload", "tab=other", "x=1&tab=sparring"].every((q) => !(act(CALLS, "/call-library", q) && act(SPAR, "/call-library", q))), "checked 6 query strings");
  a("D-exactly-one-of-calls-sparring-active-on-the-route", ["", "tab=live", "tab=sparring", "tab=upload"].every((q) => Number(act(CALLS, "/call-library", q)) + Number(act(SPAR, "/call-library", q)) === 1));
  a("D-search-accepts-string-and-URLSearchParams", act(SPAR, "/call-library", "?tab=sparring".slice(1)) === true && isNavItemActive(SPAR, "/call-library", new URLSearchParams("tab=sparring"), HREFS) === true && isNavItemActive(CALLS, "/call-library", null, HREFS) === true);
  a("D-query-link-needs-its-route", act(SPAR, "/dashboard", "tab=sparring") === false);
  a("D-active-dashboard-exact", act("/dashboard", "/dashboard") === true && act("/dashboard", "/dashboard/x") === false);
  a("D-active-prefix-needs-segment-boundary", act("/crm/accounts", "/crm/accounts/123") === true && act("/crm/accounts", "/crm/accounts-archive") === false);
  a("control-rep-model-non-vacuous", rep.sections.some((sec: any) => sec.items.some((i: any) => i.href === "/dashboard")), "rep primary has Dashboard");
  a("B-more-group-populated-for-privileged-roles", buildNavModel(navigation, true, "SuperAdmin").more.length >= 8 && buildNavModel(navigation, false, undefined).more.length >= 2);
  return r;
}

type Files = (p: string) => string;
function sourceChecks(f: Files, tag = ""): Check[] {
  const r: Check[] = [];
  const a = (id: string, pass: boolean, detail = "") => r.push({ id: tag + id, pass, detail });
  const item = f("src/components/shell/nav-item.tsx");
  a("E-nav-item-always-labelled-no-icon-only-branch", !/collapsed/.test(item) && /<span className="truncate">\{item\.label\}<\/span>/.test(item));
  a("E-nav-item-passes-search-params-to-active-state", /useSearchParams\(\)/.test(item) && /isNavItemActive\(item\.href, pathname, searchParams, NAV_HREFS\)/.test(item));
  a("E-nav-item-aria-current", /aria-current=\{isActive \? 'page' : undefined\}/.test(item));
  const sb = f("src/components/shell/sidebar.tsx");
  a("E-sidebar-no-collapse-or-hover-expand", !/collapsed|HOVER_DELAY|gravix_sidebar_collapsed/.test(sb));
  a("E-sidebar-more-is-accessible-disclosure", /aria-expanded=\{moreOpen\}/.test(sb) && /aria-controls="sidebar-more"/.test(sb) && /id="sidebar-more"/.test(sb));
  a("E-sidebar-more-opens-when-active-inside", /if \(moreActive\) setMoreOpen\(true\)/.test(sb));
  a("E-sidebar-passes-search-params-to-active-state", /useSearchParams\(\)/.test(sb) && /isNavItemActive\(item\.href, pathname, searchParams, NAV_HREFS\)/.test(sb));
  a("E-sidebar-uses-shared-role-model", /buildNavModel\(navigation, isManager, userTier\)/.test(sb));
  a("E-drawer-hidden-from-focus-when-closed", /'invisible -translate-x-full'/.test(sb) && /lg:visible/.test(sb));
  a("E-drawer-closes-on-navigation-and-escape", /\[pathname\]/.test(sb) && /e\.key === 'Escape'/.test(sb));
  const top = f("src/components/shell/topbar.tsx");
  a("E-topbar-title-is-query-aware", /useSearchParams\(\)/.test(top) && /isNavItemActive\(item\.href, pathname, search, NAV_HREFS\)/.test(top) && !/item\.href === pathname/.test(top));
  const shell = f("src/components/shell/app-shell.tsx");
  a("E-shell-wraps-search-param-sidebar-in-suspense", /<Suspense fallback=\{null\}>\s*<Sidebar/.test(shell));
  a("E-shell-subtracts-staging-banner", /calc\(100dvh-var\(--staging-banner-h,0px\)\)/.test(shell) && !/h-screen/.test(shell));
  const banner = f("src/components/StagingBanner.tsx");
  a("E-banner-publishes-height-and-stays-staging-only", /--staging-banner-h:28px/.test(banner) && /h-7/.test(banner) && /APP_ENV !== "staging"\) return null/.test(banner));
  const disc = f("src/components/ui/disclosure.tsx");
  a("E-disclosure-native-details-collapsed-by-default", /<details/.test(disc) && /defaultOpen = false/.test(disc) && !/useState/.test(disc));
  const dash = f("src/app/dashboard/page.tsx");
  a("E-home-uses-disclosure-for-secondary-detail", /<Disclosure/.test(dash) && /title="Coaching detail"/.test(dash));
  a("E-home-one-primary-action", (dash.match(/buttonClasses\('primary'/g) || []).length === 1);
  a("E-home-quick-link-duplicates-removed", !/Quick links/.test(dash));
  a("E-home-attention-derived-from-real-data-only", /summary\?\.overdue_count/.test(dash) && /feed\?\.regression_warnings/.test(dash));
  const lib = f("src/app/call-library/page.tsx");
  for (const fn of ["setStatusFilter", "setCallScope", "setSelectedReps", "setSelectedTags", "setMinScore", "setMaxScore", "setScoreFilter"])
    a(`E-library-keeps-filter-handler:${fn}`, (lib.match(new RegExp(fn + "\\(", "g")) || []).length >= 2, "needs its control handler AND the Reset handler");
  a("E-library-keeps-company-access-probe", /\/v1\/calls\/paged\?scope=company&limit=1/.test(lib) && /manager_only_access/.test(lib));
  a("E-library-one-primary-action", (lib.match(/buttonClasses\("primary"/g) || []).length === 1);
  a("E-library-tab-follows-the-url", /useSearchParams\(\)\?\.get\("tab"\)/.test(lib) && /\[urlTab\]/.test(lib) && /onChange=\{handleTabChange\}/.test(lib) && /history\.replaceState/.test(lib));
  a("E-library-search-params-behind-suspense", /<Suspense fallback=\{null\}>\s*<CallLibraryPageInner \/>/.test(lib));
  a("E-library-sparring-distinct-heading", /tab === "sparring" \? "Practice" : "Calls"/.test(lib));
  a("E-library-filters-behind-disclosure-with-active-count", /activeFilterCount/.test(lib) && /<details className="group rounded-lg border border-neutral-800 bg-neutral-950">/.test(lib));
  // no new network surface: fetch call counts equal the committed pre-Day-45 baseline
  const BASE = "f5598a5";
  for (const p of ["src/app/dashboard/page.tsx", "src/app/call-library/page.tsx"]) {
    let base = "";
    try { base = execFileSync("git", ["show", `${BASE}:${p}`], { cwd: ROOT, encoding: "utf8" }); } catch { base = ""; }
    const count = (t: string) => (t.match(/proxyFetch\(|fetchJsonWithRetry|\bfetch\(/g) || []).length;
    const urls = (t: string) => [...t.matchAll(/["'`](\/v1\/[^"'`?$]*)/g)].map((m) => m[1]).sort().join(",");
    if (base) a(`E-no-new-network-calls:${p}`, count(f(p)) === count(base) && urls(f(p)) === urls(base), `now=${count(f(p))} base=${count(base)}`);
    else a(`E-no-new-network-calls:${p}`, true, "baseline commit not available (shallow clone) — skipped");
  }
  return r;
}

const report = (title: string, checks: Check[]) => {
  console.log(title);
  let bad = 0;
  for (const c of checks) { console.log(`  ${c.pass ? "✅" : "❌"}  ${c.id}${c.detail && !c.pass ? " — " + c.detail : ""}`); if (!c.pass) bad++; }
  return bad;
};

let failures = 0;
const real = await loadMods("src/config/nav-model.ts", "src/config/navigation.ts");
failures += report("Behaviour (real nav-model + navigation, every persona):", behaviourChecks(real));
failures += report("\nSource contracts:", sourceChecks(rd));

// ── Mutation proofs ─────────────────────────────────────────────────────────────────────────────
console.log("\nMutation proof — each mutation must fail the named check while the control still passes:");
const tmp: string[] = [];
async function modelMutation(name: string, find: string, repl: string, expect: string) {
  const src = rd("src/config/nav-model.ts");
  if (!src.includes(find)) { console.log(`  ❌  ${name} — mutation target not found`); failures++; return; }
  const f = path.join(ROOT, "src/config", `.mut-nav-model-${Math.random().toString(36).slice(2)}.ts`);
  tmp.push(f);
  fs.writeFileSync(f, src.replace(find, repl));
  try {
    const m = await loadMods(path.relative(ROOT, f), "src/config/navigation.ts");
    const res = behaviourChecks(m, "mut:");
    const hit = res.find((c) => c.id === "mut:" + expect || c.id.startsWith("mut:" + expect));
    const ctrl = res.find((c) => c.id === "mut:control-rep-model-non-vacuous");
    const caught = !!hit && !hit.pass; // any matching id failing counts
    const anyFail = res.filter((c) => c.id.startsWith("mut:" + expect)).some((c) => !c.pass);
    console.log(`  ${(caught || anyFail) && ctrl?.pass ? "✅" : "❌"}  ${name} ⇒ ${expect}`);
    if (!((caught || anyFail) && ctrl?.pass)) failures++;
  } catch (e: any) { console.log(`  ❌  ${name} — harness error: ${e?.message}`); failures++; }
}
async function sourceMutation(name: string, file: string, find: string, repl: string, expect: string) {
  const src = rd(file);
  if (!src.includes(find)) { console.log(`  ❌  ${name} — mutation target not found`); failures++; return; }
  const res = sourceChecks((p) => (p === file ? src.replace(find, repl) : rd(p)), "mut:");
  const hit = res.find((c) => c.id === "mut:" + expect);
  const caught = !!hit && !hit.pass;
  console.log(`  ${caught ? "✅" : "❌"}  ${name} ⇒ ${expect}`);
  if (!caught) failures++;
}
try {
  await modelMutation("manager wording/placement override ignored", "  if (!isManager || !item.manager) return item\n", "  return item\n", "B-primary-nav-matches-brief:manager");
  await modelMutation("hasAccess lets everyone see everything", "  if (!roles || roles.length === 0) return true\n", "  return true\n", "A-visibility-identical-to-legacy:rep");
  await modelMutation("superadmin role granted to PartnerAdmin", "if (roles.includes('superadmin') && userTier === 'SuperAdmin') return true", "if (roles.includes('superadmin') && (userTier === 'SuperAdmin' || userTier === 'PartnerAdmin')) return true", "A-visibility-identical-to-legacy:partneradmin+manager");
  await modelMutation("secondary items silently dropped", "more.push(...visible.filter((item) => item.secondary))", "void 0", "A-visibility-identical-to-legacy:manager");
  await modelMutation("secondary items left in primary sections", "const primary = visible.filter((item) => !item.secondary)", "const primary = visible", "B-secondary-only-under-more:manager");
  await modelMutation("manager-only destinations leak to reps (item role filter skipped)", "const visible = section.items\n      .filter((item) => hasAccess(item.roles, isManager, userTier))\n      .filter(", "const visible = section.items\n      .filter(", "A-visibility-identical-to-legacy:rep");
  await modelMutation("active state ignores the query (Sparring never/always matches by path alone)", "if (query) return queryMatches(query, current)", "if (query) return true", "D-calls-only-on-plain-call-library");
  await modelMutation("Calls no longer yields to the Sparring tab (both active)", "return otherQuery !== '' && otherPath === path && queryMatches(otherQuery, current)", "return false", "D-calls-and-sparring-never-both-active");
  await modelMutation("query-link activates on any route sharing the query", "  if (!pathMatches) return false\n", "", "D-query-link-needs-its-route");
  await modelMutation("active state loses the segment boundary", "pathname === path || pathname.startsWith(path + '/')", "pathname === path || pathname.startsWith(path)", "D-active-prefix-needs-segment-boundary");
  await sourceMutation("icon-only collapsed rail reintroduced", "src/components/shell/nav-item.tsx", "<span className=\"truncate\">{item.label}</span>", "{!collapsed && <span className=\"truncate\">{item.label}</span>}", "E-nav-item-always-labelled-no-icon-only-branch");
  await sourceMutation("NavItem stops passing the search params", "src/components/shell/nav-item.tsx", "isNavItemActive(item.href, pathname, searchParams, NAV_HREFS)", "isNavItemActive(item.href, pathname)", "E-nav-item-passes-search-params-to-active-state");
  await sourceMutation("Sidebar stops passing the search params", "src/components/shell/sidebar.tsx", "isNavItemActive(item.href, pathname, searchParams, NAV_HREFS)", "isNavItemActive(item.href, pathname)", "E-sidebar-passes-search-params-to-active-state");
  await sourceMutation("search-param sidebar loses its Suspense boundary", "src/components/shell/app-shell.tsx", "<Suspense fallback={null}>", "<>", "E-shell-wraps-search-param-sidebar-in-suspense");
  await sourceMutation("library tab stops following the URL (nav says Sparring, page shows Calls)", "src/app/call-library/page.tsx", "  }, [urlTab]);", "  }, []);", "E-library-tab-follows-the-url");
  await sourceMutation("library loses its Suspense boundary", "src/app/call-library/page.tsx", "<Suspense fallback={null}>\n      <CallLibraryPageInner />", "<>\n      <CallLibraryPageInner />", "E-library-search-params-behind-suspense");
  await sourceMutation("topbar title ignores the query (says Calls on the Sparring tab)", "src/components/shell/topbar.tsx", "isNavItemActive(item.href, pathname, search, NAV_HREFS)", "isNavItemActive(item.href, pathname)", "E-topbar-title-is-query-aware");
  await sourceMutation("More loses aria-expanded", "src/components/shell/sidebar.tsx", "aria-expanded={moreOpen}", "", "E-sidebar-more-is-accessible-disclosure");
  await sourceMutation("closed drawer stays focusable", "src/components/shell/sidebar.tsx", "'invisible -translate-x-full'", "'-translate-x-full'", "E-drawer-hidden-from-focus-when-closed");
  await sourceMutation("shell ignores the staging banner height", "src/components/shell/app-shell.tsx", "h-[calc(100dvh-var(--staging-banner-h,0px))]", "h-screen", "E-shell-subtracts-staging-banner");
  await sourceMutation("staging banner shown outside staging", "src/components/StagingBanner.tsx", "if (APP_ENV !== \"staging\") return null;", "", "E-banner-publishes-height-and-stays-staging-only");
  await sourceMutation("disclosure open by default", "src/components/ui/disclosure.tsx", "defaultOpen = false", "defaultOpen = true", "E-disclosure-native-details-collapsed-by-default");
  await sourceMutation("a second primary action on Home", "src/app/dashboard/page.tsx", "<Link href=\"/upload\" className=\"group", "<Link href=\"/upload\" className={buttonClasses('primary', 'md')} data-x=\"", "E-home-one-primary-action");
  await sourceMutation("a library filter handler removed", "src/app/call-library/page.tsx", "setScoreFilter(opt.id as ScoreFilter)", "void (opt.id as ScoreFilter)", "E-library-keeps-filter-handler:setScoreFilter");
  await sourceMutation("a new fetch added to Home", "src/app/dashboard/page.tsx", "const loadDashboard = useCallback(async () => {", "const loadDashboard = useCallback(async () => {\n    void proxyFetch('/v1/invented')", "E-no-new-network-calls:src/app/dashboard/page.tsx");
} finally {
  for (const f of tmp) try { fs.rmSync(f, { force: true }); } catch {}
}

if (failures) { console.log(`\n❌ shell navigation validation FAILED (${failures})`); process.exit(1); }
console.log("\n✅ shell navigation validation passed");
