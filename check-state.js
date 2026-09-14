require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const orgId = '1571ea3b-c971-43ed-95ff-a474a65806da';
  const { data: family } = await supabase.from('packages').select('id').eq('is_family', true).limit(1).single();
  const { data: rows } = await supabase.from('package_services').select('id, service_id').eq('package_id', family.id);
  
  const { data: delivs } = await supabase.from('package_deliverables')
    .select('*')
    .eq('package_service_id', rows[0].id);
    
  console.log('Current package_deliverables:', delivs);
}

check();
