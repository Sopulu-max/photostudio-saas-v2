import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

if (typeof global.WebSocket === 'undefined') {
  (global as any).WebSocket = WebSocket;
}

import { KernelRepository } from '../src/lib/domains/kernel/repository';
import { KernelOperations } from '../src/lib/domains/kernel/operations';

const ORG_ID = '11111111-2222-3333-4444-555555555555';
const SERVICES = {
  PASSPORT: '00000000-0000-0000-0000-000000000001',
  TRADITIONAL: '00000000-0000-0000-0000-000000000003'
};

async function main() {
  console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const repo = new KernelRepository(admin as any);
  const ops = new KernelOperations(admin as any, repo);

  console.log('Ensuring org and services...');
  await admin.from('organizations').upsert({ id: ORG_ID, name: 'Lumiere', status: 'active' });
  await admin.from('services').upsert([
    { id: SERVICES.PASSPORT, organization_id: ORG_ID, name: 'Passport', status: 'active' },
    { id: SERVICES.TRADITIONAL, organization_id: ORG_ID, name: 'Wedding', status: 'active' }
  ]);

  console.log('Running Scenario 1...');
  try {
    const customerId = await ops.createCustomer(ORG_ID, '+2348031111119', { name: 'Emeka' });
    console.log('Customer:', customerId);
    const reqId = await ops.submitRequest(ORG_ID, customerId, [{ serviceId: SERVICES.PASSPORT }]);
    console.log('Request:', reqId);
    await ops.resolveRequest(ORG_ID, reqId, 'accept');
    
    const agrId = await ops.proposeAgreement(ORG_ID, customerId, reqId, { price: 5000, services: [{ serviceId: SERVICES.PASSPORT }] });
    console.log('Agreement proposed:', agrId);
    
    await ops.activateAgreement(ORG_ID, agrId);
    console.log('Agreement activated!');
    
    const agr = await repo.getAgreementWithGraph(agrId);
    console.log('Instances spawned:', agr?.instances?.length);
  } catch (e) {
    console.error('Error in Scenario 1:', e);
  }
}

main().then(() => console.log('Done')).catch(console.error);
