require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { writePackageDeliverables } = require('./src/modules/packages/domain.ts'); // Wait, domain.ts is TS.

async function check() {
  const orgId = '1571ea3b-c971-43ed-95ff-a474a65806da';
  const { data: family } = await supabase.from('packages').select('id').eq('is_family', true).limit(1).single();
  const { data: rows } = await supabase.from('package_services').select('id, service_id').eq('package_id', family.id);
  
  console.log('Current rows:', rows);
  
  // Let's manually insert a deliverable with decided_by: member
  const res = await supabase.from('package_deliverables').insert({
    organization_id: orgId,
    package_service_id: rows[0].id,
    deliverable_id: '3563cebf-65c0-448b-9bad-42d5365dd806',
    quantity: null,
    decided_by: 'member'
  });
  console.log('Inserted:', res.error || 'success');
}

check();
