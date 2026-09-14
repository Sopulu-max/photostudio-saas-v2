require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const orgId = '1571ea3b-c971-43ed-95ff-a474a65806da';
  const { data: family } = await supabase.from('packages').select('id').eq('is_family', true).limit(1).single();
  const { data: rows } = await supabase.from('package_services').select('id, service_id').eq('package_id', family.id);
  
  const res = await supabase.from('package_deliverables')
    .update({ decided_by: 'member', quantity: null })
    .eq('package_service_id', rows[0].id)
    .eq('deliverable_id', '3563cebf-65c0-448b-9bad-42d5365dd806');
    
  console.log('Updated:', res.error || 'success');
}

check();
