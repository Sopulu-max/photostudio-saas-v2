import { createClient } from '@supabase/supabase-js';

let _adminClient: any = null;

export const supabaseAdmin = new Proxy({} as any, {
  get(target, prop) {
    if (!_adminClient) {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Missing Supabase environment variables for admin client');
      }
      _adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
    }
    return _adminClient[prop];
  }
});
