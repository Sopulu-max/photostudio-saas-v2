require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const orgId = '1571ea3b-c971-43ed-95ff-a474a65806da';
  const { data: family } = await supabase.from('packages').select('id').eq('is_family', true).limit(1).single();
  const { data: rows } = await supabase.from('package_services').select('id, service_id').eq('package_id', family.id);
  
  const payload = {
    deliverables: [{
      serviceId: rows[0].service_id,
      deliverableId: '3563cebf-65c0-448b-9bad-42d5365dd806',
      quantity: null,
      decidedBy: 'member'
    }]
  };

  const rowIdOf = new Map(rows.map((r) => [r.service_id, r.id]));
  const links = [];
  for (const p of payload.deliverables) {
    links.push({
      organization_id: orgId,
      package_service_id: rowIdOf.get(p.serviceId),
      deliverable_id: p.deliverableId,
      quantity: p.quantity ?? null,
      decided_by: p.decidedBy === 'member' ? 'member' : 'studio',
    });
  }

  // Clear existing
  await supabase.from('package_deliverables').delete().in('package_service_id', rows.map(r => r.id));
  
  // Insert new
  const res = await supabase.from('package_deliverables').insert(links).select();
  console.log(res);
}

check();
