// src/app/calls/[id]/audio-url/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const backend = process.env.BACKEND_BASE!;
  const uid = process.env.NEXT_PUBLIC_TEST_UID || "";

  const res = await fetch(`${backend}/v1/calls/${id}/audio-url`, {
    headers: { "x-user-id": uid },
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
