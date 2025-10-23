// src/app/api/proxy/route.ts
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const TARGET = (process.env.API_PROXY_TARGET || "").trim() || "https://api.gravixbots.com";
  const upstream = new URL("/", TARGET).toString();

  const headers = new Headers();
  const uid = req.headers.get("x-user-id") || process.env.NEXT_PUBLIC_TEST_UID || "";
  const org = req.headers.get("x-org-id") || process.env.NEXT_PUBLIC_TEST_ORG_ID || process.env.DEFAULT_ORG_ID || "";
  if (uid) headers.set("x-user-id", uid);
  if (org) headers.set("x-org-id", org);
  if (!headers.get("x-request-id")) {
    try { headers.set("x-request-id", crypto.randomUUID()); } catch {}
  }

  const r = await fetch(upstream, { method: "GET", headers, redirect: "manual", cache: "no-store" });

  // Clean encoding headers (avoid double-decode issues)
  const out = new Headers(r.headers);
  out.delete("content-encoding");
  out.delete("transfer-encoding");
  out.delete("content-length");
  if (!out.get("content-type")) out.set("content-type", "text/plain; charset=utf-8");

  return new Response(await r.text(), { status: r.status, headers: out });
}