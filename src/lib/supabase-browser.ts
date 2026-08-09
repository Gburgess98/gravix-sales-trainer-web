'use client';

// Single browser Supabase client. This module previously built its OWN client
// instance, so pages importing it plus pages importing `supabaseClient.ts`
// instantiated TWO GoTrueClients against the same storage key — the source of
// the "Multiple GoTrueClient instances" warning and the refresh-token races seen
// during staging QA. Day 275: re-export the single canonical singleton so exactly
// one browser client ever exists. Existing imports (`supabase`) keep working
// unchanged.
export { supabase, supabaseBrowser } from './supabaseClient';
