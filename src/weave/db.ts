import { createClient } from '@supabase/supabase-js';

/**
 * The service-role client for the NEW system's tables.
 *
 * Everything the new system owns lives in the `weave` Postgres schema. The
 * existing application keeps running untouched in `public`, on the same
 * database and the same project — so there is no second Supabase to set up,
 * no second deploy, and no chance of the two reaching into each other by
 * accident, because the schema boundary is the wall.
 *
 * Service role bypasses row-level security, so EVERY query through this client
 * must scope itself with `.eq('studio_id', studioId)` by hand.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

export const weave = createClient(url, serviceKey, {
  db: { schema: 'weave' },
  auth: { persistSession: false, autoRefreshToken: false },
});
