require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const orgId = '1571ea3b-c971-43ed-95ff-a474a65806da';
  const { data: family } = await supabase.from('packages')
    .select('id, name')
    .eq('is_family', true)
    .eq('organization_id', orgId)
    .limit(1)
    .single();
  
  if (!family) return console.log('No family');
  
  const { data: rows } = await supabase.from('package_services')
    .select(`
      id, decided_by, service:services(id, name),
      package_deliverables(deliverable_id, decided_by, quantity, deliverable:deliverables(id, name))
    `)
    .eq('package_id', family.id);
  
  console.log(JSON.stringify(rows, null, 2));
}

check();
