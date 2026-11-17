require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }, realtime: { transport: WebSocket }
});

async function main() {
  const orgId = '1571ea3b-c971-43ed-95ff-a474a65806da';
  const printingDomainId = '5682da42-4422-42ab-b264-24c28596d0c6';
  const fineArtPrintingServiceId = '28232f9a-a7c3-4e00-a38d-0aedc14523bf';

  // 1. Create or get Framed print deliverable
  let { data: delivs } = await supabase.from('deliverables').select('id').eq('organization_id', orgId).eq('name', 'Framed print');
  let deliverableId;
  if (!delivs || delivs.length === 0) {
    const { data: newDeliv, error: err1 } = await supabase.from('deliverables').insert({
      organization_id: orgId,
      service_domain_id: printingDomainId,
      name: 'Framed print'
    }).select('id').single();
    if (err1) throw err1;
    deliverableId = newDeliv.id;
  } else {
    deliverableId = delivs[0].id;
  }
  console.log('Deliverable ID:', deliverableId);

  // 2. Create the package
  const { data: pkg, error: err2 } = await supabase.from('packages').insert({
    organization_id: orgId,
    name: 'Framed Print',
    description: 'A beautiful framed print in the size of your choice, ready to hang.'
  }).select('id').single();
  if (err2) throw err2;
  const packageId = pkg.id;
  console.log('Package ID:', packageId);

  // 3. Create the package service bundle
  const { data: pkgSvc, error: err3 } = await supabase.from('package_services').insert({
    organization_id: orgId,
    package_id: packageId,
    service_id: fineArtPrintingServiceId,
    position: 0,
    decided_by: 'studio'
  }).select('id').single();
  if (err3) throw err3;
  const packageServiceId = pkgSvc.id;
  console.log('Package Service ID:', packageServiceId);

  // 4. Attach deliverable to package service
  const { error: err4 } = await supabase.from('package_deliverables').insert({
    organization_id: orgId,
    package_service_id: packageServiceId,
    deliverable_id: deliverableId,
    quantity: 1,
    decided_by: 'studio'
  });
  if (err4) throw err4;
  console.log('Successfully created Framed Print package.');
}
main().catch(console.error);
