"use server";

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { KernelRepository } from '@/lib/domains/kernel/repository';
import { KernelState } from '@/components/ontology/StateBadge';

export async function transitionInstanceStatus(instanceId: string, newStatus: KernelState) {
  const supabase = await createClient();
  const repo = new KernelRepository(supabase);
  
  const success = await repo.updateInstanceStatus(instanceId, newStatus);
  
  if (success) {
    // Revalidate the pipeline and ledger pages so they reflect the new state instantly
    revalidatePath('/instances');
    revalidatePath('/finance');
    revalidatePath('/specimen'); // For tests
  }
  
  return { success };
}
