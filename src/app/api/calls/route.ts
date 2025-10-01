import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Your API base is provided via env and already CORS-allowed
  const res = await fetch(`${process.env.BACKEND_BASE}/v1/calls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // no credentials needed; your API uses service role for DB insert + Slack
  });

  const txt = await res.text();
  return new NextResponse(txt, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}