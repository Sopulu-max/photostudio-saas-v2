'use server';

import { createClient } from '@/lib/supabase/server';
import { KernelOperations } from '@/lib/domains/kernel/operations';
import { getOrgId } from '@/lib/auth';

export async function executeQuickSale(formData: FormData) {
  const orgId = await getOrgId();
  if (!orgId) {
    return { success: false, error: 'Not authenticated — no org claim in session.' };
  }

  const customerName = formData.get('customerName') as string;
  const customerPhone = formData.get('customerPhone') as string;
  const serviceId = formData.get('serviceId') as string;
  const priceStr = formData.get('price') as string;
  const price = parseInt(priceStr, 10) || 0;

  try {
    const supabase = await createClient();
    const { KernelRepository } = await import('@/lib/domains/kernel/repository');
    const repo = new KernelRepository(supabase);
    const ops = new KernelOperations(supabase, repo);

    // 1. Customer (idempotent lookup-or-create)
    const customerId = await ops.createCustomer(orgId, customerPhone, { name: customerName });
    if (!customerId) throw new Error('Database connection failed.');

    // 2. Request
    const requestId = await ops.submitRequest(orgId, customerId, [{ serviceId, name: 'Walk-in Quick Sale' }]);
    if (!requestId) throw new Error('Failed to create request');
    await ops.resolveRequest(orgId, requestId, 'accept');

    // 3. Agreement
    const agreementId = await ops.proposeAgreement(orgId, customerId, requestId, { price, currency: 'NGN', services: [{ serviceId }] });
    if (!agreementId) throw new Error('Failed to create agreement');

    // 4. Activate Agreement (Spawns the service instance automatically)
    await ops.activateAgreement(orgId, agreementId);

    // Fetch the spawned instance to return for the receipt view
    const { data: instanceRecord } = await supabase
      .from('service_instances')
      .select('*')
      .eq('agreement_id', agreementId)
      .single();

    const instance = instanceRecord ? {
      id: instanceRecord.id,
      organizationId: instanceRecord.organization_id,
      agreementId: instanceRecord.agreement_id,
      serviceId: instanceRecord.service_id,
      status: instanceRecord.status,
      fulfillmentData: instanceRecord.fulfillment_data,
      createdAt: instanceRecord.created_at,
      updatedAt: instanceRecord.updated_at
    } : null;

    return { success: true, agreementId, customerId, requestId, instance };
  } catch (error) {
    console.error('Quick Sale Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred during the quick sale.',
    };
  }
}
