export type CallDetail = any & { signedAudioUrl?: string; signedTtl?: number };
export type CallsPageResp<T = any> = {
  ok: boolean;
  items: T[];
  nextCursor: string | null;
};