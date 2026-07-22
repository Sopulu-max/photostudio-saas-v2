import { supabaseAdmin } from './src/lib/supabase/admin';
import { getOptionalAuthOrgId } from './src/lib/supabase/getOrgId';

async function test() {
  try {
    const { data, error } = await supabaseAdmin
      .from('workflow_templates')
      .select('*')
      .limit(1);
    
    if (error) console.error('Supabase Error:', error);
    else console.log('Supabase Data:', data);
  } catch (err) {
    console.error('JS Error:', err);
  }
}

test();
