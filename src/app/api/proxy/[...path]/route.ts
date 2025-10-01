import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE = process.env.BACKEND_BASE || "http://localhost:4000";
const TEST_UID = process.env.NEXT_PUBLIC_TEST_UID || "11111111-1111-1111-1111-111111111111";

async function handle(req: NextRequest, pathParts: string[]) {
  const target = `${BACKEND_BASE}/${pathParts.join("/")}${req.nextUrl.search}`;

  // Build forward request
  const init: RequestInit = {
    method: req.method,
    headers: {
      // inject user header server-side
      "x-user-id": TEST_UID,
      // forward common headers if present
      "content-type": req.headers.get("content-type") || undefined,
      authorization: req.headers.get("authorization") || undefined,
    },
    body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.from(await req.arrayBuffer()),
    redirect: "manual",
  };

  const res = await fetch(target, init);
  const buf = Buffer.from(await res.arrayBuffer());
  const out = new NextResponse(buf, { status: res.status });

  // pass through content-type if available
  const ct = res.headers.get("content-type");
  if (ct) out.headers.set("content-type", ct);

  return out;
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return handle(req, params.path);
}
export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return handle(req, params.path);
}
export async function DELETE(req: NextRequest, { params }: { params: { path: string[] } }) {
  return handle(req, params.path);
}