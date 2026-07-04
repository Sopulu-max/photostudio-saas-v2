'use server';

import { createClient } from '@/lib/supabase/server';
import { KernelRepository } from '@/lib/domains/kernel/repository';

export async function executeQuickSale(formData: FormData) {
  const orgId = '11111111-2222-3333-4444-555555555555'; // Seed Organization
  
  const customerName = formData.get('customerName') as string;
  const customerPhone = formData.get('customerPhone') as string;
  const serviceId = formData.get('serviceId') as string;
  const priceStr = formData.get('price') as string;
  const price = parseInt(priceStr, 10) || 0;

  try {
    const supabase = await createClient();
    const repo = new KernelRepository(supabase);

    // 1. Customer
    let customer = await repo.createCustomer(orgId, customerPhone, { name: customerName });
    
    if (!customer) {
      throw new Error('Database connection failed.');
    }

    // 2. Request
    const request = await repo.createRequest(orgId, customer.id, { serviceId, name: 'Walk-in Quick Sale' });
    if (!request) throw new Error('Failed to create request');

    // 3. Agreement
    const agreement = await repo.createAgreement(orgId, customer.id, request.id, { price, currency: 'NGN' });
    if (!agreement) throw new Error('Failed to create agreement');

    // 4. Instance
    const instance = await repo.createServiceInstance(orgId, agreement.id, serviceId, { origin: 'Walk-in' });
    if (!instance) throw new Error('Failed to create instance');

    return { success: true, agreement, instance, customer, request };
  } catch (error) {
    console.error('Quick Sale Error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'An unknown error occurred during the quick sale.' 
    };
  }
}
