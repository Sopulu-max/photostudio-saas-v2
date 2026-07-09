'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function loginCustomer(orgId: string, identifier: string) {
  const supabase = await createClient();
  
  // Find customer
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('organization_id', orgId)
    .eq('primary_identifier', identifier)
    .single();
    
  if (customer) {
    const cookieStore = await cookies();
    cookieStore.set(`portal_auth_${orgId}`, customer.id, { path: '/' });
    redirect(`/${orgId}/portal`);
  } else {
    throw new Error('Customer not found');
  }
}

export async function logoutCustomer(orgId: string) {
  const cookieStore = await cookies();
  cookieStore.delete(`portal_auth_${orgId}`);
  redirect(`/${orgId}/portal/login`);
}

export async function getPortalCustomer(orgId: string) {
  const cookieStore = await cookies();
  const customerId = cookieStore.get(`portal_auth_${orgId}`)?.value;
  return customerId || null;
}
