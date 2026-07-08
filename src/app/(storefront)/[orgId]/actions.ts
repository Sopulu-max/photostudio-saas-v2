'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function submitPublicRequest(formData: FormData) {
  const supabase = createAdminClient();
  const repo = new KernelRepository(supabase);

  const orgId = formData.get('orgId') as string;
  const serviceId = formData.get('serviceId') as string;
  const clientName = formData.get('clientName') as string;
  const clientEmail = formData.get('clientEmail') as string;
  const desiredDate = formData.get('desiredDate') as string;
  const message = formData.get('message') as string;

  if (!orgId || !serviceId || !clientName || !clientEmail) {
    throw new Error('Missing required fields');
  }

  // 1. Find or Create Customer
  let customer = await repo.getCustomerByIdentifier(orgId, clientEmail);
  
  if (!customer) {
    customer = await repo.createCustomer(orgId, clientEmail, {
      name: clientName,
      email: clientEmail,
      source: 'storefront'
    });
  } else {
    // We could update the profileData here if name changed, but keep it simple for now
  }

  // 2. Create the Request
  const requestedServices = [
    {
      serviceId,
      desiredDate,
      message
    }
  ];

  await repo.createRequest(orgId, customer.id, requestedServices);

  // 3. Revalidate and Redirect
  revalidatePath(`/${orgId}`);
  redirect(`/${orgId}/success`);
}
