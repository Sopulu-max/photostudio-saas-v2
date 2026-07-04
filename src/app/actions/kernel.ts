"use server";

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { getOrgId } from '@/lib/auth';

export async function transitionInstance(instanceId: string, eventSuffix: string) {
  const orgId = await getOrgId();
  if (!orgId) {
    return { success: false, error: 'Not authenticated' };
  }

  const supabase = await createClient();
  const repo = new KernelRepository(supabase);

  try {
    const success = await repo.transitionInstance(orgId, instanceId, eventSuffix, undefined);

    if (success) {
      revalidatePath('/instances');
      revalidatePath('/finance');
      revalidatePath('/specimen');
    }

    return { success };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}
