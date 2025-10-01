// /src/app/review/[callId]/timeline/page.tsx

import type { Metadata } from "next";
import TranscriptPlayer, { Turn } from "@/components/TranscriptPlayer";

export const metadata: Metadata = {
  title: "Gravix – Transcript Timeline",
};

async function getCallData(callId: string) {
  const base = process.env.NEXT_PUBLIC_API_URL!;
  const res = await fetch(`${base}/v1/calls/${callId}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return (await res.json()) as {
    audioUrl: string;
    transcript: Turn[];
    title?: string;
  };
}

export default async function Page({
  params,
}: {
  params: { callId: string };
}) {
  const { callId } = params;
  const { audioUrl, transcript, title } = await getCallData(callId);

  return (
    <TranscriptPlayer
      callId={callId}
      audioSrc={audioUrl}
      transcript={transcript}
      title={title ?? `Call ${callId}`}
    />
  );
}
