import { createClient } from '@supabase/supabase-js';

let _adminClient: any = null;

export const supabaseAdmin = new Proxy({} as any, {
  get(target, prop) {
    if (!_adminClient) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';
      _adminClient = createClient(supabaseUrl, supabaseServiceKey);
    }
    return _adminClient[prop];
  }
});
