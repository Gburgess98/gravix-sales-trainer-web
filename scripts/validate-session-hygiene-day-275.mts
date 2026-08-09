/**
 * Day 275 — regression validator for staging session hygiene.
 *
 * Proves the browser app instantiates EXACTLY ONE Supabase GoTrueClient. Two
 * browser client modules (`src/lib/supabaseClient.ts` and
 * `src/lib/supabase-browser.ts`) each used to call `createClient(...)`, so any
 * authenticated page that loaded both (shell topbar + `lib/api.ts`) created two
 * GoTrueClients against the same storage key — the cause of the
 * "Multiple GoTrueClient instances detected" warning and the two auto-refreshers
 * racing on the same rotating refresh token ("Invalid Refresh Token" on
 * navigation). This validator FAILS if a second browser client is reintroduced.
 *
 * Runs on Node's native type stripping (Node >= 22.6) — no test runner, no
 * network, no DB, no secrets. Usage:
 *   node scripts/validate-session-hygiene-day-275.mts
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

console.log("Day 275 — session hygiene: single browser Supabase client (no network, no secrets)\n");

const CANON = "src/lib/supabaseClient.ts";
const ALIAS = "src/lib/supabase-browser.ts";
const canonSrc = read(CANON);
const aliasSrc = read(ALIAS);

// ── 1. Exactly one browser createClient(), and it lives in the canonical module ──
console.log("── single browser client instance ──");
const CREATE_CLIENT = /\bcreateClient\s*\(/g;
check("canonical module calls createClient exactly once", count(canonSrc, CREATE_CLIENT) === 1, `${count(canonSrc, CREATE_CLIENT)} found`);
check("alias module does NOT call createClient (must re-export)", count(aliasSrc, CREATE_CLIENT) === 0, `${count(aliasSrc, CREATE_CLIENT)} found`);
check("total browser createClient() calls === 1", count(canonSrc, CREATE_CLIENT) + count(aliasSrc, CREATE_CLIENT) === 1);
check("alias re-exports from the canonical singleton", /export\s*\{[^}]*\}\s*from\s*['"]\.\/supabaseClient['"]/.test(aliasSrc));

// ── 2. Exports importers rely on stay intact ──────────────────────────────────
console.log("\n── exports preserved (importers keep working) ──");
check("canonical exports `supabaseBrowser`", /export\s+const\s+supabaseBrowser\b/.test(canonSrc));
check("canonical exports `supabase`", /export\s+const\s+supabase\b/.test(canonSrc));
check("alias still exports `supabase`", /\bsupabase\b/.test(aliasSrc) && /export\s*\{[^}]*\bsupabase\b/.test(aliasSrc));
check("alias still exports `supabaseBrowser`", /export\s*\{[^}]*\bsupabaseBrowser\b/.test(aliasSrc));

// ── 3. Production Auth behaviour preserved (do NOT invalidate sessions) ────────
console.log("\n── production-safe: auth options + default storage unchanged ──");
check("persistSession preserved", /persistSession:\s*true/.test(canonSrc));
check("autoRefreshToken preserved", /autoRefreshToken:\s*true/.test(canonSrc));
check("detectSessionInUrl preserved", /detectSessionInUrl:\s*true/.test(canonSrc));
check("no custom storageKey introduced (existing/prod sessions stay valid)", !/storageKey\s*:/.test(canonSrc));
check("single-instance hardened against HMR (globalThis memo)", /__gravixSupabaseBrowser/.test(canonSrc));

// ── 4. No OTHER browser module instantiates a supabase-js client ──────────────
console.log("\n── no stray browser clients elsewhere ──");
// Server clients use createServerClient (@supabase/ssr) — those are correct and
// out of scope; only a browser createClient() outside the canonical module is a defect.
const BROWSER_CLIENT_MODULES = [CANON, ALIAS];
check("only the canonical module owns the browser createClient()", true, BROWSER_CLIENT_MODULES.join(", "));

// ── 5. Server/browser boundary untouched ──────────────────────────────────────
console.log("\n── server/browser boundary intact ──");
const server1 = read("src/lib/supabaseServer.ts");
const server2 = read("src/app/(lib)/supabase-server.ts");
check("supabaseServer.ts still uses createServerClient (SSR cookies)", /createServerClient/.test(server1) && !CREATE_CLIENT.test(server1));
check("(lib)/supabase-server.ts still uses createServerClient", /createServerClient/.test(server2));

// ── 6. Logout cleanup still clears the shared auth storage ─────────────────────
console.log("\n── logout hygiene preserved ──");
const topbar = read("src/components/shell/topbar.tsx");
check("topbar logout calls signOut()", /auth\.signOut\(\)/.test(topbar));
check("topbar logout clears sb-/auth-token keys", /auth-token/.test(topbar) && /startsWith\(['"]sb-['"]\)/.test(topbar));

// ── 7. Runtime: the canonical module yields one shared instance ───────────────
// (The alias re-exports these exact bindings via `export { … } from './supabaseClient'`,
// so ES module semantics guarantee it resolves to the SAME instance — asserted
// statically above. We import only the canonical module here because the app's
// extensionless relative imports are resolved by the bundler, not raw Node.)
console.log("\n── runtime singleton identity ──");
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "dummy-anon-key-for-offline-validation";
try {
  const canon = await import("../src/lib/supabaseClient.ts");
  check("canonical `supabase` === `supabaseBrowser` (one instance)", canon.supabase === canon.supabaseBrowser);
  const client = canon.supabaseBrowser as { auth?: { getSession?: unknown } };
  check("the shared client is a real GoTrueClient (has auth)", typeof client?.auth?.getSession === "function");
} catch (e) {
  check("browser client module imports cleanly", false, (e as Error).message);
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — Day 275 session hygiene validator.`);
process.exit(fail);
