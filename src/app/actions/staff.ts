"use server";

import { createClient } from '@/lib/supabase/server';
import { getOrgId } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function createStaffMember(formData: FormData) {
  const orgId = await getOrgId();
  if (!orgId) throw new Error('Unauthorized');

  const name = formData.get('name') as string;
  const email = formData.get('email') as string;
  const role = formData.get('role') as string || 'staff';

  const supabase = await createClient();
  const { error } = await (supabase.from as any)('staff').insert({
    organization_id: orgId,
    name,
    email,
    role
  });

  if (error) {
    console.error('Failed to create staff member:', error);
    throw new Error('Failed to create staff member');
  }

  revalidatePath('/(internal)/staff', 'page');
  return { success: true };
}

export async function createCapability(formData: FormData) {
  const orgId = await getOrgId();
  if (!orgId) throw new Error('Unauthorized');

  const name = formData.get('name') as string;
  const description = formData.get('description') as string;

  const supabase = await createClient();
  const { error } = await (supabase.from as any)('capabilities').insert({
    organization_id: orgId,
    name,
    description
  });

  if (error) {
    console.error('Failed to create capability:', error);
    throw new Error('Failed to create capability');
  }

  revalidatePath('/(internal)/staff', 'page');
  return { success: true };
}

export async function assignCapability(staffId: string, capabilityId: string) {
  const orgId = await getOrgId();
  if (!orgId) throw new Error('Unauthorized');

  const supabase = await createClient();
  
  // Verify staff belongs to org
  const { data: staff, error: staffError } = await (supabase.from as any)('staff').select('id').eq('id', staffId).eq('organization_id', orgId).single();
  if (staffError || !staff) throw new Error('Unauthorized or Staff not found');

  const { error } = await (supabase.from as any)('staff_capabilities').insert({
    staff_id: staffId,
    capability_id: capabilityId
  });

  if (error) {
    console.error('Failed to assign capability:', error);
    throw new Error('Failed to assign capability');
  }

  revalidatePath('/(internal)/staff', 'page');
  return { success: true };
}