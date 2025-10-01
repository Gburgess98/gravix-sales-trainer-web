'use client';

import { useEffect, useState } from 'react';
import AudioPlayer from '@/components/AudioPlayer';

export default function AudioTestPage() {
  const [url, setUrl] = useState<string | null>(null);

  // 🔁 CHANGE THIS to a REAL object path in your Supabase 'call-uploads' bucket
  const testPath = '928994ea-be7a-43c3-b716-31b3f2b81c23/f1ff88dc-d509-4226-9760-5ccf1a7d51fe.mp3';

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/audio-url?path=${encodeURIComponent(testPath)}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.url) setUrl(json.url);
      else console.error(json);
    })();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl mb-4 font-semibold">Audio Test</h1>
      {!url ? <div>Minting signed URL…</div> : <AudioPlayer src={url} />}
      <p className="mt-3 text-sm text-neutral-500">
        Update <code>testPath</code> to an existing file in your <code>call-uploads</code> bucket.
      </p>
    </div>
  );
}
