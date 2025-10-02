// src/app/api/proxy/[...path]/route.ts
import { NextRequest, NextResponse } from "next/server";

type RouteParams = { path: string[] };

export async function GET(req: NextRequest, ctx: { params: Promise<RouteParams> }) {
  const params = await ctx.params;
  return proxy(req, params);
}
export async function POST(req: NextRequest, ctx: { params: Promise<RouteParams> }) {
  const params = await ctx.params;
  return proxy(req, params);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<RouteParams> }) {
  const params = await ctx.params;
  return proxy(req, params);
}

async function proxy(req: NextRequest, params: RouteParams) {
  const backend = process.env.BACKEND_BASE!;
  const url = new URL(req.url);
  const target = `${backend}/${params.path.join("/")}${url.search}`;

  const headers = new Headers(req.headers);
  headers.set("x-user-id", process.env.NEXT_PUBLIC_TEST_UID || "");

  const res = await fetch(target, {
    method: req.method,
    headers,
    body: req.body as any,
    redirect: "manual",
  });

  const buf = await res.arrayBuffer();
  const out = new NextResponse(buf, { status: res.status });
  res.headers.forEach((v, k) => out.headers.set(k, v));
  return out;
}