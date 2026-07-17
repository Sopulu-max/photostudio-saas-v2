import { createBrowserClient } from '@supabase/ssr';

/**
 * Client-side Supabase client with anon key.
 * Respects RLS policies — safe for browser use.
 */
export const createClient = () => {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
};
