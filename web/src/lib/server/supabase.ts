// Server-only: the Supabase service-role client (bypasses RLS; the tables have no public access at all).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY never reach the browser (no NEXT_PUBLIC_ prefix).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super('Link coins are not configured on this server');
  }
}

let client: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function supabaseAdmin(): SupabaseClient {
  if (!isSupabaseConfigured()) throw new SupabaseNotConfiguredError();
  client ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-client-info': 'hatch-server' } },
  });
  return client;
}
