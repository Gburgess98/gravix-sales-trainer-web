// src/lib/api.ts
// Use the same-origin proxy so we avoid CORS and inject x-user-id server-side
const PROXY = "/api/proxy";

/** Get call detail + short-lived signed audio URL */
export async function getCall(callId: string): Promise<{
  call: any & { signedAudioUrl?: string; signedTtl?: number };
}> {
  // Detail
  let res = await fetch(`${PROXY}/v1/calls/${callId}`, { cache: "no-store" });
  let json = await res.json();
  if (!json.ok) throw new Error(json.error || "Failed to fetch call");
  const detail = json.call;

  // Signed audio URL
  res = await fetch(`${PROXY}/v1/calls/${callId}/audio-url`, { cache: "no-store" });
  const au = await res.json();
  if (au.ok) {
    detail.signedAudioUrl = au.url;
    detail.signedTtl = au.ttl;
  }

  return { call: detail };
}

/** List pins */
export async function listPins(callId: string): Promise<{ pins: any[] }> {
  const res = await fetch(`${PROXY}/v1/pins?callId=${encodeURIComponent(callId)}`, {
    cache: "no-store",
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Failed to list pins");
  return { pins: json.pins || [] };
}

/** Create pin */
export async function createPin(input: { callId: string; t: number; note: string | null }) {
  const res = await fetch(`${PROXY}/v1/pins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Failed to create pin");
  return json.pin;
}

/** Delete pin */
export async function deletePin(pinId: string) {
  const res = await fetch(`${PROXY}/v1/pins/${pinId}`, { method: "DELETE" });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Failed to delete pin");
  return true;
}

export async function setScore(callId: string, score: number, rubric?: any) {
  const res = await fetch(`/api/proxy/v1/calls/${callId}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score_overall: score, rubric }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Failed to set score");
  return json.call;
}
