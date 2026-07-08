import { createClient } from '@supabase/supabase-js';
import { Database } from '../database.types';

export function createAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase env variables for admin client');
  }

  // Use the service role key to bypass RLS. This should ONLY be used
  // in Server Components and Server Actions where the raw data is passed
  // through the PresentationEngine (the membrane) before being returned to the client.
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}
