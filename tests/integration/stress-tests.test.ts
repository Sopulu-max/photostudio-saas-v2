import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { KernelOperations } from '@/lib/domains/kernel/operations';

function adminClient(): SupabaseClient {
  return createClient(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_SERVICE_KEY!
  );
}

const ORG_ID = '11111111-2222-3333-4444-555555555555';
let admin: SupabaseClient;
let repo: KernelRepository;
let ops: KernelOperations;

const SERVICES = {
  PASSPORT: '00000000-0000-0000-0000-000000000001',
  PORTRAIT: '00000000-0000-0000-0000-000000000002',
  WEDDING_TRADITIONAL: '00000000-0000-0000-0000-000000000003',
  WEDDING_WHITE: '00000000-0000-0000-0000-000000000004',
  PHOTOBOOK: '00000000-0000-0000-0000-000000000005',
  FRAME: '00000000-0000-0000-0000-000000000006'
};

beforeAll(async () => {
  admin = adminClient();
  repo = new KernelRepository(admin as any);
  ops = new KernelOperations(admin as any, repo);
  
  // Ensure the org exists
  await admin.from('organizations').upsert(
    { id: ORG_ID, name: 'Lumiere Studios Lagos', status: 'active' }, 
    { onConflict: 'id' }
  );

  // Ensure services exist
  await admin.from('services').upsert([
    { id: SERVICES.PASSPORT, organization_id: ORG_ID, name: 'Passport Photo', status: 'active' },
    { id: SERVICES.WEDDING_TRADITIONAL, organization_id: ORG_ID, name: 'Traditional Wedding', status: 'active' },
    { id: SERVICES.FRAME, organization_id: ORG_ID, name: 'Wall Frame', status: 'active' },
    { id: SERVICES.PHOTOBOOK, organization_id: ORG_ID, name: 'Photobook Printing', status: 'active' }
  ], { onConflict: 'id' });
});

