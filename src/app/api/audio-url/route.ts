import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const path = searchParams.get('path');
    const bucket = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'call-uploads';
    const ttl = Number(process.env.SIGNED_URL_TTL || 3600);

    if (!path) {
      return NextResponse.json({ error: 'Missing ?path=<file-path>' }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .storage
      .from(bucket)
      .createSignedUrl(path, ttl);

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: error?.message || 'Failed to create signed URL' }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}
