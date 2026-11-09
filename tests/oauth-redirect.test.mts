import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildOAuthRedirectTo, safeNextPath } from "../src/lib/oauthRedirect.ts";

const PREVIEW = "https://gravix-sales-trainer-web-1lx7-abc123-george-burgess-projects.vercel.app";
const PROD = "https://gravix-sales-trainer-web.vercel.app";

test("preview origin -> preview /auth/callback", () => {
  assert.equal(buildOAuthRedirectTo(PREVIEW), `${PREVIEW}/auth/callback`);
});
test("production origin -> production /auth/callback", () => {
  assert.equal(buildOAuthRedirectTo(PROD), `${PROD}/auth/callback`);
  assert.equal(buildOAuthRedirectTo(PROD + "/"), `${PROD}/auth/callback`);
});
test("localhost is produced only when the page itself is on localhost", () => {
  assert.equal(buildOAuthRedirectTo("http://localhost:3000"), "http://localhost:3000/auth/callback");
  for (const o of [PREVIEW, PROD, "https://example.com"]) assert.ok(!buildOAuthRedirectTo(o).includes("localhost"), o);
});
test("a non-origin value is refused (no path, credentials, scheme tricks)", () => {
  for (const bad of ["", "gravix.vercel.app", "javascript:alert(1)", "https://a.example.com/path", "https://u:p@a.example.com", "ftp://a.example.com", "//a.example.com"]) {
    assert.throws(() => buildOAuthRedirectTo(bad), /invalid_origin/, bad);
  }
});
test("the login page builds redirectTo from window.location.origin only (no env URL, no localhost fallback)", () => {
  const src = readFileSync(new URL("../src/app/login/page.tsx", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  assert.match(src, /buildOAuthRedirectTo\(window\.location\.origin\)/);
  assert.doesNotMatch(src, /process\.env/);
  assert.doesNotMatch(src, /localhost/);
  assert.doesNotMatch(src, /NEXT_PUBLIC_WEB_(BASE|ORIGIN)/);
  const lib = readFileSync(new URL("../src/lib/oauthRedirect.ts", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(lib, /process\.env|localhost/);
});
test("the post-login path is never part of redirectTo", () => {
  const src = readFileSync(new URL("../src/app/login/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /redirectTo\s*=.*next/);
});
test("safe post-login paths are preserved", () => {
  for (const ok of ["/calls/123", "/crm/overview?tab=reps", "/recent-calls", "/calls/11111111-2222-4333-8444-555555555555#transcript-seg-4"]) assert.equal(safeNextPath(ok), ok, ok);
});
test("open redirects and unsafe values are rejected", () => {
  const bad = ["https://evil.example.com", "http://evil.example.com/x", "//evil.example.com", "/\\evil.example.com", "\\evil.example.com", "/%2F%2Fevil.example.com", "/javascript:alert(1)", "javascript:alert(1)", "data:text/html,x", "evil.example.com", "", "   ", "/ok\nSet-Cookie:x", "/a\u0000b", "/login", "/login?next=/x", "/auth/callback", "x".repeat(400), null, undefined, 42, {}];
  for (const b of bad) assert.equal(safeNextPath(b as any), null, JSON.stringify(b));
});
