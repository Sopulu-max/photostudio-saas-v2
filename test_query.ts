import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const { data, error } = await supabaseAdmin.rpc('get_foreign_keys');
  if (error) {
    // Fallback: Just query the services table directly to see if columns exist
    const { data: cols, error: err } = await supabaseAdmin.from('services').select('*').limit(1);
    if (err) {
      console.log('Error selecting services:', err);
    } else {
      console.log('Columns in services:', Object.keys(cols[0] || {}));
    }
  }
}
run();
