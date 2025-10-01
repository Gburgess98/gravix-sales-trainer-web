import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const res = await fetch(`${process.env.BACKEND_BASE}/v1/calls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const txt = await res.text();
  return new NextResponse(txt, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}