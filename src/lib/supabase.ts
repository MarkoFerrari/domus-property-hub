import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function looksReal(v: string | undefined) {
  return Boolean(v && v.length > 20 && !v.includes("your-project-ref") && !v.includes("your-anon"));
}

/**
 * True when real Supabase credentials are present in `.env`.
 * When false the whole app transparently falls back to DEMO MODE — the same
 * screens and the same logic, but data lives in this browser only.
 */
export const isSupabaseConfigured = looksReal(url) && looksReal(anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/** Narrowing helper so call sites don't have to null-check everywhere. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error("Supabase is not configured. Running in demo mode.");
  return supabase;
}