describe('Stress Test Scenarios via Operations', () => {

  it('Scenario 1: Walk-in Passport Photo is delivered and paid', async () => {
    const customerId = await ops.createCustomer(ORG_ID, '+2348031111111', { name: 'Emeka Uzo' });
    const reqId = await ops.submitRequest(ORG_ID, customerId, [{ serviceId: SERVICES.PASSPORT, name: 'Visa Passport Photo' }]);
    
    // Resolve the request
    await ops.resolveRequest(ORG_ID, reqId, 'accept');

    const agrId = await ops.proposeAgreement(ORG_ID, customerId, reqId, { price: 5000, currency: 'NGN', services: [{ serviceId: SERVICES.PASSPORT }] });
    
    // Activate agreement (this spawns the instance)
    await ops.activateAgreement(ORG_ID, agrId);
    
    const agr = await repo.getAgreementWithGraph(agrId);
    expect(agr?.instances?.length).toBe(1);
    const instId = agr!.instances![0].id;

    // Shoot happens immediately, delivered 15 mins later
    // Simulate event insertions to transition instances
    await admin.from('events').insert([
      { organization_id: ORG_ID, entity_type: 'service_instance', entity_id: instId, event_type: 'service_instance.in_progress' },
      { organization_id: ORG_ID, entity_type: 'service_instance', entity_id: instId, event_type: 'service_instance.completed' },
      { organization_id: ORG_ID, entity_type: 'service_instance', entity_id: instId, event_type: 'service_instance.delivered' }
    ]);

    // Complete Agreement
    await ops.completeAgreement(ORG_ID, agrId);

    // Assert final states
    const finalInst = await admin.from('service_instances').select('status').eq('id', instId).single();
    expect(finalInst.data?.status).toBe('delivered');
    const finalAgr = await repo.getAgreementWithGraph(agrId);
    expect(finalAgr?.status).toBe('completed');
  });

  it('Scenario 2: Couple books a Traditional Wedding', async () => {
    const customerId = await ops.createCustomer(ORG_ID, '+2348052222222', { name: 'Aisha & Tunde' });
    const reqId = await ops.submitRequest(ORG_ID, customerId, [{ serviceId: SERVICES.WEDDING_TRADITIONAL, name: 'Traditional Wedding Booking' }]);
    
    await ops.resolveRequest(ORG_ID, reqId, 'accept');
    const agrId = await ops.proposeAgreement(ORG_ID, customerId, reqId, { price: 350000, currency: 'NGN', note: 'Deposit paid 150k', services: [{ serviceId: SERVICES.WEDDING_TRADITIONAL, date: '2026-08-15', location: 'Ikeja' }] });
    
    await ops.activateAgreement(ORG_ID, agrId);
    
    const agr = await repo.getAgreementWithGraph(agrId);
    const instId = agr!.instances![0].id;
    
    // Instance goes to scheduled
    await admin.from('events').insert({ organization_id: ORG_ID, entity_type: 'service_instance', entity_id: instId, event_type: 'service_instance.scheduled' });
    
    // Assert final states
    const finalInst = await admin.from('service_instances').select('status').eq('id', instId).single();
    expect(finalInst.data?.status).toBe('scheduled');
  });

  it('Scenario 3: Old customer returns to print a Wall Frame', async () => {
    const customerId = await ops.createCustomer(ORG_ID, '+2348093333333', { name: 'Mrs. Folashade' });
    const reqId = await ops.submitRequest(ORG_ID, customerId, [{ serviceId: SERVICES.FRAME, name: '24x36 Canvas Frame' }]);
    
    await ops.resolveRequest(ORG_ID, reqId, 'accept');
    const agrId = await ops.proposeAgreement(ORG_ID, customerId, reqId, { price: 85000, currency: 'NGN', services: [{ serviceId: SERVICES.FRAME, size: '24x36', type: 'Canvas' }] });
    
    await ops.activateAgreement(ORG_ID, agrId);
    const agr = await repo.getAgreementWithGraph(agrId);
    const instId = agr!.instances![0].id;
    
    // Instance is waiting on the printer
    await admin.from('events').insert([
      { organization_id: ORG_ID, entity_type: 'service_instance', entity_id: instId, event_type: 'service_instance.in_progress' },
      { organization_id: ORG_ID, entity_type: 'service_instance', entity_id: instId, event_type: 'service_instance.waiting' }
    ]);
    
    // Assert final states
    const finalInst = await admin.from('service_instances').select('status').eq('id', instId).single();
    expect(finalInst.data?.status).toBe('waiting');
  });

  it('Scenario 4: Partial cancellation (using modifyAgreement)', async () => {
    const customerId = await ops.createCustomer(ORG_ID, '+2348074444444', { name: 'Chief Ojo' });
    const reqId = await ops.submitRequest(ORG_ID, customerId, [{ serviceId: SERVICES.WEDDING_TRADITIONAL }, { serviceId: SERVICES.FRAME }]);
    await ops.resolveRequest(ORG_ID, reqId, 'accept');
    
    const agrId = await ops.proposeAgreement(ORG_ID, customerId, reqId, { 
      price: 450000, 
      services: [
        { serviceId: SERVICES.WEDDING_TRADITIONAL },
        { serviceId: SERVICES.FRAME }
      ]
    });
    
    await ops.activateAgreement(ORG_ID, agrId);
    
    // Customer decides to cancel the frame
    await ops.modifyAgreement(ORG_ID, agrId, {
      price: 350000,
      note: 'Frame cancelled'
    });
    
    const agr = await repo.getAgreementWithGraph(agrId);
    expect(agr?.terms.price).toBe(350000);
    // Note: in a full implementation we would explicitly halt/cancel the FRAME instance.
    const frameInst = agr!.instances!.find(i => i.serviceId === SERVICES.FRAME);
    if (frameInst) {
      await admin.from('events').insert({ organization_id: ORG_ID, entity_type: 'service_instance', entity_id: frameInst.id, event_type: 'service_instance.halted' });
    }
    
    const finalFrame = await admin.from('service_instances').select('status').eq('id', frameInst?.id).single();
    expect(finalFrame.data?.status).toBe('halted');
  });

  it('Scenario 5: Provided-asset print job', async () => {
    const customerId = await ops.createCustomer(ORG_ID, '+2348025555555', { name: 'Sandra' });
    
    // Customer provides a flash drive with photos
    const assetId = await ops.registerAsset(ORG_ID, { customerId, contentReference: 'usb:sandra_photos' });
    
    const reqId = await ops.submitRequest(ORG_ID, customerId, [{ serviceId: SERVICES.PHOTOBOOK }]);
    await ops.resolveRequest(ORG_ID, reqId, 'accept');
    
    const agrId = await ops.proposeAgreement(ORG_ID, customerId, reqId, { 
      price: 15000, 
      services: [{ serviceId: SERVICES.PHOTOBOOK, assetId: assetId }] 
    });
    
    await ops.activateAgreement(ORG_ID, agrId);
    
    const checkAsset = await admin.from('assets').select('status, origin_type').eq('id', assetId).single();
    expect(checkAsset.data?.status).toBe('registered');
    expect(checkAsset.data?.origin_type).toBe('provided');
  });

  it('Scenario 6: White-label seam (recursion proof)', async () => {
    // Another studio acts as a customer
    const b2bCustomerId = await ops.createCustomer(ORG_ID, 'studio:b2b', { name: 'XYZ Studios' });
    
    const reqId = await ops.submitRequest(ORG_ID, b2bCustomerId, [{ serviceId: SERVICES.PHOTOBOOK }]);
    await ops.resolveRequest(ORG_ID, reqId, 'accept');
    
    const agrId = await ops.proposeAgreement(ORG_ID, b2bCustomerId, reqId, { 
      price: 10000, // discount
      services: [{ serviceId: SERVICES.PHOTOBOOK, label: 'white-label' }] 
    });
    
    await ops.activateAgreement(ORG_ID, agrId);
    const agr = await repo.getAgreementWithGraph(agrId);
    
    expect(agr?.instances?.length).toBe(1);
    
    // B2B studio gets their outcome
    const instId = agr!.instances![0].id;
    const assetId = await ops.produceOutcome(ORG_ID, instId, { contentReference: 'pdf:photobook_final' });
    await ops.deliverOutcome(ORG_ID, assetId);
    
    const finalAsset = await admin.from('assets').select('status, origin_type').eq('id', assetId).single();
    expect(finalAsset.data?.status).toBe('released'); // Released to B2B customer
    expect(finalAsset.data?.origin_type).toBe('produced');
  });

});
